import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import type { Identity } from '../consumer/auth.js';
import { MartError } from './service.js';
import { notifyBuyerForOrder, notifyMerchantForOrder } from './notifications.js';

export type FulfillmentInput={method:'PICKUP'|'DISPATCH';recipientName:string;recipientPhone:string;deliveryAddress?:string;instructions?:string};
const key=createHash('sha256').update(`oynk:mart:handoff:v1\0${config.AUTH_TOKEN_PEPPER}`).digest();
const phonePattern=/^\+[1-9][0-9]{7,14}$/;

function protect(pin:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const value=Buffer.concat([cipher.update(pin,'utf8'),cipher.final()]);return`${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${value.toString('base64url')}`;}
function reveal(value:string){const[iv,tag,data]=value.split('.');if(!iv||!tag||!data)throw new Error('Invalid handoff PIN ciphertext.');const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));decipher.setAuthTag(Buffer.from(tag,'base64url'));return Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8');}
function pinHash(pin:string){return createHmac('sha256',key).update(`pin\0${pin}`).digest('hex');}
function pinMatches(pin:string,expected:string){const actual=Buffer.from(pinHash(pin),'hex'),stored=Buffer.from(expected,'hex');return actual.length===stored.length&&timingSafeEqual(actual,stored);}

export function normalizeFulfillmentInput(raw:FulfillmentInput):FulfillmentInput{
 const value={method:raw.method,recipientName:raw.recipientName.trim().replace(/\s+/g,' '),recipientPhone:raw.recipientPhone.trim().replace(/[\s()-]/g,''),deliveryAddress:raw.deliveryAddress?.trim().replace(/\s+/g,' '),instructions:raw.instructions?.trim().replace(/\s+/g,' ')};
 if(value.recipientName.length<2||value.recipientName.length>120)throw new MartError('Enter the name of the person receiving this order.',400,'FULFILLMENT_NAME_INVALID');
 if(!phonePattern.test(value.recipientPhone))throw new MartError('Enter the recipient phone number in international format.',400,'FULFILLMENT_PHONE_INVALID');
 if(value.method==='DISPATCH'&&(!value.deliveryAddress||value.deliveryAddress.length<5||value.deliveryAddress.length>500))throw new MartError('Enter the dispatch address.',400,'FULFILLMENT_ADDRESS_REQUIRED');
 if((value.instructions?.length??0)>500)throw new MartError('Delivery instructions must be 500 characters or fewer.',400,'FULFILLMENT_INSTRUCTIONS_INVALID');
 return value;
}

