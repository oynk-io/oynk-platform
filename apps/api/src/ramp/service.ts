import { randomUUID } from 'node:crypto';
import type { PoolClient, QueryResultRow } from 'pg';
import { pool } from '../db/pool.js';
import { evaluateRampPolicy } from './policy.js';
import { rampLog } from './observability.js';
import type { RampActor, RampDirection, RampPolicy } from './types.js';
import { approvalTransition, retryAllowed } from './state.js';

type Db = Pick<PoolClient, 'query'>;
export class RampError extends Error { constructor(message: string, readonly status = 400, readonly code = 'RAMP_ERROR') { super(message); } }

function policyFromRow(row: QueryResultRow): RampPolicy {
 return { id: row.id, direction: row.direction, enabled: row.enabled,
  manualThresholdUsdcAtomic: BigInt(row.manual_threshold_usdc_atomic), cumulativeEnabled: row.cumulative_enabled,
  cumulativeThresholdUsdcAtomic: row.cumulative_threshold_usdc_atomic === null ? null : BigInt(row.cumulative_threshold_usdc_atomic),
  cumulativeWindowSeconds: row.cumulative_window_seconds, additionalRules:row.additional_rules??{}, version: row.version };
}

async function event(db: Db, transactionId: string, eventType: string, actor: RampActor, fromState: string | null, toState: string | null, details: Record<string, unknown> = {}) {
 await db.query(`INSERT INTO ramp_transaction_events(id,transaction_id,event_type,from_state,to_state,actor_type,actor_reference,request_id,details)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [randomUUID(),transactionId,eventType,fromState,toState,actor.type,actor.reference ?? null,actor.requestId ?? null,details]);
 rampLog('info',{event:eventType,transactionId,state:toState ?? fromState ?? undefined});
}

export async function createRampTransaction(db: Db, input: {
 reference: string; idempotencyKey: string; direction: RampDirection; consumerAccountId?: string | null;
 subjectReference?: string | null; walletAddress: string; network: 'TESTNET'|'PUBLIC'; fiatCurrency?: string | null;
 fiatAmountMinor?: bigint | null; usdcAmountAtomic?: bigint | null; feeFiatMinor?: bigint | null;
 provider?: string | null; destinationFingerprint?: string | null; metadata?: Record<string,unknown>; actor: RampActor;
}) {
 const existing = await db.query('SELECT * FROM ramp_transactions WHERE idempotency_key=$1',[input.idempotencyKey]);
 if (existing.rows[0]) return existing.rows[0];
 const policyResult = await db.query('SELECT * FROM ramp_policy_configs WHERE direction=$1 FOR SHARE',[input.direction]);
 if (!policyResult.rows[0]) throw new RampError('Ramp policy is not configured.',503,'POLICY_NOT_CONFIGURED');
 const policy = policyFromRow(policyResult.rows[0]);
 let prior = 0n;
 if (policy.cumulativeEnabled && policy.cumulativeWindowSeconds) {
  const total = await db.query(`SELECT COALESCE(SUM(usdc_amount_atomic),0)::TEXT total FROM ramp_transactions
   WHERE direction=$1 AND subject_reference IS NOT DISTINCT FROM $2 AND created_at > NOW()-($3::TEXT||' seconds')::INTERVAL
   AND (state IN ('APPROVED','PROCESSING','COMPLETED') OR provider_reference IS NOT NULL)`,[input.direction,input.subjectReference ?? null,policy.cumulativeWindowSeconds]);
  prior = BigInt(total.rows[0].total);
 }
 const decision = evaluateRampPolicy({policy,amountUsdcAtomic:input.usdcAmountAtomic ?? null,priorWindowAmountUsdcAtomic:prior});
 const id = randomUUID();
 const snapshot = { enabled:policy.enabled,manualThresholdUsdcAtomic:String(policy.manualThresholdUsdcAtomic),
  cumulativeEnabled:policy.cumulativeEnabled,cumulativeThresholdUsdcAtomic:policy.cumulativeThresholdUsdcAtomic === null ? null : String(policy.cumulativeThresholdUsdcAtomic),
  cumulativeWindowSeconds:policy.cumulativeWindowSeconds,additionalRules:policy.additionalRules,reasonCodes:decision.reasonCodes };
 const inserted=await db.query(`INSERT INTO ramp_transactions(id,reference,idempotency_key,direction,state,approval_state,risk_state,consumer_account_id,subject_reference,wallet_address,network,fiat_currency,fiat_amount_minor,usdc_amount_atomic,fee_fiat_minor,provider,destination_fingerprint,policy_id,policy_version,policy_snapshot,metadata)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
  ON CONFLICT(idempotency_key) DO NOTHING RETURNING id`,
  [id,input.reference,input.idempotencyKey,input.direction,decision.state,decision.approvalState,decision.riskState,input.consumerAccountId??null,input.subjectReference??null,input.walletAddress,input.network,input.fiatCurrency??null,input.fiatAmountMinor?.toString()??null,input.usdcAmountAtomic?.toString()??null,input.feeFiatMinor?.toString()??null,input.provider??null,input.destinationFingerprint??null,policy.id,policy.version,snapshot,input.metadata??{}]);
 if(!inserted.rowCount)return(await db.query('SELECT * FROM ramp_transactions WHERE idempotency_key=$1',[input.idempotencyKey])).rows[0];
 await db.query(`INSERT INTO ramp_policy_decisions(id,transaction_id,policy_id,policy_version,outcome,reason_codes,evaluated_amount_usdc_atomic,cumulative_amount_usdc_atomic,facts)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),id,policy.id,policy.version,decision.outcome,decision.reasonCodes,input.usdcAmountAtomic?.toString()??null,decision.cumulativeAmountUsdcAtomic.toString(),{priorWindowAmountUsdcAtomic:String(prior)}]);
 await event(db,id,'TRANSACTION_CREATED',input.actor,null,'CREATED',{direction:input.direction});
 await event(db,id,'POLICY_EVALUATED',{type:'SYSTEM'},'POLICY_CHECK',decision.state,{outcome:decision.outcome,reasonCodes:decision.reasonCodes,policyVersion:policy.version});
 return (await db.query('SELECT * FROM ramp_transactions WHERE id=$1',[id])).rows[0];
}

