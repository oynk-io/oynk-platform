import { randomUUID, timingSafeEqual } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { kobo, limits } from './money.js';
import { funding } from './settings.js';
import { recordVerifiedFiatReceipt, transaction } from './service.js';

export const vfdWebhookPayload=z.object({
 reference:z.string().min(1).max(160),amount:z.string().regex(/^\d{1,12}(\.\d{1,2})?$/),
 account_number:z.string().regex(/^\d{10}$/),timestamp:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?$/),session_id:z.string().min(8).max(128),
 initialCreditRequest:z.boolean().optional(),
});
const vfdPayoutWebhookPayload=z.object({
 event:z.enum(['payout.success','payout.failed']),status:z.string(),message:z.string().optional(),
 data:z.object({reference:z.string().min(1).max(160),timestamp:z.string().optional()}).passthrough(),
});
export function vfdOccurredAt(value:string){
 // VFD sandbox currently sends Lagos local time without an offset even though
 // its documented example includes Z. Preserve the actual instant explicitly.
 const date=new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value)?value:`${value}+01:00`);
 if(!Number.isFinite(date.getTime()))throw new Error('Invalid VFD timestamp');
 return date;
}
export function isVfdDashboardTest(value:z.infer<typeof vfdWebhookPayload>){
 return value.reference.startsWith('WebhookTest-')&&value.account_number==='5999919199'&&value.session_id==='00001111222233334455';
}
function authorized(value:string|undefined){
 const secret=funding.VFD_WEBHOOK_SECRET;if(!secret||!value?.startsWith('Bearer '))return false;
 const supplied=value.slice(7);const a=Buffer.from(secret);const b=Buffer.from(supplied);return a.length===b.length&&timingSafeEqual(a,b);
}

