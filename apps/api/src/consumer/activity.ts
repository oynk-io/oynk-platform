import type { Identity } from './auth.js';
import { accountFor, FundingError } from './service.js';
import { pool } from '../db/pool.js';

function normalizeRamp(row:any){
 const direction=row.direction as 'ON_RAMP'|'OFF_RAMP';
 const quickPayConversion=row.metadata?.source==='quick_pay_conversion';
 const quickPayToSmart=row.metadata?.source==='quick_pay_to_smart';
 const consumerState=String(row.consumer_state??'').toLowerCase();
 const state=consumerState||String(row.state??'').toLowerCase();
 return{
  id:String(row.id),reference:String(row.reference),direction,
  kind:quickPayConversion||quickPayToSmart?'conversion':direction==='ON_RAMP'?'deposit':'withdrawal',
  title:quickPayConversion?'Converted to Oynk Pay':quickPayToSmart?'Converted to Oynk Smart':direction==='ON_RAMP'?'Naira deposit':'Naira withdrawal',
  counterparty:null,state,approvalState:String(row.approval_state??'NOT_REQUIRED'),
  fiatCurrency:String(row.fiat_currency??'NGN'),fiatAmountMinor:String(row.fiat_amount_minor??'0'),
  usdcAmountAtomic:String(row.usdc_amount_atomic??'0'),provider:row.provider??null,
  stellarTransactionHash:row.stellar_transaction_hash??null,
  failureMessage:row.failure_message??row.failure_reason??null,
  createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),
  completedAt:row.completed_at?new Date(row.completed_at).toISOString():null,
 };
}

export function normalizeTerminal(row:any){
 const state=String(row.state??'').toUpperCase()==='REVERSED'?'refunded':String(row.state??'').toLowerCase();
 const businessName=String(row.business_name??'Oynk merchant');
 return{
  id:String(row.id),reference:`terminal:${String(row.id)}`,receiptNumber:`OYNK-${String(row.id).replaceAll('-','').slice(0,12).toUpperCase()}`,direction:'OFF_RAMP' as const,
  kind:'payment',title:state==='completed'?`Paid ${businessName}`:state==='refunded'?`Refund from ${businessName}`:`Payment to ${businessName}`,counterparty:businessName,state,
  approvalState:'NOT_REQUIRED',fiatCurrency:'NGN',fiatAmountMinor:String(row.amount_kobo??'0'),
  usdcAmountAtomic:'0',provider:row.provider??null,stellarTransactionHash:null,
  failureMessage:row.failure_reason??null,
  createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),
  completedAt:row.completed_at?new Date(row.completed_at).toISOString():null,
 };
}

function normalizeMart(row:any){
 const state=String(row.state).toLowerCase();
 const merchant=String(row.display_name??'Oynk merchant');
 return{
  id:String(row.id),reference:`mart:${String(row.id)}`,receiptNumber:`OYNK-${String(row.id).replaceAll('-','').slice(0,12).toUpperCase()}`,direction:'OFF_RAMP' as const,
  kind:'payment',title:`Purchase from ${merchant}`,counterparty:merchant,state,
  approvalState:'NOT_REQUIRED',fiatCurrency:'NGN',fiatAmountMinor:String(row.amount_kobo),
  usdcAmountAtomic:'0',provider:'VFD',stellarTransactionHash:null,failureMessage:null,
  createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),
  completedAt:row.completed_at?new Date(row.completed_at).toISOString():null,
 };
}

