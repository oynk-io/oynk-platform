import { createHmac, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import type { Identity } from '../consumer/auth.js';
import { MartError } from './service.js';
import { MART_LAYAWAY_SERVICE_FEE_MINOR, layawayPolicyFor } from './model.js';
import { createFulfillment, fulfillmentColumns, fulfillmentJoin, publicFulfillment, updateFulfillmentProgress, type FulfillmentInput } from './fulfillment.js';
import { notifyBuyerForOrder, notifyMerchantForOrder } from './notifications.js';
import { queueExpiredLayawayRefunds } from './refunds.js';

type PurchaseMode='PAY_NOW'|'LAYAWAY';
export type Offer={id:string;organization_id:string;connection_id:string;source_item_id:string;source_revision:string;source_system:string;source_tenant_id:string;token_hash:string;currency:string;kind:string;category:string|null;store_category:string;price_minor:string};
export type SourceQuote={sourceItemId:string;revision:number;currency:string;unitPriceMinor:number;availableQuantity:string|null;active:boolean;published:boolean};
const quoteTtlMs=5*60_000;
const dayMs=86_400_000;

export function sourceQuoteSignature(key:string,connectionId:string,timestamp:string,body:string){
 return createHmac('sha256',key).update(`mart-source-quote:v1\n${connectionId}\n${timestamp}\n${body}`).digest('hex');
}

export function sourceCanFulfil(kind:string,availableQuantity:string|null,requestedQuantity:number){
 if(!Number.isSafeInteger(requestedQuantity)||requestedQuantity<1)return false;
 // Services have no stock ledger. A null source quantity means the service is
 // currently bookable; when a provider supplies capacity, still honour it.
 if(availableQuantity===null)return kind==='SERVICE';
 if(!/^\d{1,15}(?:\.\d{1,3})?$/.test(availableQuantity))return false;
 return Number(availableQuantity)>=requestedQuantity;
}

export async function offer(itemId:string):Promise<Offer>{
 const row=(await pool.query(`SELECT i.id,i.organization_id,i.connection_id,i.source_item_id,i.source_revision,i.currency,i.kind,i.category,i.price_minor,s.category store_category,c.source_system,c.source_tenant_id,c.token_hash
  FROM mart_items i JOIN mart_connections c ON c.id=i.connection_id JOIN mart_storefronts s ON s.organization_id=i.organization_id JOIN organizations o ON o.id=i.organization_id
  WHERE i.id=$1 AND i.published AND i.source_active AND i.availability='IN_STOCK' AND i.last_synced_at>NOW()-INTERVAL '24 hours'
   AND c.status='ACTIVE' AND s.status='PUBLISHED' AND o.status='ACTIVE'`,[itemId])).rows[0];
 if(!row)throw new MartError('This item is not available.',404,'OFFER_UNAVAILABLE');
 return row as Offer;
}
export async function recheckMartOrder(itemId:string,quantity:number,unitPriceMinor:string,currency:string){
 const live=await confirmSourcePrice(await offer(itemId),quantity);
 if(live.unitPriceMinor!==Number(unitPriceMinor)||live.currency!==currency)throw new MartError('The price changed. Ask the buyer to request a new quote.',409,'QUOTE_PRICE_CHANGED');
 return live;
}

export async function confirmSourcePrice(item:Offer,quantity:number):Promise<SourceQuote>{
 // Registry is controlled by deployment configuration. Never fetch a URL supplied by a merchant.
 const target=item.source_system==='lemonbooks'?process.env.MART_LEMONBOOKS_API_URL?.trim():undefined;
 if(!target)throw new MartError('Live pricing is not available for this source yet.',503,'SOURCE_QUOTE_UNAVAILABLE');
 const url=new URL('/api/v3/integrations/oynk-mart/source-quote',target);
 const localSource=config.APP_ENV!=='production'&&url.protocol==='http:'&&['127.0.0.1','localhost','host.docker.internal'].includes(url.hostname);
 if(url.protocol!=='https:'&&!localSource)throw new MartError('Source quote service is not configured securely.',503,'SOURCE_QUOTE_UNAVAILABLE');
 const body=JSON.stringify({sourceItemId:item.source_item_id,quantity});
 const timestamp=String(Date.now());
 let response:Response;
 try{response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-mart-connection-id':item.connection_id,'x-mart-timestamp':timestamp,'x-mart-signature':sourceQuoteSignature(item.token_hash,item.connection_id,timestamp,body)},body,signal:AbortSignal.timeout(5000)});}
 catch{throw new MartError('Live pricing could not be checked. Try again shortly.',503,'SOURCE_QUOTE_UNAVAILABLE');}
 if(!response.ok)throw new MartError(response.status===409?'This item changed or is unavailable. Refresh and try again.':'Live pricing could not be checked. Try again shortly.',response.status===409?409:503,response.status===409?'SOURCE_OFFER_CHANGED':'SOURCE_QUOTE_UNAVAILABLE');
 let data:SourceQuote;
 try{data=await response.json() as SourceQuote;}catch{throw new MartError('Live pricing returned an invalid response.',503,'SOURCE_QUOTE_UNAVAILABLE');}
 if(data.sourceItemId!==item.source_item_id||data.currency!==item.currency||!Number.isSafeInteger(data.revision)||data.revision<Number(item.source_revision)||!Number.isSafeInteger(data.unitPriceMinor)||data.unitPriceMinor<0||!data.active||!data.published||!sourceCanFulfil(item.kind,data.availableQuantity,quantity))throw new MartError('This item changed or is unavailable. Refresh and try again.',409,'SOURCE_OFFER_CHANGED');
 return data;
}

export async function createMartQuote(itemId:string,quantity:number,purchaseMode:PurchaseMode='PAY_NOW',durationMonths?:number){
 const item=await offer(itemId);
 if(purchaseMode==='LAYAWAY'){
  if(!layawayPolicyFor(item as unknown as Record<string,unknown>).eligible)throw new MartError('Pay small small is not available for this item.',409,'LAYAWAY_NOT_AVAILABLE');
  if(!Number.isInteger(durationMonths)||(durationMonths??0)<1||(durationMonths??0)>3)throw new MartError('Choose a Pay small small period between 30 and 90 days.',400,'LAYAWAY_DURATION_INVALID');
 }else if(durationMonths!==undefined)throw new MartError('A payment duration is only valid for Pay small small.',400,'LAYAWAY_DURATION_INVALID');
 const live=await confirmSourcePrice(item,quantity);
 const merchandiseTotal=live.unitPriceMinor*quantity;
 const serviceFee=purchaseMode==='LAYAWAY'?MART_LAYAWAY_SERVICE_FEE_MINOR:0;
 const total=merchandiseTotal+serviceFee;
 if(!Number.isSafeInteger(total))throw new MartError('The quoted amount is too large.',400,'QUOTE_AMOUNT_INVALID');
 const id=randomUUID();const expiresAt=new Date(Date.now()+quoteTtlMs);
 await pool.query(`INSERT INTO mart_quotes(id,item_id,organization_id,source_revision,quantity,unit_price_minor,total_minor,currency,expires_at,purchase_mode,duration_months,merchandise_total_minor,service_fee_minor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[id,item.id,item.organization_id,live.revision,quantity,live.unitPriceMinor,total,live.currency,expiresAt,purchaseMode,purchaseMode==='LAYAWAY'?durationMonths:null,merchandiseTotal,serviceFee]);
 const months=purchaseMode==='LAYAWAY'?durationMonths!:null;
 return{id,itemId,merchantId:item.organization_id,quantity,unitPriceMinor:String(live.unitPriceMinor),merchandiseTotalMinor:String(merchandiseTotal),serviceFeeMinor:String(serviceFee),totalMinor:String(total),currency:live.currency,expiresAt:expiresAt.toISOString(),reservation:false,purchaseMode,durationMonths:months,payoffDays:months===null?null:months*30};
}

async function orderEvent(db:PoolClient,orderId:string,action:string,actorType:'BUYER'|'MERCHANT'|'SYSTEM',actorReference:string,metadata:Record<string,unknown>={}){
 await db.query(`INSERT INTO mart_order_events(id,order_id,action,actor_type,actor_reference,metadata) VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),orderId,action,actorType,actorReference,metadata]);
}
export async function createMartOrder(identity:Identity,quoteId:string,idempotencyKey:string,fulfillment:FulfillmentInput){
 const db=await pool.connect();try{await db.query('BEGIN');
  const existing=await db.query(`SELECT id,quote_id FROM mart_orders WHERE buyer_subject=$1 AND buyer_network=$2 AND idempotency_key=$3`,[identity.subject,identity.network,idempotencyKey]);
  if(existing.rows[0]){if(existing.rows[0].quote_id!==quoteId)throw new MartError('This request key belongs to another order.',409,'ORDER_KEY_CONFLICT');await db.query('COMMIT');return buyerOrder(identity,existing.rows[0].id);}
  const quote=(await db.query(`SELECT q.*,i.published,i.source_active,i.availability,c.status connection_status,s.status storefront_status FROM mart_quotes q JOIN mart_items i ON i.id=q.item_id JOIN mart_connections c ON c.id=i.connection_id JOIN mart_storefronts s ON s.organization_id=i.organization_id WHERE q.id=$1 FOR UPDATE OF q`,[quoteId])).rows[0];
  if(!quote||quote.state!=='ACTIVE'||new Date(quote.expires_at).getTime()<=Date.now()||!quote.published||!quote.source_active||quote.availability!=='IN_STOCK'||quote.connection_status!=='ACTIVE'||quote.storefront_status!=='PUBLISHED')throw new MartError('This quote expired or is no longer available.',409,'QUOTE_UNAVAILABLE');
  const prepared=await createFulfillment(db,identity,quote.organization_id,fulfillment);
  const id=randomUUID();await db.query(`INSERT INTO mart_orders(id,quote_id,organization_id,buyer_subject,buyer_network,buyer_wallet,idempotency_key,fulfillment_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,quoteId,quote.organization_id,identity.subject,identity.network,identity.wallet,idempotencyKey,prepared.id]);
  if(quote.purchase_mode==='LAYAWAY')await db.query(`INSERT INTO mart_layaway_plans(id,order_id,duration_months,merchandise_total_minor,service_fee_minor,delivery_fee_minor,total_minor) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),id,quote.duration_months,quote.merchandise_total_minor,quote.service_fee_minor,prepared.deliveryFeeMinor,String(BigInt(quote.total_minor)+BigInt(prepared.deliveryFeeMinor))]);
  await db.query(`UPDATE mart_quotes SET state='USED' WHERE id=$1`,[quoteId]);await orderEvent(db,id,'ORDER_REQUESTED','BUYER',identity.subject,{fulfillmentMethod:prepared.method});
  await notifyMerchantForOrder(db,id,{type:'MART_ORDER_REQUESTED',title:quote.purchase_mode==='LAYAWAY'?'New Pay small small request':'New order request',body:'A customer is waiting for the store to confirm availability.',data:{orderId:id},event:'requested'});
  await db.query('COMMIT');return buyerOrder(identity,id);
 }catch(error){await db.query('ROLLBACK');if((error as {code?:string}).code==='23505')throw new MartError('This quote or request key has already been used.',409,'ORDER_CONFLICT');throw error;}finally{db.release();}
}