export const vfdWebhook=express.Router();
vfdWebhook.post('/',async(req,res)=>{
 if(!authorized(req.get('authorization'))){console.warn('[vfd/webhook] rejected authorization');res.sendStatus(401);return;}
 const payout=vfdPayoutWebhookPayload.safeParse(req.body);
 if(payout.success){
  try{
   await pool.query(`UPDATE ramp_transactions SET provider_status=$2,updated_at=NOW() WHERE provider='VFD' AND (provider_reference=$1 OR metadata->>'payoutRequestReference'=$1)`,[payout.data.data.reference,payout.data.event==='payout.success'?'SUCCESS':'FAILED']);
   res.sendStatus(200);
  }catch(error){console.error('[vfd/webhook] payout processing failed',{message:error instanceof Error?error.message:'Unknown error'});res.sendStatus(503);}return;
 }
 const parsed=vfdWebhookPayload.safeParse(req.body);if(!parsed.success){console.warn('[vfd/webhook] rejected payload',{issues:parsed.error.issues.map(issue=>issue.path.join('.'))});res.sendStatus(400);return;}
 if(isVfdDashboardTest(parsed.data)){console.info('[vfd/webhook] dashboard test acknowledged');res.sendStatus(200);return;}
 // Initial notifications occur before settlement and never move the ledger.
 if(parsed.data.initialCreditRequest===true){res.sendStatus(200);return;}
 try{
  const rampIntent=await pool.query(`SELECT i.reference FROM consumer_deposit_intents i JOIN ramp_transactions r ON r.id=i.ramp_transaction_id
    WHERE r.provider='VFD' AND i.bank->>'account_number'=$1 AND i.state IN ('creating','pending','review','settling') ORDER BY i.created_at DESC LIMIT 1`,[parsed.data.account_number]);
  if(rampIntent.rows[0]){
   const occurred=vfdOccurredAt(parsed.data.timestamp);
   await recordVerifiedFiatReceipt(rampIntent.rows[0].reference,{reference:rampIntent.rows[0].reference,providerReference:parsed.data.session_id,currency:'NGN',amountMinor:Number(kobo(parsed.data.amount)),feeMinor:0,paidAt:occurred.toISOString(),status:'success',channel:'bank_transfer'},'VFD');
   res.sendStatus(200);return;
  }
  await transaction(async db=>{
   const mapped=await db.query(`SELECT d.account_id,a.tier FROM consumer_quick_pay_deposit_accounts d JOIN consumer_accounts a ON a.id=d.account_id
     WHERE d.account_number=$1 AND d.provider='VFD' AND d.status='ACTIVE' FOR UPDATE`,[parsed.data.account_number]);
   if(!mapped.rows[0])throw new Error('Unmapped VFD account');
   const existing=await db.query('SELECT session_id FROM consumer_vfd_inward_credits WHERE session_id=$1',[parsed.data.session_id]);if(existing.rowCount)return;
   const amount=kobo(parsed.data.amount);const occurred=vfdOccurredAt(parsed.data.timestamp);
   const conversion=(await db.query(`SELECT id,reference FROM ramp_transactions
     WHERE consumer_account_id=$1 AND provider='VFD' AND direction='OFF_RAMP'
       AND metadata->>'source'='quick_pay_conversion' AND fiat_amount_minor=$2
       AND (provider_reference=$3 OR metadata->>'payoutRequestReference'=$3)
     ORDER BY created_at DESC LIMIT 1`,[mapped.rows[0].account_id,amount.toString(),parsed.data.reference])).rows[0];
   if(conversion){
    await db.query(`INSERT INTO consumer_vfd_inward_credits(session_id,provider_reference,deposit_account_id,amount_kobo,occurred_at,state)
      VALUES($1,$2,$3,$4,$5,'CREDITED')`,[parsed.data.session_id,parsed.data.reference,mapped.rows[0].account_id,amount.toString(),occurred]);
    const ledger=await db.query(`INSERT INTO consumer_quick_pay_ledger_entries(id,account_id,direction,kind,amount_kobo,reference,provider,provider_reference,effective_at,metadata)
      VALUES($1,$2,'CREDIT','SMART_CONVERSION',$3,$4,'VFD',$5,$6,$7) ON CONFLICT(reference) DO NOTHING RETURNING id`,[randomUUID(),mapped.rows[0].account_id,amount.toString(),conversion.reference,parsed.data.reference,occurred,{rampTransactionId:conversion.id}]);
    if(ledger.rowCount)await db.query(`INSERT INTO consumer_quick_pay_accounts(account_id,balance_kobo) VALUES($1,$2)
      ON CONFLICT(account_id) DO UPDATE SET balance_kobo=consumer_quick_pay_accounts.balance_kobo+$2::bigint,updated_at=NOW()`,[mapped.rows[0].account_id,amount.toString()]);
    return;
   }
   const used=await db.query(`SELECT COALESCE(SUM(amount_kobo),0)::text AS total FROM consumer_quick_pay_ledger_entries
     WHERE account_id=$1 AND direction='CREDIT' AND kind IN ('BANK_DEPOSIT','SMART_CONVERSION') AND effective_at>$2::timestamptz-INTERVAL '24 hours' AND effective_at<=$2`,[mapped.rows[0].account_id,occurred]);
   const over=BigInt(used.rows[0].total)+amount>limits[mapped.rows[0].tier as 1|2|3];
   await db.query(`INSERT INTO consumer_vfd_inward_credits(session_id,provider_reference,deposit_account_id,amount_kobo,occurred_at,state,reason)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,[parsed.data.session_id,parsed.data.reference,mapped.rows[0].account_id,amount.toString(),occurred,over?'REVIEW':'CREDITED',over?'rolling_limit':null]);
   if(over)return;
   const ledger=await db.query(`INSERT INTO consumer_quick_pay_ledger_entries(id,account_id,direction,kind,amount_kobo,reference,provider,provider_reference,effective_at)
     VALUES($1,$2,'CREDIT','BANK_DEPOSIT',$3,$4,'VFD',$5,$6) ON CONFLICT(reference) DO NOTHING RETURNING id`,[randomUUID(),mapped.rows[0].account_id,amount.toString(),`vfd:${parsed.data.session_id}`,parsed.data.reference,occurred]);
   if(!ledger.rowCount)return;
   await db.query(`INSERT INTO consumer_quick_pay_accounts(account_id,balance_kobo) VALUES($1,$2)
     ON CONFLICT(account_id) DO UPDATE SET balance_kobo=consumer_quick_pay_accounts.balance_kobo+$2::bigint,updated_at=NOW()`,[mapped.rows[0].account_id,amount.toString()]);
  });
  res.sendStatus(200);
 }catch(error){console.error('[vfd/webhook] processing failed',{message:error instanceof Error?error.message:'Unknown error'});res.sendStatus(503);}
});
