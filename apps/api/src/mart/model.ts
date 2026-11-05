import { z } from 'zod';
import { config } from '../config.js';

export const sourceItemSchema=z.object({
 sourceItemId:z.string().trim().min(1).max(160),
 revision:z.number().int().safe().positive(),
 kind:z.enum(['PRODUCT','SERVICE']),
 sku:z.string().trim().max(120).nullable().optional(),
 title:z.string().trim().min(1).max(180),
 description:z.string().trim().max(4000).default(''),
 category:z.string().trim().max(120).nullable().optional(),
 imageUrls:z.array(z.url().max(2048).refine(url=>url.startsWith('https://'))).max(8).default([]),
 currency:z.string().regex(/^[A-Z]{3}$/),
 priceMinor:z.number().int().safe().nonnegative(),
 quantity:z.string().regex(/^\d{1,15}(?:\.\d{1,3})?$/).nullable().optional(),
 availability:z.enum(['IN_STOCK','OUT_OF_STOCK','UNKNOWN']),
 active:z.boolean(),
 published:z.boolean(),
}).strict().superRefine((item,ctx)=>{
 if(item.availability==='IN_STOCK'&&item.quantity!==null&&item.quantity!==undefined&&Number(item.quantity)<=0)
  ctx.addIssue({code:'custom',path:['quantity'],message:'An in-stock item must have positive quantity.'});
});

export const ingestSchema=z.object({
 eventId:z.string().trim().min(8).max(160),
 items:z.array(sourceItemSchema).min(1).max(100),
}).strict().superRefine((batch,ctx)=>{
 const ids=new Set<string>();
 for(const [index,item] of batch.items.entries()){
  if(ids.has(item.sourceItemId))ctx.addIssue({code:'custom',path:['items',index,'sourceItemId'],message:'Duplicate source item ID.'});
  ids.add(item.sourceItemId);
 }
});

export const connectionSchema=z.object({
 sourceSystem:z.string().regex(/^[a-z][a-z0-9_]{1,39}$/),
 sourceTenantId:z.string().trim().min(1).max(160),
 label:z.string().trim().min(1).max(120),
}).strict();

export const storefrontSchema=z.object({
 displayName:z.string().trim().min(2).max(120),
 description:z.string().trim().max(400).default(''),
 serviceArea:z.string().trim().max(120).default(''),
 publicPhone:z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'Use an international phone number, such as +2348012345678.').nullable().optional(),
 imageUrl:z.url().max(2048).refine(url=>url.startsWith('https://')).nullable().optional(),
 category:z.enum(['electronics','supermarket','restaurants','food_kitchens','wholesale','fashion','home','health','services','other']).default('other'),
 pickupEnabled:z.boolean().default(true),
 dispatchEnabled:z.boolean().default(false),
 pickupAddress:z.string().trim().max(500).default(''),
 dispatchFeeMinor:z.string().regex(/^\d{1,12}$/).default('0'),
 dispatchMinDays:z.number().int().min(0).max(30).default(1),
 dispatchMaxDays:z.number().int().min(0).max(60).default(3),
 published:z.boolean(),
}).strict().superRefine((value,ctx)=>{if(!value.pickupEnabled&&!value.dispatchEnabled)ctx.addIssue({code:'custom',path:['pickupEnabled'],message:'Enable pickup or dispatch.'});if(value.pickupAddress.length>0&&value.pickupAddress.length<5)ctx.addIssue({code:'custom',path:['pickupAddress'],message:'Enter the complete pickup address.'});if(value.dispatchMaxDays<value.dispatchMinDays)ctx.addIssue({code:'custom',path:['dispatchMaxDays'],message:'Maximum dispatch time must be after the minimum.'});});

export const MART_LAYAWAY_SERVICE_FEE_MINOR=500_000;
const layawayStoreCategories=new Set(['electronics','home']);
const layawayItemTerms=['electronic','appliance','phone','computer','laptop','television','tv','furniture','home'];

export function layawayPolicyFor(row:Record<string,unknown>){
 if(!config.MART_LAYAWAY_ENABLED)return{eligible:false,serviceFeeMinor:'0',maxMonths:0,durations:[]};
 const itemCategory=String(row.category??'').trim().toLocaleLowerCase();
 const storeCategory=String(row.store_category??'').trim().toLocaleLowerCase();
 const eligible=row.kind==='PRODUCT'&&String(row.currency)==='NGN'&&Number(row.price_minor)>0&&(
  layawayStoreCategories.has(storeCategory)||layawayItemTerms.some(term=>itemCategory.includes(term))
 );
 return eligible?{eligible:true,serviceFeeMinor:String(MART_LAYAWAY_SERVICE_FEE_MINOR),maxMonths:3,durations:[1,2,3]}:{eligible:false,serviceFeeMinor:'0',maxMonths:0,durations:[]};
}

export function publicItem(row:Record<string,unknown>){
 return {id:row.id,merchantId:row.organization_id,merchantName:row.display_name,merchantServiceArea:row.service_area,merchantCategory:row.store_category,merchantVerified:true,kind:row.kind,sku:row.sku,title:row.title,description:row.description,category:row.category,imageUrls:Array.isArray(row.image_urls)?row.image_urls:[],currency:row.currency,priceMinor:String(row.price_minor),availability:row.availability,quantity:row.quantity===null?null:String(row.quantity),lastSyncedAt:row.last_synced_at,layaway:layawayPolicyFor(row),fulfillmentOptions:{pickup:{enabled:Boolean(row.pickup_enabled),address:String(row.pickup_address??row.service_area??'')},dispatch:{enabled:Boolean(row.dispatch_enabled),feeMinor:String(row.dispatch_fee_minor??0),minDays:Number(row.dispatch_min_days??1),maxDays:Number(row.dispatch_max_days??3)}}};
}
