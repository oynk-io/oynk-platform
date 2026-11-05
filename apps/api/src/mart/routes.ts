import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { getSessionByToken, verifyCsrf } from '../auth/authService.js';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { consumerIdentity } from '../consumer/auth.js';
import { buyerOrder, buyerOrders, cancelMartOrder, createMartOrder, createMartQuote, decideMartOrder, merchantOrders, updateMartOrderFulfillment } from './checkout.js';
import { beginMartPayment, martPaymentStatus, martPaymentApproval, submitMartPayment } from './payments.js';
import { addCartItem, cartCheckoutApproval, cartCheckoutStatus, createCartCheckout, getCart, removeCartItem, submitCartCheckout, updateCartItem } from './cart.js';
import { connectionSchema, ingestSchema, storefrontSchema } from './model.js';
import { inventoryPhoto, inventoryRequest } from './inventory.js';
import { inventoryItemSchema } from './inventoryModel.js';
import { MAX_PHOTO_BYTES, readPhoto, savePhoto, validatePhotoOwnership } from './media.js';
import { authenticateConnection, confirmConnection, createConnection, discover, discoverStorefronts, ingest, MartError, pendingConnection, publicItemById, publicStorefrontById, revokeConnection, updateStorefront } from './service.js';
import { confirmReceipt, createDispute, fulfillmentTimeline, verifyHandoff } from './fulfillment.js';
import { businessNotifications, consumerNotifications, readBusinessNotification, readConsumerNotification, registerPushDevice, unregisterPushDevice } from './notifications.js';
import { merchantCancelPaidOrder, refundsForOrder } from './refunds.js';

export const martRouter=express.Router();
const uuid=z.uuid();
const storeCategory=z.enum(['electronics','supermarket','restaurants','food_kitchens','wholesale','fashion','home','health','services','other']);
const discoverySchema=z.object({q:z.string().trim().max(120).default(''),limit:z.coerce.number().int().min(1).max(50).default(20),after:uuid.optional(),storeId:uuid.optional(),category:storeCategory.optional()});
const merchantItemsSchema=z.object({limit:z.coerce.number().int().min(1).max(100).default(50),after:uuid.optional(),connectionId:uuid.optional()});
const fulfillmentSchema=z.object({method:z.enum(['PICKUP','DISPATCH']),recipientName:z.string().trim().min(2).max(120),recipientPhone:z.string().trim().min(8).max(20),deliveryAddress:z.string().trim().max(500).optional(),instructions:z.string().trim().max(500).optional()}).strict();

function sessionToken(req:Request){for(const part of(req.headers.cookie??'').split(';')){const[name,...value]=part.trim().split('=');if(name===config.AUTH_SESSION_COOKIE_NAME)return decodeURIComponent(value.join('='));}return null;}
async function merchant(req:Request,permission:'mart:read'|'mart:manage',mutation=false){
 const token=sessionToken(req);const session=token?await getSessionByToken(token):null;
 if(!token||!session?.organization)throw new MartError('Sign in to your business account.',401,'UNAUTHENTICATED');
 if(session.organization.type!=='BUSINESS'||!session.organization.permissions.includes(permission))throw new MartError('You cannot manage this catalog.',403,'PERMISSION_DENIED');
 if(mutation){const csrf=req.header('x-csrf-token')??'';if(!csrf||!await verifyCsrf(token,csrf))throw new MartError('The security token is missing or invalid.',403,'CSRF_INVALID');}
 return{organizationId:session.organization.id,userId:session.user.id};
}
function run(action:(req:Request,res:Response)=>Promise<void>){return(req:Request,res:Response)=>{void action(req,res).catch(error=>{
  if(error instanceof z.ZodError){res.status(400).json({error:'Check the submitted details.',code:'VALIDATION_ERROR',issues:error.issues});return;}
  if(error instanceof MartError){res.status(error.status).json({error:error.message,code:error.code});return;}
  console.error('[mart] request failed',{code:(error as {code?:string}).code??'UNKNOWN'});res.status(503).json({error:'Mart is temporarily unavailable.',code:'MART_UNAVAILABLE'});
 });};}