export async function recordProviderConfirmation(db: Db, input: { transactionId: string; provider: string; providerReference: string; providerStatus: string; actor?: RampActor }) {
 const result = await db.query('SELECT * FROM ramp_transactions WHERE id=$1 FOR UPDATE',[input.transactionId]);
 const row = result.rows[0]; if (!row) throw new RampError('Ramp transaction not found.',404,'NOT_FOUND');
 if (row.provider_reference && row.provider_reference !== input.providerReference) throw new RampError('A different provider confirmation is already recorded.',409,'PROVIDER_REFERENCE_CONFLICT');
 if(row.provider_reference===input.providerReference&&row.provider_status===input.providerStatus)return;
 const nextState=input.providerStatus==='CONFIRMED'?(row.approval_state==='PENDING'?'PENDING_APPROVAL':row.approval_state==='REJECTED'?'REJECTED':'APPROVED'):'PENDING_APPROVAL';
 const nextRisk=input.providerStatus==='CONFIRMED'?row.risk_state:'REVIEW_REQUIRED';
 await db.query(`UPDATE ramp_transactions SET provider=$2,provider_reference=$3,provider_status=$4,state=$5,risk_state=$6,updated_at=NOW() WHERE id=$1`,[row.id,input.provider,input.providerReference,input.providerStatus,nextState,nextRisk]);
 await event(db,row.id,input.providerStatus==='CONFIRMED'?'PROVIDER_CONFIRMED':'PROVIDER_REVIEW_REQUIRED',input.actor??{type:'PROVIDER',reference:input.provider},row.state,nextState,{provider:input.provider,status:input.providerStatus});
}

async function withTransaction<T>(fn:(db:PoolClient)=>Promise<T>):Promise<T>{const db=await pool.connect();try{await db.query('BEGIN');const value=await fn(db);await db.query('COMMIT');return value;}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}

