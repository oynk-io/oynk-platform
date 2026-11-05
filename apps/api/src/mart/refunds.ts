import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { vfdPayoutProvider } from '../consumer/providers/vfdProvider.js';
import { MartError } from './service.js';
import { notifyBuyerForOrder } from './notifications.js';

type RefundReason='LAYAWAY_EXPIRED'|'MERCHANT_CANCELLED'|'DISPUTE_RESOLVED'|'ORDER_CANCELLED';
type RefundPort={destination:(input:{name:string;accountNumber:string})=>Promise<string>;send:(input:{reference:string;amountKobo:string;sourceAccount:string;destinationToken:string})=>Promise<{providerReference:string;status:'success'|'failed'|'pending'|'processing'}>;verify:(reference:string)=>Promise<{providerReference:string;status:'success'|'failed'|'pending'|'processing'}>};
const port:RefundPort={destination:async input=>(await vfdPayoutProvider.createDestination({name:input.name,accountNumber:input.accountNumber,bankCode:'999999',currency:'NGN'})).destinationToken,send:async input=>vfdPayoutProvider.createPayout({reference:input.reference,amountMinor:input.amountKobo,currency:'NGN',destinationToken:input.destinationToken,idempotencyKey:input.reference,sourceAccountNumber:input.sourceAccount}),verify:async reference=>vfdPayoutProvider.verifyPayout(reference)};

async function refundEvent(db:PoolClient,refundId:string,action:string,fromState:string|null,toState:string,actorType:'BUYER'|'MERCHANT'|'OPERATOR'|'SYSTEM'|'PROVIDER',actorReference:string,metadata:Record<string,unknown>={}){await db.query(`INSERT INTO mart_refund_events(id,refund_id,action,from_state,to_state,actor_type,actor_reference,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[randomUUID(),refundId,action,fromState,toState,actorType,actorReference,metadata]);}

export async function queueMartRefund(db:PoolClient,orderId:string,reason:RefundReason,actorType:'MERCHANT'|'OPERATOR'|'SYSTEM',actorReference:string,disputeId?:string){
 const row=(await db.query(`SELECT o.id,o.state,o.organization_id,q.total_minor,COALESCE(f.delivery_fee_minor,0) delivery_fee_minor,a.id consumer_account_id,d.account_number destination_account_number,
  COALESCE(NULLIF(h.handle,''),'Oynk customer') destination_name,b.vfd_account_number merchant_account,
  (SELECT destination_account_number FROM mart_payments WHERE order_id=o.id AND state='COMPLETED' ORDER BY completed_at LIMIT 1) holding_account,
  (SELECT COALESCE(SUM(amount_kobo),0) FROM mart_payments WHERE order_id=o.id AND state='COMPLETED') contributed
  FROM mart_orders o JOIN mart_quotes q ON q.id=o.quote_id JOIN consumer_accounts a ON a.subject=o.buyer_subject AND a.network=o.buyer_network AND a.wallet=o.buyer_wallet
  JOIN consumer_quick_pay_deposit_accounts d ON d.account_id=a.id AND d.provider='VFD' AND d.status='ACTIVE'
  LEFT JOIN consumer_handles h ON h.account_id=a.id LEFT JOIN business_financial_accounts b ON b.organization_id=o.organization_id LEFT JOIN mart_fulfillments f ON f.id=o.fulfillment_id
  WHERE o.id=$1 FOR UPDATE OF o`,[orderId])).rows[0];
 if(!row)throw new MartError('The customer refund account is not available.',409,'REFUND_DESTINATION_UNAVAILABLE');
 const layaway=reason==='LAYAWAY_EXPIRED';const amount=layaway?BigInt(row.contributed):BigInt(row.total_minor)+BigInt(row.delivery_fee_minor);if(amount<=0n)return null;
 const source=layaway?row.holding_account:row.merchant_account;if(!/^\d{10}$/.test(String(source??'')))throw new MartError('The refund source account is not ready.',409,'REFUND_SOURCE_UNAVAILABLE');
 const id=randomUUID(),reference=`mart-refund-${id}`;
 const inserted=(await db.query(`INSERT INTO mart_refunds(id,order_id,dispute_id,consumer_account_id,reason,amount_kobo,source_account_number,destination_account_number,provider_reference)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(order_id,reason) DO NOTHING RETURNING id`,[id,orderId,disputeId??null,row.consumer_account_id,reason,String(amount),source,row.destination_account_number,reference])).rows[0];
 if(!inserted)return null;await refundEvent(db,id,'REFUND_QUEUED',null,'PENDING',actorType,actorReference,{reason,amountKobo:String(amount),destinationName:row.destination_name});
 await notifyBuyerForOrder(db,orderId,{type:'ORDER_REFUND_STARTED',title:'Your refund is being processed',body:`Oynk is returning ₦${(Number(amount)/100).toLocaleString('en-NG',{minimumFractionDigits:2})} to your Oynk Pay account.`,data:{orderId,refundId:id},event:`refund-${reason.toLowerCase()}`});return{id,amountKobo:String(amount),state:'PENDING'};
}

export async function merchantCancelPaidOrder(organizationId:string,userId:string,orderId:string,note:string){
 const clean=note.trim();if(clean.length<3||clean.length>500)throw new MartError('Explain why the paid order must be cancelled.',400,'CANCELLATION_REASON_REQUIRED');
 const db=await pool.connect();try{await db.query('BEGIN');const row=(await db.query(`SELECT id,fulfillment_state FROM mart_orders WHERE id=$1 AND organization_id=$2 AND state='PAID' FOR UPDATE`,[orderId,organizationId])).rows[0];if(!row)throw new MartError('Paid order not found.',404,'ORDER_NOT_FOUND');if(['DELIVERED','CLOSED','DISPUTED'].includes(row.fulfillment_state))throw new MartError('This order cannot be cancelled. Use the dispute process.',409,'ORDER_NOT_CANCELLABLE');
  const refund=await queueMartRefund(db,orderId,'MERCHANT_CANCELLED','MERCHANT',userId);await db.query(`UPDATE mart_orders SET state='CANCELLED',updated_at=NOW() WHERE id=$1`,[orderId]);await db.query(`INSERT INTO mart_order_events(id,order_id,action,actor_type,actor_reference,metadata) VALUES($1,$2,'MERCHANT_CANCELLED_PAID_ORDER','MERCHANT',$3,$4)`,[randomUUID(),orderId,userId,{note,refundId:refund?.id??null}]);await db.query('COMMIT');return{orderId,state:'CANCELLED',refund};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}

export async function queueExpiredLayawayRefunds(limit=40){
 const orders=(await pool.query(`SELECT o.id FROM mart_orders o JOIN mart_layaway_plans p ON p.order_id=o.id WHERE o.state='EXPIRED' AND p.state='EXPIRED' AND EXISTS(SELECT 1 FROM mart_payments mp WHERE mp.order_id=o.id AND mp.state='COMPLETED') AND NOT EXISTS(SELECT 1 FROM mart_refunds r WHERE r.order_id=o.id AND r.reason='LAYAWAY_EXPIRED') ORDER BY p.deadline_at LIMIT $1`,[limit])).rows;
 for(const order of orders){const db=await pool.connect();try{await db.query('BEGIN');await queueMartRefund(db,order.id,'LAYAWAY_EXPIRED','SYSTEM','layaway-expiry-worker');await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');console.error('[mart] could not queue expired layaway refund',{orderId:order.id,message:error instanceof Error?error.message:'Unknown error'});}finally{db.release();}}
 return orders.length;
}

async function finishRefund(id:string,status:'success'|'failed'|'pending'|'processing',providerReference:string){const db=await pool.connect();try{await db.query('BEGIN');const row=(await db.query(`SELECT * FROM mart_refunds WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!row||['COMPLETED','FAILED'].includes(row.state)){await db.query('COMMIT');return;}if(status==='success'){await db.query(`UPDATE mart_refunds SET state='COMPLETED',provider_returned_reference=$2,completed_at=NOW(),next_reconciliation_at=NULL,updated_at=NOW() WHERE id=$1`,[id,providerReference]);await refundEvent(db,id,'REFUND_COMPLETED',row.state,'COMPLETED','PROVIDER',providerReference);await notifyBuyerForOrder(db,row.order_id,{type:'ORDER_REFUND_COMPLETED',title:'Refund complete',body:'The refund is now available in your Oynk Pay account.',data:{orderId:row.order_id,refundId:id},event:`refund-complete-${id}`});}else if(status==='failed'){await db.query(`UPDATE mart_refunds SET state='FAILED',provider_returned_reference=$2,failure_code='PROVIDER_DECLINED',next_reconciliation_at=NULL,updated_at=NOW() WHERE id=$1`,[id,providerReference]);await refundEvent(db,id,'REFUND_FAILED',row.state,'FAILED','PROVIDER',providerReference);}else{await db.query(`UPDATE mart_refunds SET state='PROCESSING',provider_returned_reference=$2,next_reconciliation_at=NOW()+INTERVAL '30 seconds',updated_at=NOW() WHERE id=$1`,[id,providerReference]);await refundEvent(db,id,'REFUND_PROCESSING',row.state,'PROCESSING','PROVIDER',providerReference);}await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}

