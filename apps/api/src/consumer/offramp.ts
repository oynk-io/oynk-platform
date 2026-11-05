import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Identity } from './auth.js';
import { accountFor, FundingError, transaction } from './service.js';
import { protocolContracts } from './protocol.js';
import { orchestratorOfframpQuote } from './stellarBalance.js';
import { fiatPayoutProvider } from './providers/index.js';
import { createRampTransaction } from '../ramp/service.js';
import { orchestratorRequest } from '../ramp/protocol.js';
import { rampProvider } from '../ramp/soroban.js';
import { limits, transactionLimits } from './money.js';

const amountSchema=z.string().regex(/^(0|[1-9]\d{0,30})(\.\d{1,7})?$/);
const destinationSchema=z.object({accountNumber:z.string().regex(/^\d{10}$/),bankCode:z.string().trim().min(2).max(20),accountName:z.string().trim().min(2).max(160)});
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const atomic=(value:string)=>{const parsed=amountSchema.safeParse(value);if(!parsed.success)throw new FundingError('Enter a valid USDC amount with at most seven decimals.');const[whole,fraction='']=parsed.data.split('.');const result=BigInt(whole)*10_000_000n+BigInt(fraction.padEnd(7,'0'));if(result<=0n)throw new FundingError('Enter a positive USDC amount.');return result;};

export async function payoutBanks(){return{banks:await fiatPayoutProvider().listBanks('NGN')};}
export async function resolvePayoutDestination(raw:unknown){const parsed=z.object({accountNumber:z.string().regex(/^\d{10}$/),bankCode:z.string().trim().min(2).max(20)}).safeParse(raw);if(!parsed.success)throw new FundingError('Enter valid bank details.');return fiatPayoutProvider().resolveDestination(parsed.data);}

export async function createOfframpQuote(identity:Identity,raw:unknown){
 const parsed=z.object({amount:amountSchema,destination:destinationSchema}).safeParse(raw);if(!parsed.success)throw new FundingError('Review the USDC amount and bank details.');
 const owner=await accountFor(identity);if(owner.tier===0)throw new FundingError('Activate Oynk Pay before withdrawing naira.',409);
 const usdcAmount=atomic(parsed.data.amount);const contracts=protocolContracts(identity.network);const quote=await orchestratorOfframpQuote(identity,contracts.orchestrator,usdcAmount);const provider=fiatPayoutProvider();
 if(quote.fiatAmount>transactionLimits[owner.tier])throw new FundingError('This amount is above your per-transaction limit.',409);
 if(!provider.configured||(provider.environment==='live')!==(identity.network==='PUBLIC'))throw new FundingError('Naira withdrawals are being configured for this network.',503);
 const resolved=await provider.resolveDestination(parsed.data.destination);if(resolved.accountName!==parsed.data.destination.accountName||resolved.accountNumber!==parsed.data.destination.accountNumber)throw new FundingError('The bank account details changed. Resolve the account again.',409);
 const recipient=await provider.createDestination({name:resolved.accountName,accountNumber:resolved.accountNumber,bankCode:resolved.bankCode,currency:'NGN'});
 return transaction(async db=>{const account=await accountFor(identity,db,true);const used=await db.query(`SELECT COALESCE(SUM(r.fiat_amount_minor),0)::TEXT AS total FROM ramp_transactions r LEFT JOIN consumer_offramp_intents i ON i.ramp_transaction_id=r.id WHERE r.consumer_account_id=$1 AND r.direction='OFF_RAMP' AND r.created_at>NOW()-INTERVAL '24 hours' AND r.state NOT IN ('FAILED','REJECTED','CANCELLED','REFUNDED') AND (i.state IS NULL OR i.state<>'quoted' OR i.expires_at>NOW())`,[account.id]);if(BigInt(used.rows[0].total)+quote.fiatAmount>limits[account.tier])throw new FundingError('This withdrawal exceeds your remaining daily limit.',409);const reference=`oynk-offramp-${randomUUID()}`;const requestId=hash(reference);const providerReference=hash(`${provider.id}:${reference}`);const deadlineLedger=Math.min(quote.validUntilLedger,quote.latestLedger+17_280);const expiresAt=new Date(Date.now()+5*60_000).toISOString();
  const ramp=await createRampTransaction(db,{reference,idempotencyKey:`consumer-off-ramp:${reference}`,direction:'OFF_RAMP',consumerAccountId:account.id,subjectReference:account.subject,walletAddress:account.wallet,network:account.network,fiatCurrency:'NGN',fiatAmountMinor:quote.fiatAmount,usdcAmountAtomic:quote.usdcAmount,provider:provider.id,destinationFingerprint:hash(`${resolved.bankCode}:${resolved.accountNumber}`),metadata:{source:'consumer_offramp',requestId,providerAddress:rampProvider(identity.network),rateContract:contracts.orchestrator,rateVersion:quote.rateVersion.toString(),rateValidUntilLedger:quote.validUntilLedger},actor:{type:'CONSUMER',reference:account.id}});
  const storedDestination={provider:provider.id,destinationToken:recipient.destinationToken,accountName:resolved.accountName,accountNumberLast4:resolved.accountNumber.slice(-4),bankCode:resolved.bankCode};
  const result={reference,requestId,providerReference,providerAddress:rampProvider(identity.network),orchestrator:contracts.orchestrator,usdcAmountAtomic:quote.usdcAmount.toString(),fiatAmountMinor:quote.fiatAmount.toString(),rateKoboPerUsdc:quote.fiatPerUsdc.toString(),rateVersion:quote.rateVersion.toString(),deadlineLedger,expiresAt,accountName:resolved.accountName,accountNumberLast4:resolved.accountNumber.slice(-4),approvalState:ramp.approval_state,state:ramp.state};
  await db.query(`UPDATE ramp_transactions SET orchestrator_request_id=$2,onchain_state='NOT_CREATED',destination=$3 WHERE id=$1`,[ramp.id,requestId,storedDestination]);
  await db.query(`INSERT INTO consumer_offramp_intents(reference,account_id,ramp_transaction_id,quote,destination,expires_at) VALUES($1,$2,$3,$4,$5,$6)`,[reference,account.id,ramp.id,result,storedDestination,expiresAt]);return result;
 });
}