export async function createFulfillment(db:PoolClient,identity:Identity,organizationId:string,raw:FulfillmentInput){
 const input=normalizeFulfillmentInput(raw);
 const store=(await db.query(`SELECT pickup_enabled,dispatch_enabled,pickup_address,dispatch_fee_minor,dispatch_min_days,dispatch_max_days FROM mart_storefronts WHERE organization_id=$1`,[organizationId])).rows[0];
 if(!store)throw new MartError('Store fulfilment options are unavailable.',409,'FULFILLMENT_UNAVAILABLE');
 if(input.method==='PICKUP'&&!store.pickup_enabled)throw new MartError('Pickup is not available from this store.',409,'PICKUP_UNAVAILABLE');
 if(input.method==='DISPATCH'&&!store.dispatch_enabled)throw new MartError('Dispatch is not available from this store.',409,'DISPATCH_UNAVAILABLE');
 const now=Date.now(),minDays=Number(store.dispatch_min_days),maxDays=Number(store.dispatch_max_days),pin=String(randomInt(0,1_000_000)).padStart(6,'0'),id=randomUUID();
 const readyAt=input.method==='PICKUP'?new Date(now+24*60*60_000):null;
 const deliveryAt=input.method==='DISPATCH'?new Date(now+maxDays*24*60*60_000):null;
 const fee=input.method==='DISPATCH'?String(store.dispatch_fee_minor):'0';
 await db.query(`INSERT INTO mart_fulfillments(id,organization_id,buyer_subject,buyer_network,buyer_wallet,method,recipient_name,recipient_phone,delivery_address,delivery_instructions,delivery_fee_minor,estimated_ready_at,estimated_delivery_at,handoff_pin_ciphertext,handoff_pin_hash)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,[id,organizationId,identity.subject,identity.network,identity.wallet,input.method,input.recipientName,input.recipientPhone,input.method==='DISPATCH'?input.deliveryAddress:null,input.instructions||null,fee,readyAt,deliveryAt,protect(pin),pinHash(pin)]);
 return{id,method:input.method,deliveryFeeMinor:fee,estimatedReadyAt:readyAt,estimatedDeliveryAt:deliveryAt,pickupAddress:String(store.pickup_address??'')};
}

export const fulfillmentJoin=`LEFT JOIN mart_fulfillments f ON f.id=o.fulfillment_id`;
export const fulfillmentColumns=`,f.method AS fulfillment_method,f.recipient_name,f.recipient_phone,f.delivery_address,f.delivery_instructions,f.delivery_fee_minor AS fulfillment_delivery_fee_minor,f.estimated_ready_at,f.estimated_delivery_at,f.handoff_pin_ciphertext,f.handoff_verified_at,f.buyer_confirmed_at`;

export function publicFulfillment(row:Record<string,unknown>,includePin:boolean){
 if(!row.fulfillment_id||!row.fulfillment_method)return null;
 const state=String(row.fulfillment_state??'NOT_STARTED');
 return{id:row.fulfillment_id,method:row.fulfillment_method,recipientName:row.recipient_name,recipientPhone:row.recipient_phone,deliveryAddress:row.delivery_address??null,instructions:row.delivery_instructions??null,deliveryFeeMinor:String(row.fulfillment_delivery_fee_minor??0),estimatedReadyAt:row.estimated_ready_at??null,estimatedDeliveryAt:row.estimated_delivery_at??null,handoffPin:includePin&&['PAID'].includes(String(row.state))&&!['DELIVERED','CLOSED','DISPUTED'].includes(state)&&typeof row.handoff_pin_ciphertext==='string'?reveal(row.handoff_pin_ciphertext):null,handoffVerifiedAt:row.handoff_verified_at??null,buyerConfirmedAt:row.buyer_confirmed_at??null};
}

export async function fulfillmentTimeline(identity:Identity,orderId:string){
 const owned=await pool.query(`SELECT id FROM mart_orders WHERE id=$1 AND buyer_subject=$2 AND buyer_network=$3 AND buyer_wallet=$4`,[orderId,identity.subject,identity.network,identity.wallet]);
 if(!owned.rows[0])throw new MartError('Order not found.',404,'ORDER_NOT_FOUND');
 const events=await pool.query(`SELECT id,action,actor_type AS "actorType",metadata,created_at AS "createdAt" FROM mart_order_events WHERE order_id=$1 ORDER BY created_at`,[orderId]);return{events:events.rows};
}

export async function updateFulfillmentProgress(organizationId:string,userId:string,orderId:string,next:'READY'|'OUT_FOR_DELIVERY'){
 const db=await pool.connect();try{await db.query('BEGIN');
  const row=(await db.query(`SELECT o.state,o.fulfillment_state,o.fulfillment_id,f.method FROM mart_orders o JOIN mart_fulfillments f ON f.id=o.fulfillment_id WHERE o.id=$1 AND o.organization_id=$2 FOR UPDATE OF o,f`,[orderId,organizationId])).rows[0];
  if(!row)throw new MartError('Order not found.',404,'ORDER_NOT_FOUND');if(row.state!=='PAID')throw new MartError('Payment must be complete before fulfilment can be updated.',409,'ORDER_NOT_PAID');
  const allowed:Record<string,string[]>={NOT_STARTED:['READY','OUT_FOR_DELIVERY'],PREPARING:['READY','OUT_FOR_DELIVERY'],READY:['OUT_FOR_DELIVERY']};
  if(!allowed[String(row.fulfillment_state)]?.includes(next))throw new MartError('This fulfilment update is no longer available.',409,'FULFILLMENT_TRANSITION_INVALID');
  if(next==='OUT_FOR_DELIVERY'&&row.method!=='DISPATCH')throw new MartError('Pickup orders cannot be marked out for delivery.',409,'FULFILLMENT_METHOD_INVALID');
  if(next==='OUT_FOR_DELIVERY'){
   const goTask=(await db.query(`SELECT state FROM oynk_go_delivery_tasks WHERE fulfillment_id=$1 FOR UPDATE`,[row.fulfillment_id])).rows[0];
   if(goTask&&['ASSIGNED','PICKED_UP'].includes(goTask.state))throw new MartError('An Oynk Go rider already owns this delivery.',409,'DELIVERY_ALREADY_ASSIGNED');
  }
  await db.query(`UPDATE mart_orders SET fulfillment_state=$3,updated_at=NOW() WHERE fulfillment_id=$1 AND organization_id=$2 AND state='PAID'`,[row.fulfillment_id,organizationId,next]);
  const affected=(await db.query(`SELECT id FROM mart_orders WHERE fulfillment_id=$1`,[row.fulfillment_id])).rows;
  for(const item of affected){await db.query(`INSERT INTO mart_order_events(id,order_id,action,actor_type,actor_reference) VALUES($1,$2,$3,'MERCHANT',$4)`,[randomUUID(),item.id,`FULFILLMENT_${next}`,userId]);await notifyBuyerForOrder(db,item.id,{type:`ORDER_${next}`,title:next==='READY'?'Your order is ready':'Your order is on the way',body:next==='READY'?(row.method==='PICKUP'?'Take your pickup PIN when you collect it.':'The store has prepared your order.'):'Keep your delivery PIN private until the order reaches you.',data:{orderId:item.id},event:`fulfillment-${next.toLowerCase()}`});}
  // Dispatch work becomes available when the store has the order ready. An
  // Oynk Go rider claims it first; confirming pickup is what moves the order
  // to OUT_FOR_DELIVERY. A merchant can still use its own courier and move it
  // directly to OUT_FOR_DELIVERY, in which case any unclaimed Go task closes.
  if(next==='READY'&&row.method==='DISPATCH')await db.query(`INSERT INTO oynk_go_delivery_tasks(id,fulfillment_id,state) VALUES($1,$2,'AVAILABLE') ON CONFLICT(fulfillment_id) DO NOTHING`,[randomUUID(),row.fulfillment_id]);
  if(next==='OUT_FOR_DELIVERY')await db.query(`UPDATE oynk_go_delivery_tasks SET state='CANCELLED',updated_at=NOW() WHERE fulfillment_id=$1 AND state='AVAILABLE'`,[row.fulfillment_id]);
  await db.query('COMMIT');return{orderId,fulfillmentState:next};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}

export async function verifyHandoff(organizationId:string,userId:string,orderId:string,pin:string,actorType:'MERCHANT'|'RIDER'='MERCHANT'){
 if(!/^\d{6}$/.test(pin))throw new MartError('Enter the six-digit pickup or delivery PIN.',400,'HANDOFF_PIN_INVALID');
 const db=await pool.connect();try{await db.query('BEGIN');
  const row=(await db.query(`SELECT o.state,o.fulfillment_state,o.fulfillment_id,f.handoff_pin_hash,f.handoff_pin_failures,f.handoff_pin_locked_until FROM mart_orders o JOIN mart_fulfillments f ON f.id=o.fulfillment_id WHERE o.id=$1 AND o.organization_id=$2 FOR UPDATE OF o,f`,[orderId,organizationId])).rows[0];
  if(!row)throw new MartError('Order not found.',404,'ORDER_NOT_FOUND');if(row.state!=='PAID'||!['READY','OUT_FOR_DELIVERY'].includes(row.fulfillment_state))throw new MartError('This order is not ready for handoff.',409,'HANDOFF_NOT_READY');
  if(row.handoff_pin_locked_until&&new Date(row.handoff_pin_locked_until).getTime()>Date.now())throw new MartError('Too many incorrect PIN attempts. Try again later.',429,'HANDOFF_PIN_LOCKED');
  if(!pinMatches(pin,row.handoff_pin_hash)){const failures=Number(row.handoff_pin_failures)+1;await db.query(`UPDATE mart_fulfillments SET handoff_pin_failures=$2,handoff_pin_locked_until=CASE WHEN $2>=5 THEN NOW()+INTERVAL '15 minutes' ELSE NULL END,updated_at=NOW() WHERE id=$1`,[row.fulfillment_id,failures]);await db.query('COMMIT');throw new MartError(failures>=5?'Too many incorrect PIN attempts. Try again later.':'The handoff PIN is incorrect.',failures>=5?429:400,failures>=5?'HANDOFF_PIN_LOCKED':'HANDOFF_PIN_INCORRECT');}
  await db.query(`UPDATE mart_fulfillments SET handoff_verified_at=NOW(),handoff_pin_failures=0,handoff_pin_locked_until=NULL,updated_at=NOW() WHERE id=$1`,[row.fulfillment_id]);
  await db.query(`UPDATE mart_orders SET fulfillment_state='DELIVERED',updated_at=NOW() WHERE fulfillment_id=$1 AND state='PAID'`,[row.fulfillment_id]);
  const affected=(await db.query(`SELECT id FROM mart_orders WHERE fulfillment_id=$1`,[row.fulfillment_id])).rows;for(const item of affected){await db.query(`INSERT INTO mart_order_events(id,order_id,action,actor_type,actor_reference) VALUES($1,$2,'HANDOFF_PIN_VERIFIED',$3,$4)`,[randomUUID(),item.id,actorType,userId]);await notifyBuyerForOrder(db,item.id,{type:'ORDER_DELIVERED',title:'Order handed over',body:'The pickup or delivery PIN was verified. Confirm receipt after checking your order.',data:{orderId:item.id},event:'handoff-verified'});}
  await db.query(`UPDATE oynk_go_delivery_tasks SET state='DELIVERED',delivered_at=NOW(),updated_at=NOW() WHERE fulfillment_id=$1`,[row.fulfillment_id]);
  await db.query('COMMIT');return{orderId,fulfillmentState:'DELIVERED'};
 }catch(error){if(!(error instanceof MartError&&['HANDOFF_PIN_INCORRECT','HANDOFF_PIN_LOCKED'].includes(error.code)))await db.query('ROLLBACK').catch(()=>undefined);throw error;}finally{db.release();}}

export async function confirmReceipt(identity:Identity,orderId:string){
 const db=await pool.connect();try{await db.query('BEGIN');const row=(await db.query(`SELECT id,organization_id,fulfillment_id,fulfillment_state FROM mart_orders WHERE id=$1 AND buyer_subject=$2 AND buyer_network=$3 AND buyer_wallet=$4 FOR UPDATE`,[orderId,identity.subject,identity.network,identity.wallet])).rows[0];
  if(!row)throw new MartError('Order not found.',404,'ORDER_NOT_FOUND');if(row.fulfillment_state!=='DELIVERED')throw new MartError('The order must be handed over before receipt can be confirmed.',409,'ORDER_NOT_DELIVERED');
  await db.query(`UPDATE mart_fulfillments SET buyer_confirmed_at=NOW(),updated_at=NOW() WHERE id=$1`,[row.fulfillment_id]);await db.query(`UPDATE mart_orders SET fulfillment_state='CLOSED',updated_at=NOW() WHERE fulfillment_id=$1 AND fulfillment_state='DELIVERED'`,[row.fulfillment_id]);
  const affected=(await db.query(`SELECT id FROM mart_orders WHERE fulfillment_id=$1`,[row.fulfillment_id])).rows;for(const item of affected)await db.query(`INSERT INTO mart_order_events(id,order_id,action,actor_type,actor_reference) VALUES($1,$2,'BUYER_CONFIRMED_RECEIPT','BUYER',$3)`,[randomUUID(),item.id,identity.subject]);
  await notifyMerchantForOrder(db,orderId,{type:'ORDER_RECEIPT_CONFIRMED',title:'Customer confirmed receipt',body:'The customer confirmed that the order was received.',data:{orderId},event:'receipt-confirmed'});await db.query('COMMIT');return{orderId,fulfillmentState:'CLOSED'};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}

export async function createDispute(identity:Identity,orderId:string,reason:'NOT_RECEIVED'|'DAMAGED'|'WRONG_ITEM'|'MISSING_ITEM'|'OTHER',details:string){
 const clean=details.trim();if(!clean||clean.length>1000)throw new MartError('Describe the problem in 1,000 characters or fewer.',400,'DISPUTE_DETAILS_INVALID');
 const db=await pool.connect();try{await db.query('BEGIN');const row=(await db.query(`SELECT id,organization_id,fulfillment_state FROM mart_orders WHERE id=$1 AND buyer_subject=$2 AND buyer_network=$3 AND buyer_wallet=$4 AND state='PAID' FOR UPDATE`,[orderId,identity.subject,identity.network,identity.wallet])).rows[0];
  if(!row)throw new MartError('Paid order not found.',404,'ORDER_NOT_FOUND');if(row.fulfillment_state==='CLOSED')throw new MartError('This completed order can no longer be disputed from the app. Contact support.',409,'DISPUTE_WINDOW_CLOSED');
  const id=randomUUID();await db.query(`INSERT INTO mart_order_disputes(id,order_id,buyer_subject,reason,details) VALUES($1,$2,$3,$4,$5)`,[id,orderId,identity.subject,reason,clean]);await db.query(`UPDATE mart_orders SET fulfillment_state='DISPUTED',updated_at=NOW() WHERE id=$1`,[orderId]);await db.query(`INSERT INTO mart_order_events(id,order_id,action,actor_type,actor_reference,metadata) VALUES($1,$2,'DISPUTE_OPENED','BUYER',$3,$4)`,[randomUUID(),orderId,identity.subject,{disputeId:id,reason}]);
  await notifyMerchantForOrder(db,orderId,{type:'ORDER_DISPUTED',title:'Customer reported an order problem',body:'Review the order issue in Oynk Console. The order cannot be closed while it is disputed.',data:{orderId,disputeId:id},event:`dispute-${id}`});await db.query('COMMIT');return{id,orderId,state:'OPEN'};
 }catch(error){await db.query('ROLLBACK');if((error as {code?:string}).code==='23505')throw new MartError('An open dispute already exists for this order.',409,'DISPUTE_EXISTS');throw error;}finally{db.release();}}
