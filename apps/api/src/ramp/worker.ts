import { createHash, randomUUID } from 'node:crypto';
import { Address, StrKey, nativeToScVal } from '@stellar/stellar-sdk';
import { pool } from '../db/pool.js';
import { protocolContracts } from '../consumer/protocol.js';
import { orchestratorOnrampQuote } from '../consumer/stellarBalance.js';
import { fiatPayoutProvider } from '../consumer/providers/index.js';
import { beginRampExecution, finishOfframpExecution, finishRampExecution, finishRampPhase, recordPostRefundReconciliation, recordProviderConfirmation } from './service.js';
import { bytes32, contractAddress, i128, rampProvider, submitRampInvocation, u32, u64 } from './soroban.js';
import { orchestratorRequest } from './protocol.js';
import { rampLog } from './observability.js';
import { VfdError } from '../consumer/providers/vfdClient.js';

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
 const payoutRequestReference=`offramp-${String(row.id).replaceAll('-','').slice(0,32)}`;
 await pool.query(`UPDATE ramp_transactions SET provider_reference=$2,provider_status='SUBMITTING',metadata=metadata||$3::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,payoutRequestReference,JSON.stringify({payoutRequestReference})]);
 let payout;
 try{payout=await provider.createPayout({reference:payoutRequestReference,amountMinor:String(row.fiat_amount_minor),currency:'NGN',destinationToken:destination.destinationToken,idempotencyKey:key});}
 catch(error){if(error instanceof VfdError&&error.kind==='unavailable'){await pool.query(`UPDATE ramp_transactions SET provider_status='SUBMISSION_UNKNOWN',metadata=metadata||$2::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify({payoutRetryAfter:new Date(Date.now()+30_000).toISOString(),payoutSubmitAttempts:Number(row.metadata?.payoutSubmitAttempts??0)+1})]);await pool.query(`UPDATE consumer_offramp_intents SET state='processing',provider_reference=$2,updated_at=NOW() WHERE ramp_transaction_id=$1`,[row.id,payoutRequestReference]);}throw error;}
 await pool.query(`UPDATE ramp_transactions SET provider_reference=$2,provider_status=$3,metadata=metadata||$4::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,payout.providerReference,payout.status.toUpperCase(),JSON.stringify({payoutRequestReference})]);await pool.query(`UPDATE consumer_offramp_intents SET state='processing',provider_reference=$2,updated_at=NOW() WHERE ramp_transaction_id=$1`,[row.id,payout.providerReference]);
 if(payout.status==='success')await finishOfframp({...row,provider_reference:payout.providerReference},true,key);
 if(payout.status==='failed')await finishOfframp({...row,provider_reference:payout.providerReference},false,key);
}

async function creditQuickPayConversion(row:any,providerReference:string){
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  await db.query(`INSERT INTO consumer_quick_pay_accounts(account_id) VALUES($1) ON CONFLICT(account_id) DO NOTHING`,[row.consumer_account_id]);
  const inserted=await db.query(`INSERT INTO consumer_quick_pay_ledger_entries(id,account_id,direction,kind,amount_kobo,reference,provider,provider_reference,metadata)
    VALUES($1,$2,'CREDIT','SMART_CONVERSION',$3,$4,'VFD',$5,$6) ON CONFLICT(reference) DO NOTHING RETURNING id`,
    [randomUUID(),row.consumer_account_id,String(row.fiat_amount_minor),row.reference,providerReference,{rampTransactionId:row.id,stellarRequestId:row.orchestrator_request_id}]);
  if(inserted.rowCount)await db.query(`UPDATE consumer_quick_pay_accounts SET balance_kobo=balance_kobo+$2::bigint,updated_at=NOW() WHERE account_id=$1`,[row.consumer_account_id,String(row.fiat_amount_minor)]);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

async function debitQuickPayConversion(row:any,providerReference:string){
 const db=await pool.connect();try{await db.query('BEGIN');const inserted=await db.query(`INSERT INTO consumer_quick_pay_ledger_entries(id,account_id,direction,kind,amount_kobo,reference,provider,provider_reference,metadata)
   VALUES($1,$2,'DEBIT','SMART_CONVERSION',$3,$4,'VFD',$5,$6) ON CONFLICT(reference) DO NOTHING RETURNING id`,[randomUUID(),row.consumer_account_id,String(row.fiat_amount_minor),`quick-pay-to-smart:${row.reference}`,providerReference,{rampTransactionId:row.id,createTxHash:row.metadata?.createTxHash}]);
  if(inserted.rowCount)await db.query(`UPDATE consumer_quick_pay_accounts SET balance_kobo=GREATEST(0,balance_kobo-$2::bigint),updated_at=NOW() WHERE account_id=$1`,[row.consumer_account_id,String(row.fiat_amount_minor)]);
  await db.query(`UPDATE consumer_deposit_intents SET state='settling' WHERE ramp_transaction_id=$1`,[row.id]);await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

async function completeQuickPayCollection(row:any,providerReference:string,key=`quick-pay-collect:${row.id}`){
 await debitQuickPayConversion(row,providerReference);
 const db=await pool.connect();try{await db.query('BEGIN');await recordProviderConfirmation(db,{transactionId:row.id,provider:'VFD',providerReference,providerStatus:'CONFIRMED',actor:{type:'PROVIDER',reference:'VFD'}});await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 await finishRampPhase({transactionId:row.id,idempotencyKey:key,succeeded:true,nextState:'APPROVED',providerReference});
}

async function startQuickPayCollection(row:any){
 const key=`quick-pay-collect:${row.id}`;await beginRampExecution({transactionId:row.id,idempotencyKey:key,operation:'COLLECT_NGN'});
 const destinationToken=String(row.metadata?.destinationToken??''),sourceAccountNumber=String(row.metadata?.sourceAccountNumber??'');if(!destinationToken||!/^\d{10}$/.test(sourceAccountNumber))throw new Error('Dedicated VFD settlement details are unavailable.');
 const payoutRequestReference=`collect-${String(row.id).replaceAll('-','').slice(0,32)}`;
 const payout=await fiatPayoutProvider('VFD').createPayout({reference:payoutRequestReference,amountMinor:String(row.fiat_amount_minor),currency:'NGN',destinationToken,idempotencyKey:key,sourceAccountNumber});
 await pool.query(`UPDATE ramp_transactions SET provider_reference=$2,provider_status=$3,metadata=metadata||$4::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,payout.providerReference,payout.status.toUpperCase(),JSON.stringify({payoutRequestReference})]);
 if(payout.status==='success')await completeQuickPayCollection(row,payout.providerReference,key);
 else if(payout.status==='failed')await finishRampPhase({transactionId:row.id,idempotencyKey:key,succeeded:false,providerReference:payout.providerReference,errorCode:'VFD_COLLECTION_FAILED',errorReason:'VFD could not move naira into Oynk settlement.'});
}