function stateName(value:unknown):string{if(typeof value==='string')return value;if(value&&typeof value==='object'){const record=value as Record<string,unknown>;if(typeof record.tag==='string')return record.tag;if(typeof record.status==='string')return record.status;return JSON.stringify(value);}return'';}
export async function confirmOfframpFunding(identity:Identity,reference:string,raw:unknown){
 const parsed=z.object({createTxHash:z.string().regex(/^[a-f0-9]{64}$/i),fundingTxHash:z.string().regex(/^[a-f0-9]{64}$/i)}).safeParse(raw);if(!parsed.success)throw new FundingError('The Stellar transaction details are invalid.');
 return transaction(async db=>{const account=await accountFor(identity,db,true);const found=await db.query(`SELECT i.*,r.orchestrator_request_id,r.approval_state,r.state AS ramp_state,r.metadata FROM consumer_offramp_intents i JOIN ramp_transactions r ON r.id=i.ramp_transaction_id WHERE i.reference=$1 AND i.account_id=$2 FOR UPDATE`,[reference,account.id]);const intent=found.rows[0];if(!intent)throw new FundingError('Withdrawal request not found.',404);if(['funded','pending_approval','processing','completed'].includes(intent.state))return{reference,state:intent.state,approvalState:intent.approval_state};
  const orchestrator=typeof intent.metadata?.rateContract==='string'?intent.metadata.rateContract:protocolContracts(identity.network).orchestrator;const chain=await orchestratorRequest(identity.network,intent.orchestrator_request_id,orchestrator);if(!chain.request||String((chain.request as any).claimant)!==account.wallet||!stateName((chain.request as any).status).includes('AwaitingPayout'))throw new FundingError('The off-ramp escrow is not confirmed on Stellar.',409);
  const next=intent.approval_state==='PENDING'?'pending_approval':'funded';await db.query(`UPDATE consumer_offramp_intents SET state=$2,create_tx_hash=$3,funding_tx_hash=$4,updated_at=NOW() WHERE reference=$1`,[reference,next,parsed.data.createTxHash,parsed.data.fundingTxHash]);await db.query(`UPDATE ramp_transactions SET state=$2,onchain_state='AWAITING_PAYOUT',metadata=metadata||$3::jsonb,updated_at=NOW() WHERE id=$1`,[intent.ramp_transaction_id,intent.approval_state==='PENDING'?'PENDING_APPROVAL':'APPROVED',JSON.stringify({onchainFunded:true,createTxHash:parsed.data.createTxHash,fundingTxHash:parsed.data.fundingTxHash})]);return{reference,state:next,approvalState:intent.approval_state};
 });
}

