import type { Identity } from './auth.js';
import { accountFor, FundingError } from './service.js';
import { pool } from '../db/pool.js';

function normalize(row:any){
 const direction=row.direction as 'ON_RAMP'|'OFF_RAMP';
 const consumerState=String(row.consumer_state??'').toLowerCase();
 const state=consumerState||String(row.state??'').toLowerCase();
 return{
  id:String(row.id),reference:String(row.reference),direction,
  kind:direction==='ON_RAMP'?'deposit':'withdrawal',
  title:direction==='ON_RAMP'?'Naira deposit':'Naira withdrawal',
  state,approvalState:String(row.approval_state??'NOT_REQUIRED'),
  fiatCurrency:String(row.fiat_currency??'NGN'),fiatAmountMinor:String(row.fiat_amount_minor??'0'),
  usdcAmountAtomic:String(row.usdc_amount_atomic??'0'),provider:row.provider??null,
  stellarTransactionHash:row.stellar_transaction_hash??null,
  failureMessage:row.failure_message??row.failure_reason??null,
  createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),
  completedAt:row.completed_at?new Date(row.completed_at).toISOString():null,
 };
}

const select=`SELECT r.*,COALESCE(d.state,o.state) consumer_state,COALESCE(d.failure_message,o.failure_message) failure_message
 FROM ramp_transactions r
 LEFT JOIN consumer_deposit_intents d ON d.ramp_transaction_id=r.id
 LEFT JOIN consumer_offramp_intents o ON o.ramp_transaction_id=r.id`;

export async function consumerActivity(identity:Identity){
 const account=await accountFor(identity);
 const result=await pool.query(`${select} WHERE r.consumer_account_id=$1 AND NOT (r.direction='ON_RAMP' AND d.state IN ('quoted','expired')) ORDER BY r.created_at DESC LIMIT 100`,[account.id]);
 return{activity:result.rows.map(normalize)};
}

export async function consumerActivityDetail(identity:Identity,reference:string){
 const account=await accountFor(identity);
 const found=await pool.query(`${select} WHERE r.consumer_account_id=$1 AND r.reference=$2 LIMIT 1`,[account.id,reference]);
 if(!found.rows[0])throw new FundingError('Activity not found.',404);
 const events=await pool.query(`SELECT sequence,event_type AS "eventType",from_state AS "fromState",to_state AS "toState",created_at AS "createdAt" FROM ramp_transaction_events WHERE transaction_id=$1 ORDER BY sequence`,[found.rows[0].id]);
 return{activity:normalize(found.rows[0]),events:events.rows};
}