export function normalizeBank(row:any){return {
 id:String(row.id),reference:`bank:${row.id}`,direction:'ON_RAMP',kind:'deposit',title:'Money received',counterparty:null,state:'completed',approvalState:'NOT_REQUIRED',fiatCurrency:'NGN',fiatAmountMinor:String(row.amount_kobo),usdcAmountAtomic:'0',provider:row.provider??'VFD',stellarTransactionHash:null,failureMessage:null,createdAt:new Date(row.effective_at).toISOString(),updatedAt:new Date(row.effective_at).toISOString(),completedAt:new Date(row.effective_at).toISOString(),asset:'NGN',providerReference:row.provider_reference??null,
};}
export function normalizeChain(row:any){return {
 id:String(row.id),reference:`chain:${row.id}`,direction:row.kind==='REDEEM'?'ON_RAMP':'OFF_RAMP',kind:row.kind==='TRANSFER'?'withdrawal':'pool',title:row.kind==='TRANSFER'?'USDC sent':row.kind==='CONTRIBUTE'?'Pool contribution':'Pool withdrawal',counterparty:row.counterparty??null,state:String(row.state).toLowerCase(),approvalState:'NOT_REQUIRED',fiatCurrency:'NGN',fiatAmountMinor:'0',usdcAmountAtomic:String(row.amount_atomic),provider:'Stellar',stellarTransactionHash:row.transaction_hash??null,failureMessage:null,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),completedAt:row.completed_at?new Date(row.completed_at).toISOString():null,asset:'USDC',sessionReference:row.session_reference,
};}
export function normalizeRefund(row:any){return {
 id:String(row.id),reference:`refund:${row.id}`,direction:'ON_RAMP',kind:'refund',title:`Refund from ${row.business_name??'Oynk merchant'}`,counterparty:row.business_name??null,state:String(row.state).toLowerCase(),approvalState:'NOT_REQUIRED',fiatCurrency:'NGN',fiatAmountMinor:String(row.amount_kobo),usdcAmountAtomic:'0',provider:'VFD',stellarTransactionHash:null,failureMessage:row.failure_reason??null,createdAt:new Date(row.created_at).toISOString(),updatedAt:new Date(row.updated_at).toISOString(),completedAt:row.completed_at?new Date(row.completed_at).toISOString():null,asset:'NGN',providerReference:row.provider_reference??null,
};}
const refundSelect=`SELECT r.*,o.legal_name business_name FROM terminal_refunds r JOIN terminal_payments p ON p.id=r.payment_id JOIN organizations o ON o.id=p.business_organization_id`;

const rampSelect=`SELECT r.*,COALESCE(d.state,o.state) consumer_state,COALESCE(d.failure_message,o.failure_message) failure_message
 FROM ramp_transactions r
 LEFT JOIN consumer_deposit_intents d ON d.ramp_transaction_id=r.id
 LEFT JOIN consumer_offramp_intents o ON o.ramp_transaction_id=r.id`;

const terminalSelect=`SELECT p.*,o.legal_name business_name
 FROM terminal_payments p
 JOIN organizations o ON o.id=p.business_organization_id`;
const martSelect=`SELECT p.*,s.display_name FROM mart_payments p JOIN mart_orders mo ON mo.id=p.order_id JOIN mart_storefronts s ON s.organization_id=mo.organization_id`;

export async function consumerActivity(identity:Identity){
 const account=await accountFor(identity);
 const [ramps,terminalPayments,martPayments,bank,chain,refunds]=await Promise.all([
  pool.query(`${rampSelect} WHERE r.consumer_account_id=$1 AND NOT (r.direction='ON_RAMP' AND d.state IN ('quoted','expired')) ORDER BY r.created_at DESC LIMIT 100`,[account.id]),
  pool.query(`${terminalSelect} WHERE p.consumer_account_id=$1 ORDER BY p.created_at DESC LIMIT 100`,[account.id]),
  pool.query(`${martSelect} WHERE p.consumer_account_id=$1 AND p.state<>'AWAITING_APPROVAL' ORDER BY p.created_at DESC LIMIT 100`,[account.id]),
  pool.query(`SELECT * FROM consumer_quick_pay_ledger_entries WHERE account_id=$1 AND kind='BANK_DEPOSIT' AND direction='CREDIT' ORDER BY effective_at DESC LIMIT 100`,[account.id]),
  pool.query(`SELECT * FROM consumer_chain_intents WHERE account_id=$1 ORDER BY created_at DESC LIMIT 100`,[account.id]),
  pool.query(`${refundSelect} WHERE p.consumer_account_id=$1 ORDER BY r.created_at DESC LIMIT 100`,[account.id]),
 ]);
 const activity=[...ramps.rows.map(normalizeRamp),...terminalPayments.rows.map(normalizeTerminal),...martPayments.rows.map(normalizeMart),...bank.rows.map(normalizeBank),...chain.rows.map(normalizeChain),...refunds.rows.map(normalizeRefund)]
  .sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())
  .slice(0,100);
 return{activity};
}

