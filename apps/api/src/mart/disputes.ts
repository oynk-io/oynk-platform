import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { notifyBuyerForOrder, notifyMerchantForOrder } from './notifications.js';
import { queueMartRefund } from './refunds.js';
import { MartError } from './service.js';

export async function listMartDisputes(state?:string){
 const result=await pool.query(`SELECT d.id,d.order_id AS "orderId",d.reason,d.details,d.state,d.resolution_note AS "resolutionNote",d.resolved_by AS "resolvedBy",d.resolved_at AS "resolvedAt",d.created_at AS "createdAt",
  o.organization_id AS "organizationId",org.legal_name AS "businessName",COALESCE(NULLIF(h.handle,''),'Oynk customer') AS "customerName",q.total_minor::text AS "orderTotalMinor",f.method AS "fulfillmentMethod"
  FROM mart_order_disputes d JOIN mart_orders o ON o.id=d.order_id JOIN organizations org ON org.id=o.organization_id JOIN mart_quotes q ON q.id=o.quote_id
  LEFT JOIN mart_fulfillments f ON f.id=o.fulfillment_id LEFT JOIN consumer_accounts a ON a.subject=o.buyer_subject AND a.network=o.buyer_network AND a.wallet=o.buyer_wallet LEFT JOIN consumer_handles h ON h.account_id=a.id
  WHERE ($1::text IS NULL OR d.state=$1) ORDER BY CASE WHEN d.state IN ('OPEN','UNDER_REVIEW') THEN 0 ELSE 1 END,d.created_at DESC LIMIT 200`,[state??null]);
 return result.rows;
}

export async function resolveMartDispute(disputeId:string,operatorId:string,outcome:'BUYER'|'MERCHANT',note:string){
 const clean=note.trim();if(clean.length<3||clean.length>1000)throw new MartError('Add a clear resolution note.',400,'RESOLUTION_NOTE_REQUIRED');
 const db=await pool.connect();try{await db.query('BEGIN');
  const row=(await db.query(`SELECT d.id,d.order_id,o.fulfillment_id,f.handoff_verified_at FROM mart_order_disputes d JOIN mart_orders o ON o.id=d.order_id LEFT JOIN mart_fulfillments f ON f.id=o.fulfillment_id WHERE d.id=$1 AND d.state IN ('OPEN','UNDER_REVIEW') FOR UPDATE OF d,o`,[disputeId])).rows[0];
  if(!row)throw new MartError('This dispute is no longer open.',409,'DISPUTE_NOT_OPEN');
  let refund=null;
  if(outcome==='BUYER'){
   refund=await queueMartRefund(db,row.order_id,'DISPUTE_RESOLVED','OPERATOR',operatorId,disputeId);
   await db.query(`UPDATE mart_orders SET state='CANCELLED',fulfillment_state='DISPUTED',updated_at=NOW() WHERE id=$1`,[row.order_id]);
  }else{
   await db.query(`UPDATE mart_orders SET fulfillment_state=$2,updated_at=NOW() WHERE id=$1`,[row.order_id,row.handoff_verified_at?'DELIVERED':'PREPARING']);
  }
  const state=outcome==='BUYER'?'RESOLVED_BUYER':'RESOLVED_MERCHANT';
  await db.query(`UPDATE mart_order_disputes SET state=$2,resolution_note=$3,resolved_by=$4,resolved_at=NOW(),updated_at=NOW() WHERE id=$1`,[disputeId,state,clean,operatorId]);
  await db.query(`INSERT INTO mart_order_events(id,order_id,action,actor_type,actor_reference,metadata) VALUES($1,$2,'DISPUTE_RESOLVED','OPERATOR',$3,$4)`,[randomUUID(),row.order_id,operatorId,{disputeId,outcome,note:clean,refundId:refund?.id??null}]);
  await notifyBuyerForOrder(db,row.order_id,{type:'DISPUTE_RESOLVED',title:'Your order report was reviewed',body:outcome==='BUYER'?'A refund has been started for this order.':'The order remains active. Open it to review the resolution.',data:{orderId:row.order_id,disputeId,outcome},event:`dispute-resolved-${disputeId}`});
  await notifyMerchantForOrder(db,row.order_id,{type:'DISPUTE_RESOLVED',title:'Order dispute resolved',body:outcome==='BUYER'?'The customer refund has been started.':'The order has been returned to fulfilment.',data:{orderId:row.order_id,disputeId,outcome},event:`merchant-dispute-resolved-${disputeId}`});
  await db.query('COMMIT');return{id:disputeId,orderId:row.order_id,state,refund};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