export async function cancelOfframpQuote(identity:Identity,reference:string,source?:string){
 const account=await accountFor(identity);
 const initial=(await (await import('../db/pool.js')).pool.query(`SELECT i.state,r.id ramp_id,r.state ramp_state,r.network,r.orchestrator_request_id,r.metadata
   FROM consumer_offramp_intents i JOIN ramp_transactions r ON r.id=i.ramp_transaction_id
   WHERE i.reference=$1 AND i.account_id=$2`,[reference,account.id])).rows[0];
 if(!initial||(source&&initial.metadata?.source!==source))throw new FundingError('Conversion request not found.',404);
 if(['cancelled','expired'].includes(initial.state))return{reference,state:initial.state};
 if(initial.state!=='quoted')throw new FundingError('This conversion has already been submitted and cannot be cancelled.',409);
 const orchestrator=typeof initial.metadata?.rateContract==='string'?initial.metadata.rateContract:protocolContracts(initial.network).orchestrator;
 const chain=await orchestratorRequest(initial.network,initial.orchestrator_request_id,orchestrator);
 if(chain.request)throw new FundingError('This conversion has already been submitted. Check its status instead.',409);
 return transaction(async db=>{
  const current=(await db.query(`SELECT i.state,r.id ramp_id,r.state ramp_state,r.onchain_state,r.provider_reference
    FROM consumer_offramp_intents i JOIN ramp_transactions r ON r.id=i.ramp_transaction_id
    WHERE i.reference=$1 AND i.account_id=$2 FOR UPDATE OF i,r`,[reference,account.id])).rows[0];
  if(!current)throw new FundingError('Conversion request not found.',404);
  if(['cancelled','expired'].includes(current.state))return{reference,state:current.state};
  if(current.state!=='quoted'||current.onchain_state!=='NOT_CREATED'||current.provider_reference)throw new FundingError('This conversion has already been submitted and cannot be cancelled.',409);
  await db.query(`UPDATE consumer_offramp_intents SET state='cancelled',failure_code='CANCELLED_BY_USER',failure_message='The quote was cancelled before funding.',updated_at=NOW() WHERE reference=$1`,[reference]);
  await db.query(`UPDATE ramp_transactions SET state='CANCELLED',failure_code='CANCELLED_BY_USER',failure_reason='The quote was cancelled before funding.',updated_at=NOW() WHERE id=$1`,[current.ramp_id]);
  await db.query(`INSERT INTO ramp_transaction_events(id,transaction_id,event_type,from_state,to_state,actor_type,actor_reference,details)
    VALUES($1,$2,'QUOTE_CANCELLED',$3,'CANCELLED','CONSUMER',$4,$5)`,[randomUUID(),current.ramp_id,current.ramp_state,account.id,{reason:'User left the conversion before funding'}]);
  return{reference,state:'cancelled'};
 });
}

export async function getOfframp(identity:Identity,reference:string){const account=await accountFor(identity);const result=await (await import('../db/pool.js')).pool.query(`SELECT i.reference,i.state,i.quote,i.destination-'destinationToken' AS destination,i.expires_at AS "expiresAt",i.failure_code AS "failureCode",i.failure_message AS "failureMessage",r.approval_state AS "approvalState",r.stellar_transaction_hash AS "stellarTransactionHash",r.provider_reference AS "providerReference" FROM consumer_offramp_intents i JOIN ramp_transactions r ON r.id=i.ramp_transaction_id WHERE i.reference=$1 AND i.account_id=$2`,[reference,account.id]);if(!result.rows[0])throw new FundingError('Withdrawal request not found.',404);return result.rows[0];}