async function pollQuickPayCollection(row:any){const status=await fiatPayoutProvider('VFD').verifyPayout(row.provider_reference);if(status.status==='success')await completeQuickPayCollection(row,status.providerReference);else if(status.status==='failed')await finishRampPhase({transactionId:row.id,idempotencyKey:`quick-pay-collect:${row.id}`,succeeded:false,providerReference:status.providerReference,errorCode:'VFD_COLLECTION_FAILED',errorReason:'VFD could not move naira into Oynk settlement.'});
}

async function finishOfframp(row:any,successful:boolean,key=`offramp-payout:${row.id}`){
 if(successful&&row.metadata?.source==='quick_pay_conversion')await creditQuickPayConversion(row,row.provider_reference);
 let hash:string|undefined,recoveredFromChain=false;
 try{hash=await submitRampInvocation(row.network,pinnedOrchestrator(row),'confirm_offramp',[bytes32(row.orchestrator_request_id),nativeToScVal(successful),bytes32(evidence(`${row.provider}:${row.provider_reference}:${successful}:${row.reference}`))]);}
 catch(submitError){const current=await orchestratorRequest(row.network,row.orchestrator_request_id,pinnedOrchestrator(row));const state=JSON.stringify(current.request);const expected=successful?'Completed':'Refunded';if(!state.includes(expected))throw submitError;recoveredFromChain=true;}
 // A database outage after chain submission must leave the attempt processing.
 // The worker can then read the final chain state and append the missing audit
 // record instead of incorrectly converting a successful refund into failure.
 await finishOfframpExecution({transactionId:row.id,idempotencyKey:key,succeeded:successful,providerReference:row.provider_reference,stellarTransactionHash:hash,recoveredFromChain});
}