martRouter.get('/offers',run(async(req,res)=>{
 const parsed=discoverySchema.parse(req.query);res.setHeader('Cache-Control','public,max-age=15');res.json(await discover({query:parsed.q,limit:parsed.limit,after:parsed.after,storeId:parsed.storeId,category:parsed.category}));
}));
martRouter.get('/stores',run(async(req,res)=>{
 const parsed=discoverySchema.omit({storeId:true}).parse(req.query);res.setHeader('Cache-Control','public,max-age=15');res.json(await discoverStorefronts({query:parsed.q,limit:parsed.limit,after:parsed.after,category:parsed.category}));
}));
martRouter.get('/stores/:id',run(async(req,res)=>{
 const id=uuid.parse(req.params.id);res.setHeader('Cache-Control','public,max-age=15');res.json(await publicStorefrontById(id));
}));
martRouter.get('/offers/:id',run(async(req,res)=>{
 const id=uuid.parse(req.params.id);res.setHeader('Cache-Control','public,max-age=15');res.json(await publicItemById(id));
}));
martRouter.post('/offers/:id/quotes',run(async(req,res)=>{
 const id=uuid.parse(req.params.id);const input=z.object({quantity:z.number().int().min(1).max(1000),purchaseMode:z.enum(['PAY_NOW','LAYAWAY']).default('PAY_NOW'),durationMonths:z.number().int().min(1).max(3).optional()}).strict().parse(req.body);
 res.setHeader('Cache-Control','no-store');res.status(201).json(await createMartQuote(id,input.quantity,input.purchaseMode,input.durationMonths));
}));
martRouter.get('/cart',run(async(req,res)=>{
 let identity;try{identity=await consumerIdentity(req.header('authorization'));}catch{throw new MartError('Sign in to view your cart.',401,'UNAUTHENTICATED');}
 res.setHeader('Cache-Control','no-store');res.json(await getCart(identity));
}));
martRouter.post('/cart/items',run(async(req,res)=>{
 let identity;try{identity=await consumerIdentity(req.header('authorization'));}catch{throw new MartError('Sign in to add items to your cart.',401,'UNAUTHENTICATED');}
 const input=z.object({itemId:uuid,quantity:z.number().int().min(1).max(1000)}).strict().parse(req.body);res.setHeader('Cache-Control','no-store');res.status(201).json(await addCartItem(identity,input.itemId,input.quantity));
}));
martRouter.post('/cart/items/:id/update',run(async(req,res)=>{
 let identity;try{identity=await consumerIdentity(req.header('authorization'));}catch{throw new MartError('Sign in to update your cart.',401,'UNAUTHENTICATED');}
 const input=z.object({quantity:z.number().int().min(1).max(1000)}).strict().parse(req.body);res.setHeader('Cache-Control','no-store');res.json(await updateCartItem(identity,uuid.parse(req.params.id),input.quantity));
}));
martRouter.post('/cart/items/:id/remove',run(async(req,res)=>{
 let identity;try{identity=await consumerIdentity(req.header('authorization'));}catch{throw new MartError('Sign in to update your cart.',401,'UNAUTHENTICATED');}
 res.setHeader('Cache-Control','no-store');res.json(await removeCartItem(identity,uuid.parse(req.params.id)));
}));
martRouter.post('/cart/checkout',run(async(req,res)=>{
 let identity;try{identity=await consumerIdentity(req.header('authorization'));}catch{throw new MartError('Sign in to check out.',401,'UNAUTHENTICATED');}
 const input=z.object({idempotencyKey:z.string().regex(/^[A-Za-z0-9._:-]{16,160}$/),fulfillments:z.array(fulfillmentSchema.extend({merchantId:uuid})).min(1).max(50)}).strict().parse(req.body);const selections=Object.fromEntries(input.fulfillments.map(({merchantId,...value})=>[merchantId,value]));res.setHeader('Cache-Control','no-store');res.status(201).json(await createCartCheckout(identity,input.idempotencyKey,selections));
}));
martRouter.get('/checkouts/:id',run(async(req,res)=>{const identity=await consumerIdentity(req.headers.authorization);res.setHeader('Cache-Control','no-store');res.json(await cartCheckoutStatus(identity,uuid.parse(req.params.id)));}));
martRouter.post('/checkouts/:id/approval',run(async(req,res)=>{const identity=await consumerIdentity(req.headers.authorization);res.setHeader('Cache-Control','no-store');res.json(await cartCheckoutApproval(identity,uuid.parse(req.params.id)));}));
martRouter.post('/checkouts/:id/submit',run(async(req,res)=>{const identity=await consumerIdentity(req.headers.authorization);res.setHeader('Cache-Control','no-store');res.json(await submitCartCheckout(identity,uuid.parse(req.params.id),req.body));}));
martRouter.post('/orders',run(async(req,res)=>{
 let identity;try{identity=await consumerIdentity(req.header('authorization'));}catch{throw new MartError('Sign in to place an order.',401,'UNAUTHENTICATED');}
 const input=z.object({quoteId:uuid,idempotencyKey:z.string().regex(/^[A-Za-z0-9._:-]{16,160}$/),fulfillment:fulfillmentSchema}).strict().parse(req.body);
 res.setHeader('Cache-Control','no-store');res.status(201).json(await createMartOrder(identity,input.quoteId,input.idempotencyKey,input.fulfillment));
}));
martRouter.get('/orders',run(async(req,res)=>{
 let identity;try{identity=await consumerIdentity(req.header('authorization'));}catch{throw new MartError('Sign in to view your orders.',401,'UNAUTHENTICATED');}
 res.setHeader('Cache-Control','no-store');res.json(await buyerOrders(identity));
}));
martRouter.get('/orders/:id',run(async(req,res)=>{
 let identity;try{identity=await consumerIdentity(req.header('authorization'));}catch{throw new MartError('Sign in to view your order.',401,'UNAUTHENTICATED');}
 res.setHeader('Cache-Control','no-store');res.json(await buyerOrder(identity,uuid.parse(req.params.id)));
}));
martRouter.post('/orders/:id/cancel',run(async(req,res)=>{
 let identity;try{identity=await consumerIdentity(req.header('authorization'));}catch{throw new MartError('Sign in to cancel your order.',401,'UNAUTHENTICATED');}
 res.setHeader('Cache-Control','no-store');res.json(await cancelMartOrder(identity,uuid.parse(req.params.id)));
}));
martRouter.get('/orders/:id/timeline',run(async(req,res)=>{const identity=await consumerIdentity(req.headers.authorization);const id=uuid.parse(req.params.id);res.setHeader('Cache-Control','no-store');res.json({...await fulfillmentTimeline(identity,id),refunds:await refundsForOrder(id)});}));
martRouter.post('/orders/:id/confirm-receipt',run(async(req,res)=>{const identity=await consumerIdentity(req.headers.authorization);res.setHeader('Cache-Control','no-store');res.json(await confirmReceipt(identity,uuid.parse(req.params.id)));}));
martRouter.post('/orders/:id/disputes',run(async(req,res)=>{const identity=await consumerIdentity(req.headers.authorization);const input=z.object({reason:z.enum(['NOT_RECEIVED','DAMAGED','WRONG_ITEM','MISSING_ITEM','OTHER']),details:z.string().trim().min(1).max(1000)}).strict().parse(req.body);res.setHeader('Cache-Control','no-store');res.status(201).json(await createDispute(identity,uuid.parse(req.params.id),input.reason,input.details));}));
martRouter.get('/notifications',run(async(req,res)=>{const identity=await consumerIdentity(req.headers.authorization);res.setHeader('Cache-Control','no-store');res.json(await consumerNotifications(identity));}));
martRouter.post('/notifications/:id/read',run(async(req,res)=>{const identity=await consumerIdentity(req.headers.authorization);res.setHeader('Cache-Control','no-store');res.json(await readConsumerNotification(identity,uuid.parse(req.params.id)));}));
martRouter.post('/push-devices',run(async(req,res)=>{const identity=await consumerIdentity(req.headers.authorization);const input=z.object({deviceId:z.string().min(8).max(160),platform:z.enum(['IOS','ANDROID']),pushToken:z.string().min(16).max(512)}).strict().parse(req.body);res.status(201).json(await registerPushDevice(identity,input));}));
martRouter.delete('/push-devices/:deviceId',run(async(req,res)=>{const identity=await consumerIdentity(req.headers.authorization);res.json(await unregisterPushDevice(identity,String(req.params.deviceId)));}));
martRouter.post('/orders/:id/payments',run(async(req,res)=>{
 let identity;try{identity=await consumerIdentity(req.header('authorization'));}catch{throw new MartError('Sign in to pay for this order.',401,'UNAUTHENTICATED');}
 const input=z.object({amountMinor:z.string().regex(/^[1-9]\d*$/).optional()}).strict().parse(req.body??{});
 res.setHeader('Cache-Control','no-store');res.status(201).json(await beginMartPayment(identity,uuid.parse(req.params.id),input.amountMinor));
}));
martRouter.get('/payments/:id',run(async(req,res)=>{
 let identity;try{identity=await consumerIdentity(req.header('authorization'));}catch{throw new MartError('Sign in to view this payment.',401,'UNAUTHENTICATED');}
 res.setHeader('Cache-Control','no-store');res.json(await martPaymentStatus(identity,uuid.parse(req.params.id)));
}));
martRouter.post('/payments/:id/approval',run(async(req,res)=>{ const identity=await consumerIdentity(req.headers.authorization);res.json(await martPaymentApproval(identity,uuid.parse(req.params.id))); }));
martRouter.post('/payments/:id/submit',run(async(req,res)=>{
 let identity;try{identity=await consumerIdentity(req.header('authorization'));}catch{throw new MartError('Sign in again to approve this payment.',401,'UNAUTHENTICATED');}
 res.setHeader('Cache-Control','no-store');res.json(await submitMartPayment(identity,uuid.parse(req.params.id),undefined,req.body));
}));

