import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import type { Identity } from '../consumer/auth.js';
import { accountFor } from '../consumer/service.js';
import { limits, transactionLimits } from '../consumer/money.js';
import { vfdAccount, vfdPayoutProvider } from '../consumer/providers/vfdProvider.js';
import { funding } from '../consumer/settings.js';
import { MartError } from './service.js';
import { recheckMartOrder } from './checkout.js';
import { createActionChallenge, consumeActionApproval } from '../consumer/approvals.js';
import { inventoryRequest } from './inventory.js';
import { notifyBuyerForOrder, notifyMerchantForOrder } from './notifications.js';

type PaymentRow={id:string;order_id:string;consumer_account_id:string;amount_kobo:string;source_account_number:string;destination_account_number:string;destination_account_name:string;provider_reference:string;provider_returned_reference:string|null;state:string;initial_token_jti:string;minimum_token_iat:string;required_auth_method:string;approval_expires_at:Date;order_state:string;item_id:string;quantity:number;unit_price_minor:string;currency:string;purchase_mode:'PAY_NOW'|'LAYAWAY';layaway_plan_id:string|null;payment_kind:'FULL'|'LAYAWAY_CONTRIBUTION';deadline_at:Date|null};
const approvalTtlMs=5*60_000;
const paymentWindowMs=15*60_000;
const reference=(id:string)=>`mart-${id}`;
const layawayHoldingAccount=()=>funding.VFD_MART_HOLDING_ACCOUNT_NUMBER||funding.VFD_PAYOUT_ACCOUNT_NUMBER;
export type MartTransferPort={balance:(account:string)=>Promise<bigint>;destination:(input:{name:string;accountNumber:string})=>Promise<string>;send:(input:{reference:string;amountKobo:string;sourceAccount:string;destinationToken:string})=>Promise<{providerReference:string;status:'success'|'failed'|'pending'|'processing'}>;verify:(reference:string)=>Promise<{providerReference:string;status:'success'|'failed'|'pending'|'processing'}>};
const transferPort:MartTransferPort={
 balance:async account=>BigInt((await vfdAccount(account)).balanceMinor),
 destination:async input=>(await vfdPayoutProvider.createDestination({name:input.name,accountNumber:input.accountNumber,bankCode:'999999',currency:'NGN'})).destinationToken,
 send:async input=>vfdPayoutProvider.createPayout({reference:input.reference,amountMinor:input.amountKobo,currency:'NGN',destinationToken:input.destinationToken,idempotencyKey:input.reference,sourceAccountNumber:input.sourceAccount}),
 verify:async reference=>vfdPayoutProvider.verifyPayout(reference),
};
const publicPayment=(row:Record<string,unknown>)=>({id:row.id,orderId:row.order_id,amountKobo:String(row.amount_kobo),currency:'NGN',state:row.state,approvalExpiresAt:row.approval_expires_at,providerReference:row.state==='COMPLETED'?row.provider_returned_reference??row.provider_reference:null,paymentKind:row.payment_kind??'FULL',createdAt:row.created_at,completedAt:row.completed_at??null});
async function event(db:PoolClient,id:string,action:string,actorType:'BUYER'|'SYSTEM'|'PROVIDER',actorReference:string,metadata:Record<string,unknown>={}){await db.query(`INSERT INTO mart_payment_events(id,payment_id,action,actor_type,actor_reference,metadata) VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),id,action,actorType,actorReference,metadata]);}
type JournalLine={account:'HOLDING_CASH'|'CUSTOMER_FUNDS_HELD'|'MERCHANT_PAYABLE'|'SERVICE_FEE_REVENUE'|'FINANCING_RECEIVABLE';direction:'DEBIT'|'CREDIT';amount:bigint};
async function journal(db:PoolClient,input:{planId:string;paymentId?:string;settlementId?:string;reference:string;lines:JournalLine[]}){
 const debit=input.lines.filter(line=>line.direction==='DEBIT').reduce((sum,line)=>sum+line.amount,0n),credit=input.lines.filter(line=>line.direction==='CREDIT').reduce((sum,line)=>sum+line.amount,0n);
 if(debit<=0n||debit!==credit)throw new Error('Unbalanced layaway journal entry.');
 for(const line of input.lines)await db.query(`INSERT INTO mart_layaway_journal_entries(id,plan_id,payment_id,settlement_id,account_code,direction,amount_kobo,reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(reference,account_code,direction) DO NOTHING`,[randomUUID(),input.planId,input.paymentId??null,input.settlementId??null,line.account,line.direction,String(line.amount),input.reference]);
}

export async function beginMartPayment(identity:Identity,orderId:string,requestedAmountMinor?:string){
 if(identity.network!=='TESTNET'||funding.VFD_ENVIRONMENT!=='TEST')throw new MartError('Mart payments are not available for live accounts yet.',409,'MART_LIVE_PAYMENT_DISABLED');
 if(!identity.tokenId||!Number.isSafeInteger(identity.issuedAt))throw new MartError('Sign in again before paying.',401,'PRIMARY_APPROVAL_REQUIRED');
 const db=await pool.connect();try{await db.query('BEGIN');
  const account=await accountFor(identity,db,true);
  if(account.tier===0)throw new MartError('Activate Oynk Pay before paying.',409,'PAY_ACCOUNT_REQUIRED');
  const result=await db.query(`SELECT o.*,q.item_id,q.quantity,q.unit_price_minor,q.total_minor,q.currency,q.purchase_mode,b.provisioning_state merchant_provisioning_state,b.vfd_account_number,b.vfd_account_name,d.account_number source_account,org.platform_mode,COALESCE(f.delivery_fee_minor,0) delivery_fee_minor,
    lp.id layaway_plan_id,lp.state layaway_state,lp.deadline_at,
    EXISTS(SELECT 1 FROM mart_checkout_orders co WHERE co.order_id=o.id) cart_checkout_order,
    COALESCE((SELECT SUM(p.amount_kobo) FROM mart_payments p WHERE p.layaway_plan_id=lp.id AND p.state='COMPLETED'),0)::text layaway_paid
   FROM mart_orders o JOIN mart_quotes q ON q.id=o.quote_id LEFT JOIN business_financial_accounts b ON b.organization_id=o.organization_id
   JOIN organizations org ON org.id=o.organization_id
   JOIN consumer_quick_pay_deposit_accounts d ON d.account_id=$2 AND d.provider='VFD' AND d.status='ACTIVE'
   LEFT JOIN mart_layaway_plans lp ON lp.order_id=o.id LEFT JOIN mart_fulfillments f ON f.id=o.fulfillment_id
   WHERE o.id=$1 AND o.buyer_subject=$3 AND o.buyer_network=$4 AND o.buyer_wallet=$5 AND org.status='ACTIVE' FOR UPDATE OF o`,[orderId,account.id,identity.subject,identity.network,identity.wallet]);
  const order=result.rows[0];
  if(!order||!['CONFIRMED_AWAITING_PAYMENT','LAYAWAY_ACTIVE'].includes(order.state))throw new MartError('This order is not ready for payment.',409,'ORDER_NOT_PAYABLE');
  if(order.cart_checkout_order)throw new MartError('This order belongs to a combined cart checkout. Return to your cart to complete or review the payment.',409,'CART_CHECKOUT_REQUIRED');
  if(order.merchant_provisioning_state!=='READY'||!/^[0-9]{10}$/.test(String(order.vfd_account_number??''))||!String(order.vfd_account_name??'').trim())throw new MartError('The merchant settlement account is not ready. Ask the merchant to finish account setup before paying.',409,'MERCHANT_SETTLEMENT_NOT_READY');
  if(order.purchase_mode==='LAYAWAY'&&order.deadline_at&&new Date(order.deadline_at).getTime()<=Date.now()){
   throw new MartError('The Pay small small payment window has ended.',409,'LAYAWAY_EXPIRED');
  }
  if(order.purchase_mode==='LAYAWAY'&&(order.layaway_state!=='ACTIVE'||!order.layaway_plan_id))throw new MartError('Pay small small is not available for this order.',409,'LAYAWAY_NOT_PAYABLE');
  if(order.platform_mode!==(identity.network==='TESTNET'?'TEST':'LIVE'))throw new MartError('This merchant is on a different Oynk network.',409,'MERCHANT_NETWORK_MISMATCH');
  const destinationAccount=order.purchase_mode==='LAYAWAY'?layawayHoldingAccount():order.vfd_account_number;
  const destinationName=order.purchase_mode==='LAYAWAY'?funding.VFD_MERCHANT_NAME:order.vfd_account_name;
  if(order.currency!=='NGN'||!/^\d{10}$/.test(String(destinationAccount??''))||!/^\d{10}$/.test(String(order.source_account??''))||!destinationName||order.source_account===destinationAccount)throw new MartError(order.purchase_mode==='LAYAWAY'?'Oynk’s Pay small small holding account is not ready.':'The bank accounts for this order are not ready.',409,'PAYMENT_ACCOUNTS_UNAVAILABLE');
  if(order.purchase_mode==='PAY_NOW'&&(!order.confirmed_at||Date.now()-new Date(order.confirmed_at).getTime()>paymentWindowMs))throw new MartError('The merchant confirmation expired. Request a new quote.',409,'MERCHANT_CONFIRMATION_EXPIRED');
  await db.query(`UPDATE mart_payments SET state='FAILED',failure_code='APPROVAL_EXPIRED',updated_at=NOW() WHERE order_id=$1 AND state='AWAITING_APPROVAL' AND approval_expires_at<=NOW()`,[orderId]);
  const existing=await db.query(`SELECT p.* FROM mart_payments p WHERE p.order_id=$1 AND p.state IN ('AWAITING_APPROVAL','PROCESSING','RECONCILIATION_REQUIRED') ORDER BY p.created_at DESC LIMIT 1`,[orderId]);
  if(existing.rows[0]){await db.query('COMMIT');return publicPayment(existing.rows[0]);}
  const payableTotal=order.purchase_mode==='LAYAWAY'?BigInt(order.layaway_plan_id?(await db.query(`SELECT total_minor FROM mart_layaway_plans WHERE id=$1`,[order.layaway_plan_id])).rows[0].total_minor:order.total_minor):BigInt(order.total_minor)+BigInt(order.delivery_fee_minor);
  const remaining=payableTotal-BigInt(order.layaway_paid??0);
  let amount:bigint;
  if(order.purchase_mode==='LAYAWAY'){
   if(!requestedAmountMinor||!/^[1-9]\d*$/.test(requestedAmountMinor))throw new MartError('Enter how much you want to pay now.',400,'LAYAWAY_AMOUNT_REQUIRED');
   amount=BigInt(requestedAmountMinor);
   if(amount>remaining)throw new MartError('This payment exceeds the remaining Pay small small balance.',409,'LAYAWAY_AMOUNT_EXCEEDS_BALANCE');
  }else amount=payableTotal;
  if(amount<=0n||amount>transactionLimits[account.tier])throw new MartError('This purchase exceeds your Oynk Pay transaction limit.',409,'PAYMENT_LIMIT_EXCEEDED');
  const used=await db.query(`SELECT COALESCE(SUM(amount_kobo),0)::text amount FROM consumer_quick_pay_ledger_entries WHERE account_id=$1 AND direction='DEBIT' AND effective_at>NOW()-INTERVAL '24 hours'`,[account.id]);
  const inFlight=await db.query(`SELECT COALESCE(SUM(amount_kobo),0)::text amount FROM mart_payments WHERE consumer_account_id=$1 AND state IN ('PROCESSING','RECONCILIATION_REQUIRED')`,[account.id]);
  const cartInFlight=await db.query(`SELECT COALESCE(SUM(total_minor),0)::text amount FROM mart_checkouts WHERE consumer_account_id=$1 AND state IN ('PROCESSING','RECONCILIATION_REQUIRED')`,[account.id]);
  const terminal=await db.query(`SELECT COALESCE(SUM(amount_kobo),0)::text amount FROM terminal_payments WHERE consumer_account_id=$1 AND state IN ('AUTHORIZING','PROCESSING','RECONCILIATION_REQUIRED')`,[account.id]);
  if(BigInt(used.rows[0].amount)+BigInt(inFlight.rows[0].amount)+BigInt(cartInFlight.rows[0].amount)+BigInt(terminal.rows[0].amount)+amount>limits[account.tier])throw new MartError('This purchase exceeds your available 24-hour payment limit.',409,'PAYMENT_DAILY_LIMIT_EXCEEDED');
  const id=randomUUID(),expiresAt=new Date(Date.now()+approvalTtlMs);
  const paymentKind=order.purchase_mode==='LAYAWAY'?'LAYAWAY_CONTRIBUTION':'FULL';
  await db.query(`INSERT INTO mart_payments(id,order_id,consumer_account_id,amount_kobo,source_account_number,destination_account_number,destination_account_name,provider_reference,state,initial_token_jti,minimum_token_iat,required_auth_method,approval_expires_at,layaway_plan_id,payment_kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'AWAITING_APPROVAL',$9,$10,$11,$12,$13,$14)`,[id,orderId,account.id,String(amount),order.source_account,destinationAccount,destinationName,reference(id),identity.tokenId,Math.floor(Date.now()/1000),identity.authMethod,expiresAt,order.layaway_plan_id??null,paymentKind]);
  await event(db,id,'PAYMENT_APPROVAL_REQUESTED','BUYER',identity.subject,{orderId,amountKobo:String(amount),paymentKind,remainingBeforeKobo:String(remaining)});
  await db.query('COMMIT');return{id,orderId,amountKobo:String(amount),currency:'NGN',state:'AWAITING_APPROVAL',approvalExpiresAt:expiresAt.toISOString(),authentication:identity.authMethod,paymentKind};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

async function paymentForBuyer(identity:Identity,id:string){
 const row=(await pool.query(`SELECT p.*,o.state order_state,q.item_id,q.quantity,q.unit_price_minor,q.currency,q.purchase_mode,lp.deadline_at FROM mart_payments p JOIN mart_orders o ON o.id=p.order_id JOIN mart_quotes q ON q.id=o.quote_id JOIN consumer_accounts a ON a.id=p.consumer_account_id LEFT JOIN mart_layaway_plans lp ON lp.id=p.layaway_plan_id WHERE p.id=$1 AND a.subject=$2 AND a.client_id=$3 AND a.network=$4 AND a.wallet=$5`,[id,identity.subject,identity.clientId,identity.network,identity.wallet])).rows[0] as PaymentRow|undefined;
 if(!row)throw new MartError('Payment not found.',404,'PAYMENT_NOT_FOUND');return row;
}
export async function martPaymentApproval(identity:Identity,id:string){
 const payment=await paymentForBuyer(identity,id);
 if(payment.state!=='AWAITING_APPROVAL'||new Date(payment.approval_expires_at).getTime()<=Date.now())throw new MartError('This payment is no longer awaiting approval.',409,'APPROVAL_EXPIRED');
 return createActionChallenge(identity,'MART_PAYMENT',martApprovalPayload(payment));
}
function martApprovalPayload(payment:PaymentRow){return {paymentId:payment.id,orderId:payment.order_id,amountKobo:String(payment.amount_kobo),source:payment.source_account_number,destination:payment.destination_account_number,providerReference:payment.provider_reference};}
export async function martPaymentStatus(identity:Identity,id:string){return publicPayment(await paymentForBuyer(identity,id) as unknown as Record<string,unknown>);}

async function finish(id:string,status:'success'|'failed'|'pending'|'processing',providerReference:string){
 const db=await pool.connect();try{await db.query('BEGIN');
  const row=(await db.query(`SELECT p.*,o.state order_state,q.purchase_mode,b.vfd_account_number merchant_account_number,b.vfd_account_name merchant_account_name
   FROM mart_payments p JOIN mart_orders o ON o.id=p.order_id JOIN mart_quotes q ON q.id=o.quote_id
   JOIN business_financial_accounts b ON b.organization_id=o.organization_id AND b.provisioning_state='READY'
   WHERE p.id=$1 FOR UPDATE OF p,o`,[id])).rows[0];
  if(!row||['COMPLETED','FAILED'].includes(row.state)){await db.query('COMMIT');return;}
  if(status==='success'){
   await db.query(`UPDATE mart_payments SET state='COMPLETED',provider_returned_reference=$2,completed_at=NOW(),next_reconciliation_at=NULL,updated_at=NOW() WHERE id=$1`,[id,providerReference]);
   let releaseItem=true,eventAction='ORDER_PAID';
   if(row.layaway_plan_id){
    const plan=(await db.query(`SELECT * FROM mart_layaway_plans WHERE id=$1 FOR UPDATE`,[row.layaway_plan_id])).rows[0];
    if(!plan)throw new Error('Layaway plan not found.');
    await journal(db,{planId:plan.id,paymentId:id,reference:`layaway-collection:${id}`,lines:[{account:'HOLDING_CASH',direction:'DEBIT',amount:BigInt(row.amount_kobo)},{account:'CUSTOMER_FUNDS_HELD',direction:'CREDIT',amount:BigInt(row.amount_kobo)}]});
    const paid=BigInt((await db.query(`SELECT COALESCE(SUM(amount_kobo),0)::text amount FROM mart_payments WHERE layaway_plan_id=$1 AND state='COMPLETED'`,[plan.id])).rows[0].amount);
    const remaining=BigInt(plan.total_minor)-paid;releaseItem=false;
    if(remaining>0n)eventAction='LAYAWAY_CONTRIBUTION_PAID';
    else{
     const holdingAccount=layawayHoldingAccount();
     if(!holdingAccount||!/^\d{10}$/.test(String(row.merchant_account_number??''))||!row.merchant_account_name)throw new Error('Layaway settlement accounts are unavailable.');
     await db.query(`UPDATE mart_layaway_plans SET state='FUNDED',updated_at=NOW() WHERE id=$1 AND state='ACTIVE'`,[plan.id]);
     await db.query(`UPDATE mart_orders SET state='LAYAWAY_SETTLEMENT_PENDING',updated_at=NOW() WHERE id=$1 AND state IN ('CONFIRMED_AWAITING_PAYMENT','LAYAWAY_ACTIVE')`,[row.order_id]);
     const settlementId=randomUUID(),settlementReference=`mart-layaway-settlement-${settlementId}`;
     const merchantAmount=BigInt(plan.merchandise_total_minor)+BigInt(plan.delivery_fee_minor??0);
     await db.query(`INSERT INTO mart_layaway_settlements(id,plan_id,order_id,amount_kobo,source_account_number,destination_account_number,destination_account_name,provider_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[settlementId,plan.id,row.order_id,String(merchantAmount),holdingAccount,row.merchant_account_number,row.merchant_account_name,settlementReference]);
     await journal(db,{planId:plan.id,reference:`layaway-funded:${plan.id}`,lines:[{account:'CUSTOMER_FUNDS_HELD',direction:'DEBIT',amount:BigInt(plan.total_minor)},{account:'MERCHANT_PAYABLE',direction:'CREDIT',amount:merchantAmount},{account:'SERVICE_FEE_REVENUE',direction:'CREDIT',amount:BigInt(plan.service_fee_minor)}]});
     eventAction='LAYAWAY_FUNDED';
    }
   }
   if(row.purchase_mode==='PAY_NOW')await db.query(`UPDATE mart_orders SET state='PAID',fulfillment_state='PREPARING',updated_at=NOW() WHERE id=$1 AND state='CONFIRMED_AWAITING_PAYMENT'`,[row.order_id]);
   else if(eventAction==='LAYAWAY_CONTRIBUTION_PAID')await db.query(`UPDATE mart_orders SET state='LAYAWAY_ACTIVE',updated_at=NOW() WHERE id=$1 AND state IN ('CONFIRMED_AWAITING_PAYMENT','LAYAWAY_ACTIVE')`,[row.order_id]);
   if(releaseItem)await db.query(`INSERT INTO mart_stock_fulfillments(order_id,organization_id,connection_id,source_item_id,quantity) SELECT o.id,o.organization_id,i.connection_id,i.source_item_id,q.quantity FROM mart_orders o JOIN mart_quotes q ON q.id=o.quote_id JOIN mart_items i ON i.id=q.item_id WHERE o.id=$1 AND i.kind='PRODUCT' ON CONFLICT(order_id) DO NOTHING`,[row.order_id]);
   await db.query(`INSERT INTO consumer_quick_pay_ledger_entries(id,account_id,direction,kind,amount_kobo,reference,provider,provider_reference,metadata) VALUES($1,$2,'DEBIT','PAYMENT',$3,$4,'VFD',$5,$6) ON CONFLICT(reference) DO NOTHING`,[randomUUID(),row.consumer_account_id,row.amount_kobo,reference(id),providerReference,{channel:'MART',orderId:row.order_id}]);
   await event(db,id,'PAYMENT_CONFIRMED','PROVIDER',providerReference);await db.query(`INSERT INTO mart_order_events(id,order_id,action,actor_type,actor_reference,metadata) VALUES($1,$2,$3,'SYSTEM',$4,$5)`,[randomUUID(),row.order_id,eventAction,id,{paymentId:id,providerReference,layawayPlanId:row.layaway_plan_id??null,amountKobo:String(row.amount_kobo)}]);
   await notifyBuyerForOrder(db,row.order_id,{type:eventAction,title:eventAction==='LAYAWAY_CONTRIBUTION_PAID'?'Pay small small payment received':eventAction==='LAYAWAY_FUNDED'?'Pay small small completed':'Payment confirmed',body:eventAction==='LAYAWAY_CONTRIBUTION_PAID'?'Your contribution is secured in Oynk’s holding account.':eventAction==='LAYAWAY_FUNDED'?'Your plan is fully paid. Oynk is settling the store.':'The store can now prepare your order.',data:{orderId:row.order_id,paymentId:id},event:`payment-${id}`});
   if(eventAction==='ORDER_PAID'||eventAction==='LAYAWAY_FUNDED')await notifyMerchantForOrder(db,row.order_id,{type:eventAction,title:eventAction==='ORDER_PAID'?'Customer payment confirmed':'Pay small small completed',body:'Payment is confirmed. Prepare the order for fulfilment.',data:{orderId:row.order_id},event:`merchant-payment-${id}`});
  }else if(status==='failed'){
   await db.query(`UPDATE mart_payments SET state='FAILED',provider_returned_reference=$2,failure_code='PROVIDER_DECLINED',next_reconciliation_at=NULL,updated_at=NOW() WHERE id=$1`,[id,providerReference]);await event(db,id,'PAYMENT_DECLINED','PROVIDER',providerReference);
  }else{
   await db.query(`UPDATE mart_payments SET state='PROCESSING',provider_returned_reference=$2,next_reconciliation_at=NOW()+INTERVAL '15 seconds',updated_at=NOW() WHERE id=$1`,[id,providerReference]);await event(db,id,'PROVIDER_PROCESSING','PROVIDER',providerReference);
  }
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