async function pollOfframp(row:any){const provider=fiatPayoutProvider(row.provider);try{const status=await provider.verifyPayout(row.provider_reference);if(status.status==='success')await finishOfframp({...row,provider_reference:status.providerReference},true);else if(status.status==='failed')await finishOfframp({...row,provider_reference:status.providerReference},false);}
 catch(error){
  const missing=error instanceof VfdError&&error.code==='VFD_108';const unknown=['SUBMITTING','SUBMISSION_UNKNOWN'].includes(String(row.provider_status));if(!missing||!unknown)throw error;
  const retryAt=Date.parse(String(row.metadata?.payoutRetryAfter??0));if(Number.isFinite(retryAt)&&retryAt>Date.now())return;
  const destination=row.destination as {destinationToken?:string};if(!destination?.destinationToken)throw new Error('Off-ramp destination is unavailable.');
  try{const payout=await provider.createPayout({reference:row.provider_reference,amountMinor:String(row.fiat_amount_minor),currency:'NGN',destinationToken:destination.destinationToken,idempotencyKey:`offramp-payout:${row.id}`});await pool.query(`UPDATE ramp_transactions SET provider_reference=$2,provider_status=$3,metadata=metadata||$4::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,payout.providerReference,payout.status.toUpperCase(),JSON.stringify({payoutRetryAfter:new Date(Date.now()+30_000).toISOString(),payoutSubmitAttempts:Number(row.metadata?.payoutSubmitAttempts??0)+1})]);if(payout.status==='success')await finishOfframp({...row,provider_reference:payout.providerReference},true);else if(payout.status==='failed')await finishOfframp({...row,provider_reference:payout.providerReference},false);}
  catch(retryError){if(retryError instanceof VfdError&&retryError.kind==='unavailable')await pool.query(`UPDATE ramp_transactions SET provider_status='SUBMISSION_UNKNOWN',metadata=metadata||$2::jsonb,updated_at=NOW() WHERE id=$1`,[row.id,JSON.stringify({payoutRetryAfter:new Date(Date.now()+30_000).toISOString(),payoutSubmitAttempts:Number(row.metadata?.payoutSubmitAttempts??0)+1})]);throw retryError;}
 }}

async function reconcilePostRefundPayout(row:any){
 const status=await fiatPayoutProvider(row.provider).verifyPayout(row.provider_reference);
 if(status.status==='processing'||status.status==='pending')return;
 if(status.status==='failed'){
  await recordPostRefundReconciliation({transactionId:row.id,outcome:'PAYOUT_FAILED',providerReference:status.providerReference});
  rampLog('info',{event:'POST_REFUND_PAYOUT_CONFIRMED_FAILED',transactionId:row.id});return;
 }
 await recordPostRefundReconciliation({transactionId:row.id,outcome:'PAYOUT_SUCCEEDED',providerReference:status.providerReference});
 rampLog('error',{event:'POST_REFUND_PAYOUT_SUCCEEDED',transactionId:row.id,code:'MANUAL_RECONCILIATION_REQUIRED'});
}

async function expireAbandonedOfframpQuotes(){
 const candidates=(await pool.query(`SELECT r.*,i.reference intent_reference,i.expires_at
   FROM consumer_offramp_intents i
   JOIN ramp_transactions r ON r.id=i.ramp_transaction_id
   WHERE i.state='quoted' AND i.expires_at<=NOW()
     AND r.onchain_state='NOT_CREATED' AND r.provider_reference IS NULL
     AND r.state IN ('CREATED','POLICY_CHECK','PENDING_APPROVAL')
   ORDER BY i.expires_at LIMIT 20`)).rows;
 for(const row of candidates){
  try{
   const chain=await orchestratorRequest(row.network,row.orchestrator_request_id,pinnedOrchestrator(row));
   if(chain.request)continue;
   const db=await pool.connect();
   try{
    await db.query('BEGIN');
    const cancelled=await db.query(`UPDATE ramp_transactions r SET state='CANCELLED',failure_code='QUOTE_EXPIRED',
      failure_reason='The conversion quote expired before funding.',updated_at=NOW()
      FROM consumer_offramp_intents i
      WHERE r.id=$1 AND i.ramp_transaction_id=r.id AND i.state='quoted' AND i.expires_at<=NOW()
        AND r.onchain_state='NOT_CREATED' AND r.provider_reference IS NULL
        AND r.state IN ('CREATED','POLICY_CHECK','PENDING_APPROVAL')
      RETURNING r.id,r.state`,[row.id]);
    if(cancelled.rowCount){
     await db.query(`UPDATE consumer_offramp_intents SET state='expired',failure_code='QUOTE_EXPIRED',
       failure_message='The conversion quote expired before funding.',updated_at=NOW()
       WHERE ramp_transaction_id=$1 AND state='quoted'`,[row.id]);
     await db.query(`INSERT INTO ramp_transaction_events(id,transaction_id,event_type,from_state,to_state,actor_type,details)
       VALUES($1,$2,'QUOTE_EXPIRED',$3,'CANCELLED','SYSTEM',$4)`,[randomUUID(),row.id,row.state,{reason:'Off-ramp quote expired before funding'}]);
    }
    await db.query('COMMIT');
   }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
  }catch(error){rampLog('error',{event:'QUOTE_EXPIRY_RECONCILIATION_FAILED',transactionId:row.id,code:error instanceof Error?error.message.slice(0,120):'UNKNOWN'});}
 }
}

export async function processRampExecutions(){if(running)return;running=true;try{
 await expireAbandonedOfframpQuotes();
 const postRefund=(await pool.query(`SELECT * FROM ramp_transactions WHERE state='FAILED' AND onchain_state='REFUNDED' AND provider_status='PENDING_AFTER_REFUND' ORDER BY updated_at LIMIT 10`)).rows;
 for(const row of postRefund){try{await reconcilePostRefundPayout(row);}catch(error){rampLog('error',{event:'POST_REFUND_RECONCILIATION_FAILED',transactionId:row.id,code:error instanceof Error?error.message.slice(0,120):'UNKNOWN'});}}
 const interrupted=(await pool.query(`SELECT * FROM ramp_transactions WHERE direction='ON_RAMP' AND state='APPROVED' AND provider_status='CONFIRMED' AND orchestrator_request_id IS NULL ORDER BY created_at LIMIT 10`)).rows;
 for(const row of interrupted){try{await recoverInterruptedOnramp(row);}catch(error){rampLog('error',{event:'ONRAMP_RECOVERY_FAILED',transactionId:row.id,code:error instanceof Error?error.message.slice(0,120):'UNKNOWN'});}}
 const rows=(await pool.query(`SELECT * FROM ramp_transactions WHERE (direction='ON_RAMP' AND state='APPROVED' AND provider_status='CONFIRMED' AND onchain_state='AWAITING_FIAT') OR (direction='ON_RAMP' AND state='APPROVED' AND provider_status IS NULL AND onchain_state='AWAITING_FIAT' AND metadata->>'source'='quick_pay_to_smart') OR (direction='ON_RAMP' AND state='PROCESSING' AND provider_reference IS NOT NULL AND onchain_state='AWAITING_FIAT' AND metadata->>'source'='quick_pay_to_smart') OR (direction='OFF_RAMP' AND state='APPROVED' AND onchain_state='AWAITING_PAYOUT') OR (direction='OFF_RAMP' AND state='PROCESSING' AND provider_reference IS NOT NULL AND onchain_state='AWAITING_PAYOUT') ORDER BY created_at LIMIT 20`)).rows;
 for(const row of rows){try{if(row.direction==='ON_RAMP'&&row.metadata?.source==='quick_pay_to_smart'&&row.provider_status!=='CONFIRMED'&&row.state==='APPROVED')await startQuickPayCollection(row);else if(row.direction==='ON_RAMP'&&row.metadata?.source==='quick_pay_to_smart'&&row.provider_status!=='CONFIRMED')await pollQuickPayCollection(row);else if(row.direction==='ON_RAMP')await completeOnramp(row);else if(row.state==='APPROVED')await startOfframp(row);else await pollOfframp(row);}catch(error){rampLog('error',{event:'RAMP_WORKER_FAILED',transactionId:row.id,code:error instanceof Error?error.message.slice(0,120):'UNKNOWN'});}}
 }finally{running=false;}}