export async function reconcileMartRefunds(limit=20,provider:RefundPort=port){
 const rows=(await pool.query(`SELECT r.*,COALESCE(NULLIF(h.handle,''),'Oynk customer') destination_name FROM mart_refunds r LEFT JOIN consumer_handles h ON h.account_id=r.consumer_account_id WHERE r.state IN ('PENDING','PROCESSING','RECONCILIATION_REQUIRED') AND r.next_reconciliation_at<=NOW() ORDER BY r.next_reconciliation_at LIMIT $1`,[limit])).rows;
 for(const row of rows){try{if(row.state==='PENDING'){const destination=await provider.destination({name:row.destination_name,accountNumber:row.destination_account_number});const claimed=await pool.query(`UPDATE mart_refunds SET state='PROCESSING',next_reconciliation_at=NOW()+INTERVAL '30 seconds',updated_at=NOW() WHERE id=$1 AND state='PENDING' RETURNING id`,[row.id]);if(!claimed.rows[0])continue;const result=await provider.send({reference:row.provider_reference,amountKobo:String(row.amount_kobo),sourceAccount:row.source_account_number,destinationToken:destination});await finishRefund(row.id,result.status,result.providerReference);}else{const result=await provider.verify(row.provider_returned_reference??row.provider_reference);await finishRefund(row.id,result.status,result.providerReference);}}catch(error){await pool.query(`UPDATE mart_refunds SET state='RECONCILIATION_REQUIRED',reconciliation_attempts=reconciliation_attempts+1,failure_code=$2,next_reconciliation_at=NOW()+INTERVAL '1 minute',updated_at=NOW() WHERE id=$1 AND state IN ('PROCESSING','RECONCILIATION_REQUIRED')`,[row.id,error instanceof Error?error.message.slice(0,160):'REFUND_UNAVAILABLE']);}}
 return rows.length;
}

export async function refundsForOrder(orderId:string){return(await pool.query(`SELECT id,reason,amount_kobo AS "amountKobo",state,failure_code AS "failureCode",completed_at AS "completedAt",created_at AS "createdAt" FROM mart_refunds WHERE order_id=$1 ORDER BY created_at`,[orderId])).rows;}