export async function decideRampTransaction(input:{transactionId:string;action:'APPROVE'|'REJECT';operatorUserId:string;operatorOrganizationId:string;note?:string;requestId?:string}){
 return withTransaction(async db=>{
  const found=await db.query('SELECT * FROM ramp_transactions WHERE id=$1 FOR UPDATE',[input.transactionId]);const row=found.rows[0];if(!row)throw new RampError('Ramp transaction not found.',404,'NOT_FOUND');
  const existing=(await db.query('SELECT * FROM ramp_approval_actions WHERE transaction_id=$1',[row.id])).rows[0];
  let transition;try{transition=approvalTransition({state:row.state,approvalState:row.approval_state,riskState:row.risk_state,existingAction:existing?.action},input.action);}catch(error){const code=error instanceof Error?error.message:'APPROVAL_FINAL';const message=code==='APPROVAL_NOT_PENDING'?'This transaction is not awaiting approval.':code==='POLICY_BLOCKED'?'This transaction is blocked by policy and cannot be approved.':'This transaction already has a final approval decision.';throw new RampError(message,409,code);}
  if(transition.idempotent)return (await db.query('SELECT * FROM ramp_transactions WHERE id=$1',[row.id])).rows[0];
  const executionReady=row.provider_reference||row.onchain_state==='AWAITING_PAYOUT'||row.metadata?.onchainFunded===true;
  const next=input.action==='APPROVE'?(executionReady?'APPROVED':'CREATED'):'REJECTED';
  await db.query(`INSERT INTO ramp_approval_actions(id,transaction_id,action,operator_user_id,operator_organization_id,note) VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),row.id,input.action,input.operatorUserId,input.operatorOrganizationId,input.note?.trim()||null]);
  await db.query(`UPDATE ramp_transactions SET state=$2,approval_state=$3,risk_state=$4,updated_at=NOW() WHERE id=$1`,[row.id,next,next,input.action==='APPROVE'?'CLEAR':'BLOCKED']);
  await event(db,row.id,input.action==='APPROVE'?'MANUAL_APPROVAL_GRANTED':'MANUAL_APPROVAL_REJECTED',{type:'OPERATOR',reference:input.operatorUserId,requestId:input.requestId},row.state,next,{noteProvided:Boolean(input.note?.trim())});
  return (await db.query('SELECT * FROM ramp_transactions WHERE id=$1',[row.id])).rows[0];
 });
}

export async function retryRampTransaction(input:{transactionId:string;idempotencyKey:string;operatorUserId:string;requestId?:string}){
 return withTransaction(async db=>{
  const duplicate=(await db.query('SELECT transaction_id AS "transactionId",idempotency_key AS "idempotencyKey",attempt_number AS attempt,state FROM ramp_execution_attempts WHERE idempotency_key=$1',[input.idempotencyKey])).rows[0];
  if(duplicate){if(duplicate.transactionId!==input.transactionId)throw new RampError('The idempotency key is already used for another transaction.',409,'IDEMPOTENCY_CONFLICT');return duplicate;}
  const found=await db.query('SELECT * FROM ramp_transactions WHERE id=$1 FOR UPDATE',[input.transactionId]);const row=found.rows[0];if(!row)throw new RampError('Ramp transaction not found.',404,'NOT_FOUND');
  if(!retryAllowed({state:row.state,approvalState:row.approval_state}))throw new RampError(row.state==='FAILED'?'Approval is required before execution.':'Only failed transactions can be retried.',409,row.state==='FAILED'?'APPROVAL_REQUIRED':'RETRY_NOT_ALLOWED');
  const count=await db.query('SELECT COUNT(*)::INT count FROM ramp_execution_attempts WHERE transaction_id=$1',[row.id]);const attempt=Number(count.rows[0].count)+1;
  const key=input.idempotencyKey;
  await db.query(`INSERT INTO ramp_execution_attempts(id,transaction_id,operation,idempotency_key,attempt_number,state) VALUES($1,$2,'SETTLE',$3,$4,'QUEUED')`,[randomUUID(),row.id,key,attempt]);
  await db.query(`UPDATE ramp_transactions SET state='APPROVED',failure_code=NULL,failure_reason=NULL,updated_at=NOW() WHERE id=$1`,[row.id]);
  await event(db,row.id,'RETRY_QUEUED',{type:'OPERATOR',reference:input.operatorUserId,requestId:input.requestId},'FAILED','APPROVED',{attempt});
  return {transactionId:row.id,idempotencyKey:key,attempt,state:'QUEUED'};
 });
}

export async function beginRampExecution(input:{transactionId:string;idempotencyKey:string;operation?:string}){
 return withTransaction(async db=>{const duplicate=(await db.query('SELECT * FROM ramp_execution_attempts WHERE idempotency_key=$1 FOR UPDATE',[input.idempotencyKey])).rows[0];if(duplicate){if(duplicate.transaction_id!==input.transactionId)throw new RampError('The idempotency key is already used for another transaction.',409,'IDEMPOTENCY_CONFLICT');return duplicate;}
  const found=await db.query('SELECT * FROM ramp_transactions WHERE id=$1 FOR UPDATE',[input.transactionId]);const row=found.rows[0];if(!row)throw new RampError('Ramp transaction not found.',404,'NOT_FOUND');if(row.state!=='APPROVED'||!['NOT_REQUIRED','APPROVED'].includes(row.approval_state))throw new RampError('This transaction is not approved for execution.',409,'EXECUTION_NOT_APPROVED');
  const operation=input.operation??'SETTLE';const count=await db.query('SELECT COUNT(*)::INT count FROM ramp_execution_attempts WHERE transaction_id=$1 AND operation=$2',[row.id,operation]);const attempt=Number(count.rows[0].count)+1;const id=randomUUID();
  await db.query(`INSERT INTO ramp_execution_attempts(id,transaction_id,operation,idempotency_key,attempt_number,state,started_at) VALUES($1,$2,$3,$4,$5,'PROCESSING',NOW())`,[id,row.id,operation,input.idempotencyKey,attempt]);await db.query(`UPDATE ramp_transactions SET state='PROCESSING',updated_at=NOW() WHERE id=$1`,[row.id]);await event(db,row.id,'EXECUTION_STARTED',{type:'SYSTEM'},row.state,'PROCESSING',{operation,attempt});return(await db.query('SELECT * FROM ramp_execution_attempts WHERE id=$1',[id])).rows[0];});
}

export async function finishRampExecution(input:{transactionId:string;idempotencyKey:string;succeeded:boolean;providerReference?:string;stellarTransactionHash?:string;errorCode?:string;errorReason?:string}){
 return withTransaction(async db=>{const attempt=(await db.query('SELECT * FROM ramp_execution_attempts WHERE idempotency_key=$1 AND transaction_id=$2 FOR UPDATE',[input.idempotencyKey,input.transactionId])).rows[0];if(!attempt)throw new RampError('Execution attempt not found.',404,'EXECUTION_NOT_FOUND');const row=(await db.query('SELECT * FROM ramp_transactions WHERE id=$1 FOR UPDATE',[input.transactionId])).rows[0];
  if(attempt.state==='SUCCEEDED'||attempt.state==='FAILED')return row;if(attempt.state!=='PROCESSING')throw new RampError('Execution attempt is not processing.',409,'EXECUTION_STATE_INVALID');const state=input.succeeded?'COMPLETED':'FAILED';
  await db.query(`UPDATE ramp_execution_attempts SET state=$2,provider_reference=COALESCE($3,provider_reference),stellar_transaction_hash=COALESCE($4,stellar_transaction_hash),error_code=$5,finished_at=NOW() WHERE id=$1`,[attempt.id,input.succeeded?'SUCCEEDED':'FAILED',input.providerReference??null,input.stellarTransactionHash??null,input.errorCode??null]);
  await db.query(`UPDATE ramp_transactions SET state=$2,provider_reference=COALESCE($3,provider_reference),stellar_transaction_hash=COALESCE($4,stellar_transaction_hash),failure_code=$5,failure_reason=$6,completed_at=CASE WHEN $2='COMPLETED' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$1`,[row.id,state,input.providerReference??null,input.stellarTransactionHash??null,input.errorCode??null,input.errorReason??null]);await event(db,row.id,input.succeeded?'EXECUTION_COMPLETED':'EXECUTION_FAILED',{type:'SYSTEM'},row.state,state,{errorCode:input.errorCode??null});return(await db.query('SELECT * FROM ramp_transactions WHERE id=$1',[row.id])).rows[0];});
}

export async function listRampTransactions(filters:{direction?:string;state?:string;approvalState?:string;provider?:string;query?:string;limit?:number;offset?:number}){
 const values:unknown[]=[];const where:string[]=[];const add=(sql:string,value:unknown)=>{values.push(value);where.push(sql.replace('?',`$${values.length}`));};
 if(filters.direction)add('r.direction=?',filters.direction);if(filters.state)add('r.state=?',filters.state);if(filters.approvalState)add('r.approval_state=?',filters.approvalState);if(filters.provider)add('r.provider=?',filters.provider);
 if(filters.query){values.push(`%${filters.query}%`);where.push(`(r.reference ILIKE $${values.length} OR r.provider_reference ILIKE $${values.length} OR r.stellar_transaction_hash ILIKE $${values.length})`);}
 values.push(Math.min(Math.max(filters.limit??50,1),100),Math.max(filters.offset??0,0));
 const result=await pool.query(`SELECT r.id,r.reference,r.direction,r.state,r.approval_state AS "approvalState",r.risk_state AS "riskState",r.fiat_currency AS "fiatCurrency",r.fiat_amount_minor::TEXT AS "fiatAmountMinor",r.usdc_amount_atomic::TEXT AS "usdcAmountAtomic",r.provider,r.provider_reference AS "providerReference",r.stellar_transaction_hash AS "stellarTransactionHash",r.failure_code AS "failureCode",COALESCE(d.state,o.state) AS "intentState",r.created_at AS "createdAt",r.updated_at AS "updatedAt" FROM ramp_transactions r LEFT JOIN consumer_deposit_intents d ON d.ramp_transaction_id=r.id LEFT JOIN consumer_offramp_intents o ON o.ramp_transaction_id=r.id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY r.created_at DESC LIMIT $${values.length-1} OFFSET $${values.length}`,values);
 return result.rows;
}

export async function getRampTransaction(id:string){
 const transaction=(await pool.query(`SELECT id,reference,direction,state,approval_state AS "approvalState",risk_state AS "riskState",consumer_account_id AS "consumerAccountId",subject_reference AS "subjectReference",wallet_address AS "walletAddress",network,fiat_currency AS "fiatCurrency",fiat_amount_minor::TEXT AS "fiatAmountMinor",usdc_amount_atomic::TEXT AS "usdcAmountAtomic",fee_fiat_minor::TEXT AS "feeFiatMinor",provider,provider_reference AS "providerReference",provider_status AS "providerStatus",destination_fingerprint AS "destinationFingerprint",stellar_transaction_hash AS "stellarTransactionHash",failure_code AS "failureCode",failure_reason AS "failureReason",policy_id AS "policyId",policy_version AS "policyVersion",policy_snapshot AS "policySnapshot",metadata,created_at AS "createdAt",updated_at AS "updatedAt",completed_at AS "completedAt" FROM ramp_transactions WHERE id=$1`,[id])).rows[0];
 if(!transaction)throw new RampError('Ramp transaction not found.',404,'NOT_FOUND');
 const [events,decisions,approvals,attempts]=await Promise.all([
  pool.query(`SELECT sequence,event_type AS "eventType",from_state AS "fromState",to_state AS "toState",actor_type AS "actorType",actor_reference AS "actorReference",request_id AS "requestId",details,created_at AS "createdAt" FROM ramp_transaction_events WHERE transaction_id=$1 ORDER BY sequence`,[id]),
  pool.query(`SELECT outcome,reason_codes AS "reasonCodes",evaluated_amount_usdc_atomic::TEXT AS "evaluatedAmountUsdcAtomic",cumulative_amount_usdc_atomic::TEXT AS "cumulativeAmountUsdcAtomic",facts,created_at AS "createdAt" FROM ramp_policy_decisions WHERE transaction_id=$1 ORDER BY created_at`,[id]),
  pool.query(`SELECT action,operator_user_id AS "operatorUserId",note,created_at AS "createdAt" FROM ramp_approval_actions WHERE transaction_id=$1 ORDER BY created_at`,[id]),
  pool.query(`SELECT operation,idempotency_key AS "idempotencyKey",attempt_number AS "attemptNumber",state,provider_reference AS "providerReference",stellar_transaction_hash AS "stellarTransactionHash",error_code AS "errorCode",started_at AS "startedAt",finished_at AS "finishedAt",created_at AS "createdAt" FROM ramp_execution_attempts WHERE transaction_id=$1 ORDER BY attempt_number`,[id])
 ]);
 return{transaction,events:events.rows,policyDecisions:decisions.rows,approvals:approvals.rows,executionAttempts:attempts.rows};
}

export async function listRampPolicies(){const result=await pool.query(`SELECT id,direction,enabled,manual_threshold_usdc_atomic::TEXT AS "manualThresholdUsdcAtomic",cumulative_enabled AS "cumulativeEnabled",cumulative_threshold_usdc_atomic::TEXT AS "cumulativeThresholdUsdcAtomic",cumulative_window_seconds AS "cumulativeWindowSeconds",additional_rules AS "additionalRules",version,updated_at AS "updatedAt" FROM ramp_policy_configs ORDER BY direction`);return result.rows;}

export async function updateRampPolicy(input:{direction:RampDirection;enabled:boolean;manualThresholdUsdcAtomic:bigint;cumulativeEnabled:boolean;cumulativeThresholdUsdcAtomic:bigint|null;cumulativeWindowSeconds:number|null;additionalRules?:Record<string,unknown>;operatorUserId:string;operatorOrganizationId:string;note?:string;requestId?:string}){
 return withTransaction(async db=>{const current=(await db.query('SELECT * FROM ramp_policy_configs WHERE direction=$1 FOR UPDATE',[input.direction])).rows[0];if(!current)throw new RampError('Ramp policy not found.',404,'NOT_FOUND');const version=Number(current.version)+1;
  await db.query(`UPDATE ramp_policy_configs SET enabled=$2,manual_threshold_usdc_atomic=$3,cumulative_enabled=$4,cumulative_threshold_usdc_atomic=$5,cumulative_window_seconds=$6,additional_rules=$7,version=$8,updated_by=$9,updated_at=NOW() WHERE id=$1`,[current.id,input.enabled,input.manualThresholdUsdcAtomic.toString(),input.cumulativeEnabled,input.cumulativeThresholdUsdcAtomic?.toString()??null,input.cumulativeWindowSeconds,input.additionalRules??current.additional_rules??{},version,input.operatorUserId]);
  const configuration={enabled:input.enabled,manualThresholdUsdcAtomic:String(input.manualThresholdUsdcAtomic),cumulativeEnabled:input.cumulativeEnabled,cumulativeThresholdUsdcAtomic:input.cumulativeThresholdUsdcAtomic===null?null:String(input.cumulativeThresholdUsdcAtomic),cumulativeWindowSeconds:input.cumulativeWindowSeconds,additionalRules:input.additionalRules??current.additional_rules??{}};
  await db.query(`INSERT INTO ramp_policy_versions(id,policy_id,direction,version,configuration,changed_by,change_note) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),current.id,input.direction,version,configuration,input.operatorUserId,input.note?.trim()||null]);
  await db.query(`INSERT INTO audit_logs(id,actor_user_id,organization_id,action,resource_type,resource_id,result,request_id,metadata) VALUES($1,$2,$3,'RAMP_POLICY_UPDATED','RAMP_POLICY',$4,'SUCCESS',$5,$6)`,[randomUUID(),input.operatorUserId,input.operatorOrganizationId,current.id,input.requestId??null,{direction:input.direction,version}]);
  rampLog('info',{event:'POLICY_UPDATED',direction:input.direction});return{...configuration,id:current.id,direction:input.direction,version};});
}

export async function rampMetrics(){const result=await pool.query(`SELECT direction,state,approval_state,COUNT(*)::INT count,COALESCE(SUM(usdc_amount_atomic),0)::TEXT AS "usdcAmountAtomic" FROM ramp_transactions GROUP BY direction,state,approval_state ORDER BY direction,state`);return{generatedAt:new Date().toISOString(),series:result.rows};}