export async function submitMartPayment(identity:Identity,id:string,provider:MartTransferPort=transferPort,approval:unknown=null){
 if(identity.network!=='TESTNET'||funding.VFD_ENVIRONMENT!=='TEST')throw new MartError('Mart payments are not available for live accounts yet.',409,'MART_LIVE_PAYMENT_DISABLED');
 const payment=await paymentForBuyer(identity,id);
 if(payment.state!=='AWAITING_APPROVAL')return publicPayment(payment as unknown as Record<string,unknown>);
 if(new Date(payment.approval_expires_at).getTime()<=Date.now())throw new MartError('This payment approval expired.',409,'APPROVAL_EXPIRED');
 if(!['CONFIRMED_AWAITING_PAYMENT','LAYAWAY_ACTIVE'].includes(payment.order_state))throw new MartError('This order is no longer payable.',409,'ORDER_NOT_PAYABLE');
 if(payment.purchase_mode==='LAYAWAY'&&payment.deadline_at&&new Date(payment.deadline_at).getTime()<=Date.now())throw new MartError('The Pay small small payment window has ended.',409,'LAYAWAY_EXPIRED');
 if(payment.purchase_mode==='PAY_NOW')await recheckMartOrder(payment.item_id,Number(payment.quantity),String(payment.unit_price_minor),payment.currency);
 const db=await pool.connect();try{await db.query('BEGIN');
  // All Mart payment claims for one buyer serialize on the account row. Recheck
  // the rolling cap here because several prepared orders may be approved later.
  const owner=await db.query(`SELECT tier FROM consumer_accounts WHERE id=$1 FOR UPDATE`,[payment.consumer_account_id]);
  if(!owner.rows[0])throw new MartError('Oynk Pay account not found.',409,'PAY_ACCOUNT_REQUIRED');
  const tier=Number(owner.rows[0].tier) as keyof typeof limits;
  const used=await db.query(`SELECT COALESCE(SUM(amount_kobo),0)::text amount FROM consumer_quick_pay_ledger_entries WHERE account_id=$1 AND direction='DEBIT' AND effective_at>NOW()-INTERVAL '24 hours'`,[payment.consumer_account_id]);
  const inFlight=await db.query(`SELECT COALESCE(SUM(amount_kobo),0)::text amount FROM mart_payments WHERE consumer_account_id=$1 AND id<>$2 AND state IN ('PROCESSING','RECONCILIATION_REQUIRED')`,[payment.consumer_account_id,id]);
  const terminal=await db.query(`SELECT COALESCE(SUM(amount_kobo),0)::text amount FROM terminal_payments WHERE consumer_account_id=$1 AND state IN ('AUTHORIZING','PROCESSING','RECONCILIATION_REQUIRED')`,[payment.consumer_account_id]);
  if(!limits[tier]||BigInt(used.rows[0].amount)+BigInt(inFlight.rows[0].amount)+BigInt(terminal.rows[0].amount)+BigInt(payment.amount_kobo)>limits[tier])throw new MartError('This purchase exceeds your available 24-hour payment limit.',409,'PAYMENT_DAILY_LIMIT_EXCEEDED');
  // Serialize against buyer cancellation before claiming the transfer. A
  // cancelled order must never be charged by a concurrently approved payment.
  const locked=await db.query(`SELECT o.state FROM mart_orders o JOIN mart_payments p ON p.order_id=o.id WHERE p.id=$1 FOR UPDATE OF o`,[id]);
  if(!['CONFIRMED_AWAITING_PAYMENT','LAYAWAY_ACTIVE'].includes(locked.rows[0]?.state))throw new MartError('This order is no longer payable.',409,'ORDER_NOT_PAYABLE');
  const approvalId=await consumeActionApproval(db,identity,'MART_PAYMENT',martApprovalPayload(payment),approval);
  const claimed=await db.query(`UPDATE mart_payments SET state='PROCESSING',approval_token_jti=$2,approved_at=NOW(),next_reconciliation_at=NOW()+INTERVAL '15 seconds',updated_at=NOW() WHERE id=$1 AND state='AWAITING_APPROVAL' AND approval_expires_at>NOW() AND EXISTS(SELECT 1 FROM mart_orders o WHERE o.id=order_id AND o.state IN ('CONFIRMED_AWAITING_PAYMENT','LAYAWAY_ACTIVE')) RETURNING id`,[id,approvalId]);
  if(!claimed.rows[0]){await db.query('COMMIT');return martPaymentStatus(identity,id);}
  await event(db,id,'PRIMARY_APPROVAL_VERIFIED','BUYER',identity.subject);await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');if((error as {code?:string}).code==='23505')throw new MartError('Authenticate again to approve this payment.',409,'PRIMARY_APPROVAL_REQUIRED');throw error;}finally{db.release();}
 try{
  const balance=await provider.balance(payment.source_account_number);
  if(balance<BigInt(payment.amount_kobo)){await finish(id,'failed',payment.provider_reference);return martPaymentStatus(identity,id);}
  const destination=await provider.destination({name:payment.destination_account_name,accountNumber:payment.destination_account_number});
  const result=await provider.send({reference:payment.provider_reference,amountKobo:String(payment.amount_kobo),sourceAccount:payment.source_account_number,destinationToken:destination});
  await finish(id,result.status,result.providerReference);
 }catch(error){
  console.error('[mart] payment reconciliation required',{code:(error as {code?:string}).code??'UNKNOWN',constraint:(error as {constraint?:string}).constraint??null});
  // An exception may occur after VFD accepts the transfer. Never submit a second one.
  await pool.query(`UPDATE mart_payments SET state='RECONCILIATION_REQUIRED',next_reconciliation_at=NOW()+INTERVAL '15 seconds',failure_code='OUTCOME_UNKNOWN',updated_at=NOW() WHERE id=$1 AND state='PROCESSING'`,[id]);
 }
 return martPaymentStatus(identity,id);
}

export async function reconcileMartPayments(limit=20,provider:MartTransferPort=transferPort){
 const rows=await pool.query(`SELECT id,COALESCE(provider_returned_reference,provider_reference) reference,reconciliation_attempts FROM mart_payments WHERE state IN ('PROCESSING','RECONCILIATION_REQUIRED') AND next_reconciliation_at<=NOW() ORDER BY next_reconciliation_at LIMIT $1`,[limit]);
 for(const row of rows.rows){try{
  const result=await provider.verify(row.reference);await finish(row.id,result.status,result.providerReference);
  if(result.status==='pending'||result.status==='processing')await pool.query(`UPDATE mart_payments SET reconciliation_attempts=reconciliation_attempts+1,next_reconciliation_at=NOW()+INTERVAL '30 seconds',updated_at=NOW() WHERE id=$1 AND state='PROCESSING'`,[row.id]);
 }catch{await pool.query(`UPDATE mart_payments SET state='RECONCILIATION_REQUIRED',reconciliation_attempts=reconciliation_attempts+1,next_reconciliation_at=NOW()+INTERVAL '1 minute',updated_at=NOW() WHERE id=$1 AND state IN ('PROCESSING','RECONCILIATION_REQUIRED')`,[row.id]);}}
 return rows.rowCount??0;
}

async function finishLayawaySettlement(id:string,status:'success'|'failed'|'pending'|'processing',providerReference:string){
 const db=await pool.connect();try{await db.query('BEGIN');
  const row=(await db.query(`SELECT s.*,p.merchandise_total_minor,p.delivery_fee_minor FROM mart_layaway_settlements s JOIN mart_layaway_plans p ON p.id=s.plan_id WHERE s.id=$1 FOR UPDATE OF s,p`,[id])).rows[0];
  if(!row||['COMPLETED','FAILED'].includes(row.state)){await db.query('COMMIT');return;}
  if(status==='success'){
   await db.query(`UPDATE mart_layaway_settlements SET state='COMPLETED',provider_returned_reference=$2,completed_at=NOW(),next_reconciliation_at=NULL,updated_at=NOW() WHERE id=$1`,[id,providerReference]);
   await db.query(`UPDATE mart_layaway_plans SET state='COMPLETED',completed_at=NOW(),updated_at=NOW() WHERE id=$1 AND state IN ('FUNDED','SETTLING')`,[row.plan_id]);
   await db.query(`UPDATE mart_orders SET state='PAID',fulfillment_state='PREPARING',updated_at=NOW() WHERE id=$1 AND state='LAYAWAY_SETTLEMENT_PENDING'`,[row.order_id]);
   await db.query(`INSERT INTO mart_stock_fulfillments(order_id,organization_id,connection_id,source_item_id,quantity) SELECT o.id,o.organization_id,i.connection_id,i.source_item_id,q.quantity FROM mart_orders o JOIN mart_quotes q ON q.id=o.quote_id JOIN mart_items i ON i.id=q.item_id WHERE o.id=$1 AND i.kind='PRODUCT' ON CONFLICT(order_id) DO NOTHING`,[row.order_id]);
   await journal(db,{planId:row.plan_id,settlementId:id,reference:`layaway-settlement:${id}`,lines:[{account:'MERCHANT_PAYABLE',direction:'DEBIT',amount:BigInt(row.amount_kobo)},{account:'HOLDING_CASH',direction:'CREDIT',amount:BigInt(row.amount_kobo)}]});
   await db.query(`INSERT INTO mart_order_events(id,order_id,action,actor_type,actor_reference,metadata) VALUES($1,$2,'LAYAWAY_MERCHANT_SETTLED','SYSTEM',$3,$4)`,[randomUUID(),row.order_id,id,{settlementId:id,providerReference,amountKobo:String(row.amount_kobo)}]);
   await notifyBuyerForOrder(db,row.order_id,{type:'LAYAWAY_SETTLED',title:'Your order is being prepared',body:'The store has received settlement and can now prepare your order.',data:{orderId:row.order_id},event:'layaway-settled'});await notifyMerchantForOrder(db,row.order_id,{type:'LAYAWAY_SETTLED',title:'Pay small small order funded',body:'Settlement is complete. Prepare the customer’s order.',data:{orderId:row.order_id},event:'merchant-layaway-settled'});
  }else if(status==='failed')await db.query(`UPDATE mart_layaway_settlements SET state='FAILED',provider_returned_reference=$2,failure_code='PROVIDER_DECLINED',next_reconciliation_at=NULL,updated_at=NOW() WHERE id=$1`,[id,providerReference]);
  else await db.query(`UPDATE mart_layaway_settlements SET state='PROCESSING',provider_returned_reference=$2,next_reconciliation_at=NOW()+INTERVAL '30 seconds',updated_at=NOW() WHERE id=$1`,[id,providerReference]);
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

export async function reconcileMartLayawaySettlements(limit=20,provider:MartTransferPort=transferPort){
 const pending=await pool.query(`SELECT * FROM mart_layaway_settlements WHERE state='PENDING' AND next_reconciliation_at<=NOW() ORDER BY created_at LIMIT $1`,[limit]);
 for(const row of pending.rows){
  try{
   const destination=await provider.destination({name:row.destination_account_name,accountNumber:row.destination_account_number});
   const claimed=await pool.query(`UPDATE mart_layaway_settlements SET state='PROCESSING',next_reconciliation_at=NOW()+INTERVAL '30 seconds',updated_at=NOW() WHERE id=$1 AND state='PENDING' RETURNING id`,[row.id]);if(!claimed.rows[0])continue;
   await pool.query(`UPDATE mart_layaway_plans SET state='SETTLING',updated_at=NOW() WHERE id=$1 AND state='FUNDED'`,[row.plan_id]);
   const result=await provider.send({reference:row.provider_reference,amountKobo:String(row.amount_kobo),sourceAccount:row.source_account_number,destinationToken:destination});await finishLayawaySettlement(row.id,result.status,result.providerReference);
  }catch(error){console.error('[mart] layaway settlement requires reconciliation',{settlementId:row.id,code:(error as {code?:string}).code??'UNKNOWN',message:error instanceof Error?error.message:'Unknown error'});await pool.query(`UPDATE mart_layaway_settlements SET state='RECONCILIATION_REQUIRED',reconciliation_attempts=reconciliation_attempts+1,next_reconciliation_at=NOW()+INTERVAL '1 minute',failure_code='OUTCOME_UNKNOWN',updated_at=NOW() WHERE id=$1 AND state='PROCESSING'`,[row.id]);}
 }
 const remaining=Math.max(0,limit-(pending.rowCount??0));if(!remaining)return pending.rowCount??0;
 const reconciling=await pool.query(`SELECT * FROM mart_layaway_settlements WHERE state IN ('PROCESSING','RECONCILIATION_REQUIRED') AND next_reconciliation_at<=NOW() ORDER BY next_reconciliation_at LIMIT $1`,[remaining]);
 for(const row of reconciling.rows){try{const result=await provider.verify(row.provider_returned_reference??row.provider_reference);await finishLayawaySettlement(row.id,result.status,result.providerReference);if(result.status==='pending'||result.status==='processing')await pool.query(`UPDATE mart_layaway_settlements SET reconciliation_attempts=reconciliation_attempts+1,updated_at=NOW() WHERE id=$1`,[row.id]);}catch{await pool.query(`UPDATE mart_layaway_settlements SET state='RECONCILIATION_REQUIRED',reconciliation_attempts=reconciliation_attempts+1,next_reconciliation_at=NOW()+INTERVAL '1 minute',updated_at=NOW() WHERE id=$1`,[row.id]);}}
 return(pending.rowCount??0)+(reconciling.rowCount??0);
}

export async function reconcileMartStock(limit=20){
 const jobs=await pool.query(`UPDATE mart_stock_fulfillments f SET state='PROCESSING',next_attempt_at=NOW()+INTERVAL '60 seconds',attempts=attempts+1,updated_at=NOW() WHERE f.order_id IN (SELECT order_id FROM mart_stock_fulfillments WHERE state IN ('PENDING','PROCESSING') AND next_attempt_at<=NOW() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT $1) RETURNING order_id,organization_id,connection_id,source_item_id,quantity,attempts`,[limit]);
 for(const job of jobs.rows){try{
  const result=await inventoryRequest(job.organization_id,'POST','/sales',{itemId:job.source_item_id,quantity:job.quantity},job.order_id,job.connection_id);
  if(!result||typeof result!=='object'||(result as {itemId?:unknown}).itemId!==job.source_item_id)throw new MartError('Inventory source returned an invalid sale receipt.',503,'SOURCE_INVALID_RESPONSE');
  const db=await pool.connect();try{await db.query('BEGIN');await db.query(`UPDATE mart_stock_fulfillments SET state='COMPLETED',last_error=NULL,updated_at=NOW() WHERE order_id=$1`,[job.order_id]);await db.query(`INSERT INTO mart_order_events(id,order_id,action,actor_type,actor_reference,metadata) VALUES($1,$2,'INVENTORY_UPDATED','SYSTEM',$3,'{}')`,[randomUUID(),job.order_id,String(job.order_id)]);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
 }catch(error){const conflict=error instanceof MartError&&error.status===409;console.error('[mart] inventory fulfillment deferred',{orderId:job.order_id,code:error instanceof MartError?error.code:(error as {code?:string}).code??'UNKNOWN'});await pool.query(`UPDATE mart_stock_fulfillments SET state=$2,next_attempt_at=NOW()+INTERVAL '1 minute',last_error=$3,updated_at=NOW() WHERE order_id=$1`,[job.order_id,conflict?'NEEDS_REVIEW':'PENDING',error instanceof MartError?error.code:'SOURCE_UNAVAILABLE']);}}
 return jobs.rowCount??0;
}