type LayawayPublic={id:string;state:string;durationMonths:number;payoffDays:number;startsAt:Date|null;deadlineAt:Date|null;daysRemaining:number|null;merchandiseTotalMinor:string;serviceFeeMinor:string;totalMinor:string;paidMinor:string;remainingMinor:string;payments:Array<{id:string;amountMinor:string;paidAt:Date}>};
async function expireDueLayaways(orderIds?:string[]){
 const values=orderIds?.length?[orderIds]:[];
 const filter=orderIds?.length?'AND p.order_id=ANY($1::uuid[])':'';
 const expired=await pool.query(`UPDATE mart_layaway_plans p SET state='EXPIRED',updated_at=NOW()
  WHERE p.state='ACTIVE' AND p.deadline_at<=NOW() ${filter}
   AND (SELECT COALESCE(SUM(mp.amount_kobo),0) FROM mart_payments mp WHERE mp.layaway_plan_id=p.id AND mp.state='COMPLETED')<p.total_minor
  RETURNING p.order_id`,values);
 if(expired.rows.length){await pool.query(`UPDATE mart_orders SET state='EXPIRED',updated_at=NOW() WHERE id=ANY($1::uuid[]) AND state IN ('CONFIRMED_AWAITING_PAYMENT','LAYAWAY_ACTIVE')`,[expired.rows.map(row=>row.order_id)]);await queueExpiredLayawayRefunds(expired.rows.length);}
}
async function layawayDetails(orderIds:string[]){
 const plans=new Map<string,LayawayPublic>();if(!orderIds.length)return plans;
 const rows=await pool.query(`SELECT p.*,mp.id payment_id,mp.amount_kobo,mp.completed_at
  FROM mart_layaway_plans p LEFT JOIN mart_payments mp ON mp.layaway_plan_id=p.id AND mp.state='COMPLETED'
  WHERE p.order_id=ANY($1::uuid[]) ORDER BY p.order_id,mp.completed_at`,[orderIds]);
 for(const row of rows.rows){let plan=plans.get(row.order_id);if(!plan){const deadline=row.deadline_at?new Date(row.deadline_at):null;plan={id:row.id,state:row.state,durationMonths:Number(row.duration_months),payoffDays:Number(row.duration_months)*30,startsAt:row.starts_at??null,deadlineAt:deadline,daysRemaining:deadline?Math.max(0,Math.ceil((deadline.getTime()-Date.now())/dayMs)):null,merchandiseTotalMinor:String(row.merchandise_total_minor),serviceFeeMinor:String(row.service_fee_minor),totalMinor:String(row.total_minor),paidMinor:'0',remainingMinor:String(row.total_minor),payments:[]};plans.set(row.order_id,plan);}if(row.payment_id)plan.payments.push({id:row.payment_id,amountMinor:String(row.amount_kobo),paidAt:row.completed_at});}
 for(const plan of plans.values()){const paid=plan.payments.reduce((sum,item)=>sum+BigInt(item.amountMinor),0n);plan.paidMinor=String(paid);plan.remainingMinor=String(BigInt(plan.totalMinor)-paid);}
 return plans;
}
function publicOrder(row:Record<string,unknown>,layaway?:LayawayPublic,includePin=true){const cartCheckoutId=typeof row.cart_checkout_id==='string'?row.cart_checkout_id:null;const deliveryFee=BigInt(String(row.order_delivery_fee_minor??row.fulfillment_delivery_fee_minor??0));return{id:row.id,quoteId:row.quote_id,itemId:row.item_id,merchantId:row.organization_id,title:row.title,merchantName:row.display_name,imageUrls:Array.isArray(row.image_urls)?row.image_urls:[],quantity:row.quantity,totalMinor:String(BigInt(String(row.total_minor))+deliveryFee),merchandiseTotalMinor:String(row.merchandise_total_minor),serviceFeeMinor:String(row.service_fee_minor),deliveryFeeMinor:String(deliveryFee),currency:row.currency,state:row.state,fulfillmentState:row.fulfillment_state??null,fulfillment:publicFulfillment(row,includePin),paymentAvailable:!cartCheckoutId&&['CONFIRMED_AWAITING_PAYMENT','LAYAWAY_ACTIVE'].includes(String(row.state)),purchaseMode:row.purchase_mode,durationMonths:row.duration_months,layaway:layaway??null,cartCheckoutId,cartCheckoutState:row.cart_checkout_state??null,createdAt:row.created_at};}
const orderSelect=`SELECT o.*,q.item_id,q.quantity,q.total_minor,q.merchandise_total_minor,q.service_fee_minor,q.currency,q.purchase_mode,q.duration_months,i.title,i.image_urls,s.display_name,co.checkout_id cart_checkout_id,cc.state cart_checkout_state,CASE WHEN co.checkout_id IS NULL THEN COALESCE(f.delivery_fee_minor,0) ELSE co.amount_minor-q.total_minor END AS order_delivery_fee_minor ${fulfillmentColumns} FROM mart_orders o JOIN mart_quotes q ON q.id=o.quote_id JOIN mart_items i ON i.id=q.item_id JOIN mart_storefronts s ON s.organization_id=o.organization_id ${fulfillmentJoin} LEFT JOIN mart_checkout_orders co ON co.order_id=o.id LEFT JOIN mart_checkouts cc ON cc.id=co.checkout_id`;
export async function buyerOrder(identity:Identity,id:string){await expireDueLayaways([id]);const row=(await pool.query(`${orderSelect} WHERE o.id=$1 AND o.buyer_subject=$2 AND o.buyer_network=$3 AND o.buyer_wallet=$4`,[id,identity.subject,identity.network,identity.wallet])).rows[0];if(!row)throw new MartError('Order not found.',404,'ORDER_NOT_FOUND');return publicOrder(row,(await layawayDetails([id])).get(id));}
export async function buyerOrders(identity:Identity){await expireDueLayaways();const rows=await pool.query(`${orderSelect} WHERE o.buyer_subject=$1 AND o.buyer_network=$2 AND o.buyer_wallet=$3 ORDER BY o.created_at DESC LIMIT 100`,[identity.subject,identity.network,identity.wallet]);const plans=await layawayDetails(rows.rows.map(row=>row.id));return{orders:rows.rows.map(row=>publicOrder(row,plans.get(row.id)))};}
export async function cancelMartOrder(identity:Identity,id:string){const db=await pool.connect();try{await db.query('BEGIN');
 const changed=await db.query(`UPDATE mart_orders SET state='CANCELLED',updated_at=NOW() WHERE id=$1 AND buyer_subject=$2 AND buyer_network=$3 AND state IN ('AWAITING_MERCHANT','CONFIRMED_AWAITING_PAYMENT','LAYAWAY_ACTIVE') AND NOT EXISTS(SELECT 1 FROM mart_checkout_orders co WHERE co.order_id=mart_orders.id) AND NOT EXISTS(SELECT 1 FROM mart_payments p WHERE p.order_id=mart_orders.id AND p.state IN ('PROCESSING','RECONCILIATION_REQUIRED','COMPLETED')) RETURNING id`,[id,identity.subject,identity.network]);
 if(!changed.rows[0])throw new MartError('This order cannot be cancelled.',409,'ORDER_NOT_CANCELLABLE');
 await db.query(`UPDATE mart_layaway_plans SET state='CANCELLED',updated_at=NOW() WHERE order_id=$1 AND state IN ('PENDING_MERCHANT','ACTIVE')`,[id]);
 await orderEvent(db,id,'BUYER_CANCELLED','BUYER',identity.subject);await db.query('COMMIT');return{orderId:id,state:'CANCELLED'};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}
export async function merchantOrders(organizationId:string){await expireDueLayaways();const rows=await pool.query(`SELECT o.*,q.item_id,q.quantity,q.total_minor,q.merchandise_total_minor,q.service_fee_minor,q.currency,q.purchase_mode,q.duration_months,i.title,i.image_urls,COALESCE(co.amount_minor-q.total_minor,f.delivery_fee_minor,0) AS order_delivery_fee_minor ${fulfillmentColumns} FROM mart_orders o JOIN mart_quotes q ON q.id=o.quote_id JOIN mart_items i ON i.id=q.item_id ${fulfillmentJoin} LEFT JOIN mart_checkout_orders co ON co.order_id=o.id WHERE o.organization_id=$1 ORDER BY o.created_at DESC LIMIT 100`,[organizationId]);const plans=await layawayDetails(rows.rows.map(row=>row.id));return rows.rows.map(row=>({...publicOrder(row,plans.get(row.id),false),title:row.title}));}

export async function updateMartOrderFulfillment(organizationId:string,userId:string,id:string,next:'READY'|'OUT_FOR_DELIVERY'){return updateFulfillmentProgress(organizationId,userId,id,next);}

export async function decideMartOrder(organizationId:string,userId:string,id:string,decision:'CONFIRM'|'REJECT',note:string){
 // Confirm the source again immediately before the merchant decision; no stock is reserved.
 const row=(await pool.query(`SELECT o.state,q.item_id,q.quantity,q.unit_price_minor,q.currency,q.purchase_mode,q.duration_months,q.total_minor FROM mart_orders o JOIN mart_quotes q ON q.id=o.quote_id WHERE o.id=$1 AND o.organization_id=$2`,[id,organizationId])).rows[0];
 if(!row)throw new MartError('Order not found.',404,'ORDER_NOT_FOUND');
 if(row.state!=='AWAITING_MERCHANT')throw new MartError('This order has already been reviewed.',409,'ORDER_NOT_PENDING');
 if(decision==='CONFIRM'){
  const settlement=(await pool.query(`SELECT provisioning_state,vfd_account_number,vfd_account_name FROM business_financial_accounts WHERE organization_id=$1`,[organizationId])).rows[0];
  if(settlement?.provisioning_state!=='READY'||!/^[0-9]{10}$/.test(String(settlement.vfd_account_number??''))||!String(settlement.vfd_account_name??'').trim())throw new MartError('Finish setting up the business settlement account before accepting purchase requests.',409,'MERCHANT_SETTLEMENT_NOT_READY');
  await recheckMartOrder(row.item_id,Number(row.quantity),String(row.unit_price_minor),row.currency);
 }
 const db=await pool.connect();try{await db.query('BEGIN');
  const next=decision==='CONFIRM'?'CONFIRMED_AWAITING_PAYMENT':'REJECTED';
  const changed=await db.query(`UPDATE mart_orders SET state=$3,merchant_note=$4,confirmed_at=CASE WHEN $3='CONFIRMED_AWAITING_PAYMENT' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND state='AWAITING_MERCHANT' RETURNING id`,[id,organizationId,next,note||null]);
  if(!changed.rows[0])throw new MartError('This order has already been reviewed.',409,'ORDER_NOT_PENDING');
  if(decision==='CONFIRM'&&row.purchase_mode==='LAYAWAY'){
   const plan=(await db.query(`UPDATE mart_layaway_plans SET state='ACTIVE',starts_at=NOW(),deadline_at=NOW()+(duration_months*30*INTERVAL '1 day'),updated_at=NOW() WHERE order_id=$1 AND state='PENDING_MERCHANT' RETURNING id,duration_months,total_minor,deadline_at`,[id])).rows[0];
   if(!plan)throw new MartError('Pay small small could not be activated for this order.',409,'LAYAWAY_PLAN_UNAVAILABLE');
   await orderEvent(db,id,'LAYAWAY_ACTIVATED','SYSTEM',plan.id,{deadlineAt:plan.deadline_at,payoffDays:Number(plan.duration_months)*30});
  }else if(decision==='REJECT')await db.query(`UPDATE mart_layaway_plans SET state='CANCELLED',updated_at=NOW() WHERE order_id=$1 AND state='PENDING_MERCHANT'`,[id]);
  await orderEvent(db,id,decision==='CONFIRM'?'MERCHANT_CONFIRMED':'MERCHANT_REJECTED','MERCHANT',userId,{note});
  await notifyBuyerForOrder(db,id,{type:decision==='CONFIRM'?'MART_ORDER_ACCEPTED':'MART_ORDER_DECLINED',title:decision==='CONFIRM'?'Your order is ready for payment':'The store could not accept this order',body:decision==='CONFIRM'?(row.purchase_mode==='LAYAWAY'?'Your Pay small small period has started. Make payments before the deadline.':'Return to Oynk Mart to complete payment.'):'You were not charged.',data:{orderId:id},event:decision==='CONFIRM'?'merchant-confirmed':'merchant-rejected'});
  await db.query('COMMIT');return{orderId:id,state:next,paymentAvailable:next==='CONFIRMED_AWAITING_PAYMENT'};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}