export async function consumerActivityDetail(identity:Identity,reference:string){
 const account=await accountFor(identity);
 if(/^(bank|chain|refund):/.test(reference)){
  const [kind,id]=reference.split(':');if(!/^[0-9a-f-]{36}$/i.test(id??''))throw new FundingError('Activity not found.',404);
  if(kind==='chain'){
   const row=(await pool.query('SELECT * FROM consumer_chain_intents WHERE account_id=$1 AND id=$2',[account.id,id])).rows[0];if(!row)throw new FundingError('Activity not found.',404);
   const events=await pool.query(`SELECT id::text sequence,action AS "eventType",created_at AS "createdAt" FROM consumer_chain_events WHERE intent_id=$1 ORDER BY id`,[id]);return {activity:normalizeChain(row),events:events.rows};
  }
  if(kind==='bank'){
   const row=(await pool.query(`SELECT * FROM consumer_quick_pay_ledger_entries WHERE account_id=$1 AND id=$2 AND kind='BANK_DEPOSIT' AND direction='CREDIT'`,[account.id,id])).rows[0];if(!row)throw new FundingError('Activity not found.',404);return {activity:normalizeBank(row),events:[{sequence:'1',eventType:'BANK_DEPOSIT_CONFIRMED',createdAt:row.effective_at}]};
  }
  const row=(await pool.query(`${refundSelect} WHERE p.consumer_account_id=$1 AND r.id=$2`,[account.id,id])).rows[0];if(!row)throw new FundingError('Activity not found.',404);
  const events=await pool.query(`SELECT sequence::text,event_type AS "eventType",created_at AS "createdAt" FROM terminal_refund_events WHERE refund_id=$1 ORDER BY sequence`,[id]);return {activity:normalizeRefund(row),events:events.rows};
 }
 if(reference.startsWith('mart:')){
  const id=reference.slice('mart:'.length);
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new FundingError('Activity not found.',404);
  const found=await pool.query(`${martSelect} WHERE p.consumer_account_id=$1 AND p.id=$2 AND p.state<>'AWAITING_APPROVAL' LIMIT 1`,[account.id,id]);
  if(!found.rows[0])throw new FundingError('Activity not found.',404);
  const events=await pool.query(`SELECT ROW_NUMBER() OVER(ORDER BY created_at,id)::text AS sequence,action AS "eventType",NULL::text AS "fromState",NULL::text AS "toState",created_at AS "createdAt" FROM mart_payment_events WHERE payment_id=$1 ORDER BY created_at,id`,[id]);
  return{activity:normalizeMart(found.rows[0]),events:events.rows};
 }
 if(reference.startsWith('terminal:')){
  const id=reference.slice('terminal:'.length);
  if(!/^[0-9a-f-]{36}$/i.test(id))throw new FundingError('Activity not found.',404);
  const found=await pool.query(`${terminalSelect} WHERE p.consumer_account_id=$1 AND p.id=$2 LIMIT 1`,[account.id,id]);
  if(!found.rows[0])throw new FundingError('Activity not found.',404);
  const events=await pool.query(`SELECT sequence::text,event_type AS "eventType",from_state AS "fromState",to_state AS "toState",created_at AS "createdAt" FROM terminal_payment_events WHERE payment_id=$1
   UNION ALL
   SELECT ('1000000000000'::bigint+e.sequence)::text,e.event_type,e.from_state,e.to_state,e.created_at FROM terminal_refund_events e JOIN terminal_refunds r ON r.id=e.refund_id WHERE r.payment_id=$1
   ORDER BY "createdAt"`,[id]);
  const refunds=await pool.query(`SELECT id,amount_kobo::text AS "amountKobo",state,completed_at AS "completedAt",created_at AS "createdAt" FROM terminal_refunds WHERE payment_id=$1 ORDER BY created_at DESC`,[id]);
  return{activity:normalizeTerminal(found.rows[0]),events:events.rows,refunds:refunds.rows};
 }
 const found=await pool.query(`${rampSelect} WHERE r.consumer_account_id=$1 AND r.reference=$2 LIMIT 1`,[account.id,reference]);
 if(!found.rows[0])throw new FundingError('Activity not found.',404);
 const events=await pool.query(`SELECT sequence,event_type AS "eventType",from_state AS "fromState",to_state AS "toState",created_at AS "createdAt" FROM ramp_transaction_events WHERE transaction_id=$1 ORDER BY sequence`,[found.rows[0].id]);
 return{activity:normalizeRamp(found.rows[0]),events:events.rows};
}
