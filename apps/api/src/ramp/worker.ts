import { createHash } from 'node:crypto';
import { Address, StrKey, nativeToScVal } from '@stellar/stellar-sdk';
import { pool } from '../db/pool.js';
import { protocolContracts } from '../consumer/protocol.js';
import { orchestratorOnrampQuote } from '../consumer/stellarBalance.js';
import { fiatPayoutProvider } from '../consumer/providers/index.js';
import { beginRampExecution, finishRampExecution } from './service.js';
import { bytes32, contractAddress, i128, rampProvider, submitRampInvocation, u32, u64 } from './soroban.js';
import { orchestratorRequest } from './protocol.js';
import { rampLog } from './observability.js';

let running=false;
const evidence=(value:string)=>createHash('sha256').update(value).digest('hex');
const requestId=(reference:string)=>createHash('sha256').update(reference).digest('hex');
const pinnedOrchestrator=(row:any)=>typeof row.metadata?.rateContract==='string'&&StrKey.isValidContract(row.metadata.rateContract)?row.metadata.rateContract:protocolContracts(row.network).orchestrator;

async function completeOnramp(row:any){
 const key=`onramp-confirm:${row.id}`;await beginRampExecution({transactionId:row.id,idempotencyKey:key,operation:'CONFIRM_ONRAMP'});
 try{const hash=await submitRampInvocation(row.network,pinnedOrchestrator(row),'confirm_onramp',[bytes32(row.orchestrator_request_id),bytes32(evidence(`${row.provider}:${row.provider_reference}:${row.reference}`))]);await pool.query(`UPDATE ramp_transactions SET onchain_state='COMPLETED' WHERE id=$1`,[row.id]);await pool.query(`UPDATE consumer_deposit_intents SET state='received' WHERE ramp_transaction_id=$1`,[row.id]);await finishRampExecution({transactionId:row.id,idempotencyKey:key,succeeded:true,providerReference:row.provider_reference,stellarTransactionHash:hash});}
 catch(error){await finishRampExecution({transactionId:row.id,idempotencyKey:key,succeeded:false,errorCode:'ONRAMP_SETTLEMENT_FAILED',errorReason:error instanceof Error?error.message:'Unknown error'});throw error;}
}

