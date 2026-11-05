import { randomUUID } from 'node:crypto';
import type { Identity } from './auth.js';
import { accountFor, FundingError, transaction } from './service.js';
import { createActionChallenge, consumeActionApproval } from './approvals.js';
import { secureHash } from '../auth/security.js';
import { pool } from '../db/pool.js';
import { funding } from './settings.js';
function securityPayload(raw:unknown){
 const input=raw as Record<string,unknown>;
 if(!input||!['PASSCODE_CHANGE','ACCOUNT_CLOSURE'].includes(String(input.action)))throw new FundingError('Invalid account action.');
 if(input.action==='PASSCODE_CHANGE'&&(typeof input.passcodeCommitment!=='string'||!/^[a-f0-9]{64}$/.test(input.passcodeCommitment)))throw new FundingError('Prepare your new passcode again.');
 return {action:String(input.action),...(input.action==='PASSCODE_CHANGE'?{passcodeCommitment:input.passcodeCommitment}: {})};
}
export async function accountSecurityChallenge(identity:Identity,raw:unknown){const payload=securityPayload(raw);return createActionChallenge(identity,payload.action,payload);}
export async function approveAccountSecurity(identity:Identity,raw:unknown){
 const payload=securityPayload(raw),input=raw as Record<string,unknown>;
 return transaction(async db=>{
  await consumeActionApproval(db,identity,payload.action,payload,input);
  const account=await accountFor(identity,db,true);
  if(payload.action==='PASSCODE_CHANGE')return{approved:true};
  const row=await db.query(`INSERT INTO consumer_security_requests(id,account_id,kind) VALUES($1,$2,'ACCOUNT_CLOSURE') ON CONFLICT(account_id,kind) WHERE state IN ('OPEN','IN_REVIEW') DO UPDATE SET updated_at=NOW() RETURNING id,state`,[randomUUID(),account.id]);
  await db.query(`INSERT INTO consumer_security_events(request_id,action,actor_reference) VALUES($1,'CLOSURE_REQUESTED',$2)`,[row.rows[0].id,identity.subject]);
  return{request:row.rows[0]};
 });
}
/** Phone verification starts a support case; it never grants wallet ownership. */
export async function requestLostDevice(raw:unknown){
 const id=(raw as {challengeId?:unknown})?.challengeId;
 if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))throw new FundingError('Verify your phone number first.');
 const row=(await pool.query(`SELECT a.id FROM consumer_phone_challenges c JOIN consumer_phone_links l ON l.phone=c.phone JOIN consumer_accounts a ON a.client_id=l.client_id AND a.subject=l.subject AND a.network=l.network WHERE c.id=$1 AND l.client_id=$2 AND c.consumed_at IS NOT NULL AND c.invalidated_at IS NULL AND c.expires_at>NOW()`,[id,funding.SOCKETFI_CLIENT_ID])).rows[0];
 if(!row)throw new FundingError('Your verification expired. Please start again.',409);
 return transaction(async db=>{
  const result=await db.query(`INSERT INTO consumer_security_requests(id,account_id,kind) VALUES($1,$2,'LOST_DEVICE') ON CONFLICT(account_id,kind) WHERE state IN ('OPEN','IN_REVIEW') DO UPDATE SET updated_at=NOW() RETURNING id,state`,[randomUUID(),row.id]);
  await db.query(`INSERT INTO consumer_security_events(request_id,action,actor_reference) VALUES($1,'RECOVERY_REQUESTED',$2)`,[result.rows[0].id,secureHash(`recovery:${id}`)]);
  return{request:result.rows[0]};
 });
}
export async function accountSecurityStatus(identity:Identity){const account=await accountFor(identity);return{requests:(await pool.query(`SELECT id,kind,state,created_at FROM consumer_security_requests WHERE account_id=$1 ORDER BY created_at DESC LIMIT 20`,[account.id])).rows};}