martRouter.get('/merchant',run(async(req,res)=>{
 const auth=await merchant(req,'mart:read');res.setHeader('Cache-Control','no-store');
 const [storefront,connections]=await Promise.all([
  pool.query(`SELECT organization_id,display_name,description,service_area,category,status,published_at,image_url,public_phone,pickup_enabled,dispatch_enabled,pickup_address,dispatch_fee_minor,dispatch_min_days,dispatch_max_days FROM mart_storefronts WHERE organization_id=$1`,[auth.organizationId]),
  pool.query(`SELECT id,source_system,source_tenant_id,label,status,last_synced_at,created_at FROM mart_connections WHERE organization_id=$1 ORDER BY created_at DESC`,[auth.organizationId]),
 ]);
 res.json({storefront:storefront.rows[0]??null,connections:connections.rows});
}));
martRouter.get('/merchant/connection-history',run(async(req,res)=>{const auth=await merchant(req,'mart:read');res.setHeader('Cache-Control','no-store');const result=await pool.query(`SELECT e.action,e.created_at,c.label FROM mart_catalog_events e JOIN mart_connections c ON c.id=e.connection_id WHERE e.organization_id=$1 AND e.action IN ('CONNECTION_APPROVED','CONNECTION_REVOKED') ORDER BY e.created_at DESC LIMIT 50`,[auth.organizationId]);res.json({events:result.rows});}));
martRouter.get('/merchant/items',run(async(req,res)=>{
 const auth=await merchant(req,'mart:read');const input=merchantItemsSchema.parse(req.query);res.setHeader('Cache-Control','no-store');
 const result=await pool.query(`SELECT id,connection_id,source_item_id,source_revision,title,kind,sku,category,currency,price_minor,quantity,availability,source_active,published,last_synced_at FROM mart_items WHERE organization_id=$1 AND ($2::uuid IS NULL OR id<$2::uuid) AND ($3::uuid IS NULL OR connection_id=$3::uuid) ORDER BY id DESC LIMIT $4`,[auth.organizationId,input.after??null,input.connectionId??null,input.limit+1]);
 const items=result.rows.slice(0,input.limit);res.json({items,nextCursor:result.rows.length>input.limit?items.at(-1)?.id??null:null});
}));
martRouter.get('/media/:id',run(async(req,res)=>{
 const id=uuid.parse(req.params.id);
 let ownerId:string|undefined;
 try{ownerId=(await merchant(req,'mart:read')).organizationId;}catch(error){if(!(error instanceof MartError)||![401,403].includes(error.status))throw error;}
 const photo=await readPhoto(id,ownerId);
 // Short caching so unpublishing also removes public photo access promptly.
 res.setHeader('Cache-Control',ownerId?'private,no-store':'public,max-age=15');
 res.setHeader('Content-Type',photo.content_type);res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cross-Origin-Resource-Policy','cross-origin');
 res.setHeader('ETag',`"${photo.content_sha256}"`);res.send(photo.content);
}));
martRouter.get('/source-photos/:connectionId/:photoId',run(async(req,res)=>{
 const connectionId=uuid.parse(req.params.connectionId),photoId=uuid.parse(req.params.photoId);
 let ownerId:string|undefined;
 try{ownerId=(await merchant(req,'mart:read')).organizationId;}catch(error){if(!(error instanceof MartError)||![401,403].includes(error.status))throw error;}
 const url=new URL(`/api/mart/source-photos/${connectionId}/${photoId}`,config.API_PUBLIC_URL).toString();
 const allowed=await pool.query(`SELECT c.organization_id FROM mart_connections c WHERE c.id=$1 AND c.status='ACTIVE' AND (c.organization_id=$2::uuid OR EXISTS (
  SELECT 1 FROM mart_items i JOIN mart_storefronts s ON s.organization_id=i.organization_id JOIN organizations o ON o.id=i.organization_id
  WHERE i.connection_id=c.id AND i.image_urls @> jsonb_build_array($3::text) AND i.published AND i.source_active AND s.status='PUBLISHED' AND o.status='ACTIVE'
 ))`,[connectionId,ownerId??null,url]);
 if(!allowed.rows[0])throw new MartError('Photo not found.',404,'PHOTO_NOT_FOUND');
 const content=await inventoryPhoto(allowed.rows[0].organization_id,connectionId,photoId);
 res.setHeader('Cache-Control',ownerId?'private,no-store':'public,max-age=15');
 res.setHeader('Content-Type','image/webp');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cross-Origin-Resource-Policy','cross-origin');res.send(content);
}));
martRouter.post('/merchant/inventory/images',run(async(req,res)=>{
 const auth=await merchant(req,'mart:manage',true);
 await new Promise<void>((resolve,reject)=>express.raw({type:['image/jpeg','image/png','image/webp'],limit:MAX_PHOTO_BYTES})(req,res,error=>{
  if(error)reject(new MartError('Choose a photo up to 5 MB.',413,'PHOTO_TOO_LARGE'));else resolve();
 }));
 if(!Buffer.isBuffer(req.body))throw new MartError('Choose a JPG, PNG or WebP photo.',400,'INVALID_PHOTO');
 res.setHeader('Cache-Control','no-store');res.status(201).json(await savePhoto(auth.organizationId,auth.userId,req.body,req.header('content-type')?.split(';')[0]??''));
}));
martRouter.get('/merchant/inventory',run(async(req,res)=>{const auth=await merchant(req,'mart:read');res.setHeader('Cache-Control','no-store');res.json(await inventoryRequest(auth.organizationId,'GET','/items'));}));
martRouter.post('/merchant/inventory',run(async(req,res)=>{const auth=await merchant(req,'mart:manage',true);const input=inventoryItemSchema.parse(req.body);await validatePhotoOwnership(auth.organizationId,input.imageUrls);res.status(201).json(await inventoryRequest(auth.organizationId,'POST','/items',input));}));
martRouter.patch('/merchant/inventory/:id',run(async(req,res)=>{const auth=await merchant(req,'mart:manage',true);const id=uuid.parse(req.params.id);const input=inventoryItemSchema.extend({revision:z.number().int().positive()}).parse(req.body);await validatePhotoOwnership(auth.organizationId,input.imageUrls);res.json(await inventoryRequest(auth.organizationId,'PATCH',`/items/${id}`,input));}));
martRouter.post('/merchant/inventory/bulk',run(async(req,res)=>{const auth=await merchant(req,'mart:manage',true);const input=z.object({rows:z.array(inventoryItemSchema).min(1).max(500)}).strict().parse(req.body);await validatePhotoOwnership(auth.organizationId,input.rows.flatMap(item=>item.imageUrls));res.status(201).json(await inventoryRequest(auth.organizationId,'POST','/items/bulk',input));}));
martRouter.get('/merchant/orders',run(async(req,res)=>{
 const auth=await merchant(req,'mart:read');res.setHeader('Cache-Control','no-store');res.json({orders:await merchantOrders(auth.organizationId)});
}));
martRouter.post('/merchant/orders/:id/decision',run(async(req,res)=>{
 const auth=await merchant(req,'mart:manage',true);const input=z.object({decision:z.enum(['CONFIRM','REJECT']),note:z.string().trim().max(500).default('')}).strict().parse(req.body);
 res.setHeader('Cache-Control','no-store');res.json(await decideMartOrder(auth.organizationId,auth.userId,uuid.parse(req.params.id),input.decision,input.note));
}));
martRouter.post('/merchant/orders/:id/fulfillment',run(async(req,res)=>{
 const auth=await merchant(req,'mart:manage',true);const input=z.object({state:z.enum(['READY','OUT_FOR_DELIVERY'])}).strict().parse(req.body);
 res.setHeader('Cache-Control','no-store');res.json(await updateMartOrderFulfillment(auth.organizationId,auth.userId,uuid.parse(req.params.id),input.state));
}));
martRouter.post('/merchant/orders/:id/handoff',run(async(req,res)=>{const auth=await merchant(req,'mart:manage',true);const input=z.object({pin:z.string().regex(/^\d{6}$/)}).strict().parse(req.body);res.setHeader('Cache-Control','no-store');res.json(await verifyHandoff(auth.organizationId,auth.userId,uuid.parse(req.params.id),input.pin));}));
martRouter.post('/merchant/orders/:id/cancel-paid',run(async(req,res)=>{const auth=await merchant(req,'mart:manage',true);const input=z.object({note:z.string().trim().min(3).max(500)}).strict().parse(req.body);res.setHeader('Cache-Control','no-store');res.json(await merchantCancelPaidOrder(auth.organizationId,auth.userId,uuid.parse(req.params.id),input.note));}));
martRouter.get('/merchant/notifications',run(async(req,res)=>{const auth=await merchant(req,'mart:read');res.setHeader('Cache-Control','no-store');res.json(await businessNotifications(auth.organizationId));}));
martRouter.post('/merchant/notifications/:id/read',run(async(req,res)=>{const auth=await merchant(req,'mart:read',true);res.setHeader('Cache-Control','no-store');res.json(await readBusinessNotification(auth.organizationId,uuid.parse(req.params.id)));}));
martRouter.put('/merchant/storefront',run(async(req,res)=>{
 const auth=await merchant(req,'mart:manage',true);const input=storefrontSchema.parse(req.body);res.setHeader('Cache-Control','no-store');res.json(await updateStorefront(auth.organizationId,auth.userId,input));
}));
martRouter.post('/merchant/connections',run(async(req,res)=>{
 const auth=await merchant(req,'mart:manage',true);const input=connectionSchema.parse(req.body);res.setHeader('Cache-Control','no-store');res.status(201).json(await createConnection(auth.organizationId,auth.userId,input));
}));
martRouter.delete('/merchant/connections/:id',run(async(req,res)=>{
 const auth=await merchant(req,'mart:manage',true);const id=uuid.parse(req.params.id);res.setHeader('Cache-Control','no-store');res.json(await revokeConnection(auth.organizationId,id,auth.userId));
}));
martRouter.post('/connector/ingest',run(async(req,res)=>{
 const token=req.header('x-mart-connector-token')??'';const connection=await authenticateConnection(token);const batch=ingestSchema.parse(req.body);res.setHeader('Cache-Control','no-store');res.json(await ingest(connection,batch));
}));
martRouter.get('/connector/status',run(async(req,res)=>{
 const token=req.header('x-mart-connector-token')??'';const connection=await pendingConnection(token);res.setHeader('Cache-Control','no-store');res.json({id:connection.id,merchantId:connection.organization_id,sourceSystem:connection.source_system,sourceTenantId:connection.source_tenant_id,status:connection.status,mediaBaseUrl:config.API_PUBLIC_URL});
}));
martRouter.get('/connector/media/:id',run(async(req,res)=>{
 const connection=await authenticateConnection(req.header('x-mart-connector-token')??'');
 const photo=await readPhoto(uuid.parse(req.params.id),connection.organization_id);
 res.setHeader('Cache-Control','private,no-store');res.type('image/webp').send(photo.content);
}));
martRouter.post('/connector/confirm',run(async(req,res)=>{const token=req.header('x-mart-connector-token')??'';res.setHeader('Cache-Control','no-store');res.json(await confirmConnection(token));}));