async function recoverInterruptedOnramp(row:any){
 const id=requestId(row.reference);const current=protocolContracts(row.network).orchestrator;
 const quoted=pinnedOrchestrator(row);const candidates=[quoted,...(quoted===current?[]:[current])];
 for(const contract of candidates){
  const existing=await orchestratorRequest(row.network,id,contract);
  if(existing.request){
   const state=JSON.stringify((existing.request as any).status);
   if(state.includes('Completed')){
    const key=`onramp-reconcile:${row.id}`;await beginRampExecution({transactionId:row.id,idempotencyKey:key,operation:'RECONCILE_ONRAMP'});
    await pool.query(`UPDATE consumer_deposit_intents SET state='received' WHERE ramp_transaction_id=$1`,[row.id]);
    await pool.query(`UPDATE ramp_transactions SET orchestrator_request_id=$2,onchain_state='COMPLETED',metadata=metadata||$3::jsonb WHERE id=$1`,[row.id,id,JSON.stringify({rateContract:contract,recoveredAfterDeployment:true})]);
    await finishRampExecution({transactionId:row.id,idempotencyKey:key,succeeded:true,providerReference:row.provider_reference});return;
   }
   await pool.query(`UPDATE ramp_transactions SET orchestrator_request_id=$2,onchain_state='AWAITING_FIAT',metadata=metadata||$3::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,id,JSON.stringify({rateContract:contract,recoveredAfterDeployment:true})]);return;
  }
 }
 const quote=await orchestratorOnrampQuote({network:row.network},current,BigInt(row.fiat_amount_minor));
 if(quote.usdcAmount!==BigInt(row.usdc_amount_atomic))throw new Error('Recovered quote does not match the paid transaction.');
 const providerAddress=rampProvider(row.network);const providerReference=evidence(`${row.provider}:${row.reference}`);const deadline=Math.min(quote.validUntilLedger,quote.latestLedger+17_280);
 const createHashValue=await submitRampInvocation(row.network,current,'create_onramp_for',[contractAddress(row.wallet_address),i128(row.fiat_amount_minor),i128(row.usdc_amount_atomic),u64(quote.rateVersion),bytes32(providerReference),contractAddress(providerAddress),bytes32(id),u32(deadline)]);
 await pool.query(`UPDATE ramp_transactions SET orchestrator_request_id=$2,onchain_state='AWAITING_FIAT',stellar_transaction_hash=$3,metadata=metadata||$4::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,id,createHashValue,JSON.stringify({rateContract:current,providerReference,providerAddress,deadlineLedger:deadline,recoveredAfterDeployment:true})]);
}

async function startOfframp(row:any){
 const key=`offramp-payout:${row.id}`;await beginRampExecution({transactionId:row.id,idempotencyKey:key,operation:'PAYOUT'});const provider=fiatPayoutProvider(row.provider);const destination=row.destination as {destinationToken?:string};if(!destination?.destinationToken)throw new Error('Off-ramp destination is unavailable.');
 const payout=await provider.createPayout({reference:`offramp-${String(row.id).replaceAll('-','').slice(0,32)}`,amountMinor:String(row.fiat_amount_minor),currency:'NGN',destinationToken:destination.destinationToken,idempotencyKey:key});
 await pool.query(`UPDATE ramp_transactions SET provider_reference=$2,provider_status=$3,updated_at=NOW() WHERE id=$1`,[row.id,payout.providerReference,payout.status.toUpperCase()]);await pool.query(`UPDATE consumer_offramp_intents SET state='processing',provider_reference=$2,updated_at=NOW() WHERE ramp_transaction_id=$1`,[row.id,payout.providerReference]);
 if(payout.status==='success')await finishOfframp({...row,provider_reference:payout.providerReference},true,key);
 if(payout.status==='failed')await finishOfframp({...row,provider_reference:payout.providerReference},false,key);
}

async function finishOfframp(row:any,successful:boolean,key=`offramp-payout:${row.id}`){
 try{const hash=await submitRampInvocation(row.network,protocolContracts(row.network).orchestrator,'confirm_offramp',[bytes32(row.orchestrator_request_id),nativeToScVal(successful),bytes32(evidence(`${row.provider}:${row.provider_reference}:${successful}:${row.reference}`))]);await pool.query(`UPDATE ramp_transactions SET onchain_state=$2 WHERE id=$1`,[row.id,successful?'COMPLETED':'REFUNDED']);await pool.query(`UPDATE consumer_offramp_intents SET state=$2,completed_at=CASE WHEN $2='completed' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE ramp_transaction_id=$1`,[row.id,successful?'completed':'refunded']);await finishRampExecution({transactionId:row.id,idempotencyKey:key,succeeded:successful,providerReference:row.provider_reference,stellarTransactionHash:hash,errorCode:successful?undefined:'PAYOUT_FAILED',errorReason:successful?undefined:'The fiat payout failed and escrowed USDC was refunded.'});}
 catch(error){await finishRampExecution({transactionId:row.id,idempotencyKey:key,succeeded:false,errorCode:'OFFRAMP_SETTLEMENT_FAILED',errorReason:error instanceof Error?error.message:'Unknown error'});throw error;}
}

async function pollOfframp(row:any){const status=await fiatPayoutProvider(row.provider).verifyPayout(row.provider_reference);if(status.status==='success')await finishOfframp(row,true);else if(status.status==='failed')await finishOfframp(row,false);}

export async function processRampExecutions(){if(running)return;running=true;try{
 const interrupted=(await pool.query(`SELECT * FROM ramp_transactions WHERE direction='ON_RAMP' AND state='APPROVED' AND provider_status='CONFIRMED' AND orchestrator_request_id IS NULL ORDER BY created_at LIMIT 10`)).rows;
 for(const row of interrupted){try{await recoverInterruptedOnramp(row);}catch(error){rampLog('error',{event:'ONRAMP_RECOVERY_FAILED',transactionId:row.id,code:error instanceof Error?error.message.slice(0,120):'UNKNOWN'});}}
 const rows=(await pool.query(`SELECT * FROM ramp_transactions WHERE (direction='ON_RAMP' AND state='APPROVED' AND provider_status='CONFIRMED' AND onchain_state='AWAITING_FIAT') OR (direction='OFF_RAMP' AND state='APPROVED' AND onchain_state='AWAITING_PAYOUT') OR (direction='OFF_RAMP' AND state='PROCESSING' AND provider_reference IS NOT NULL AND onchain_state='AWAITING_PAYOUT') ORDER BY created_at LIMIT 20`)).rows;
 for(const row of rows){try{if(row.direction==='ON_RAMP')await completeOnramp(row);else if(row.state==='APPROVED')await startOfframp(row);else await pollOfframp(row);}catch(error){rampLog('error',{event:'RAMP_WORKER_FAILED',transactionId:row.id,code:error instanceof Error?error.message.slice(0,120):'UNKNOWN'});}}
 }finally{running=false;}}
