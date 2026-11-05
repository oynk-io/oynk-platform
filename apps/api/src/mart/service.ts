import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { publicItem, sourceItemSchema, storefrontSchema, type ingestSchema } from './model.js';
import type { z } from 'zod';

export class MartError extends Error { constructor(message:string,public status=400,public code='MART_ERROR'){super(message);} }
type Ingest=z.infer<typeof ingestSchema>;
const tokenHash=(token:string)=>createHash('sha256').update(`oynk-mart-connector:v1:${token}`).digest('hex');

async function event(db:PoolClient,details:{organizationId:string;connectionId?:string;itemId?:string;eventId?:string;action:string;actorType:'MERCHANT'|'CONNECTOR'|'SYSTEM';actorReference:string;metadata?:Record<string,unknown>}){
 await db.query(`INSERT INTO mart_catalog_events(id,organization_id,connection_id,item_id,event_id,action,actor_type,actor_reference,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),details.organizationId,details.connectionId??null,details.itemId??null,details.eventId??null,details.action,details.actorType,details.actorReference,details.metadata??{}]);
}

export async function createConnection(organizationId:string,userId:string,input:{sourceSystem:string;sourceTenantId:string;label:string}){
 const token=`mart_${randomBytes(32).toString('base64url')}`;
 const id=randomUUID();const db=await pool.connect();
 try{await db.query('BEGIN');
  const org=await db.query(`SELECT status FROM organizations WHERE id=$1 AND type='BUSINESS' FOR SHARE`,[organizationId]);
  if(!['COMPLIANCE_INCOMPLETE','COMPLIANCE_SUBMITTED','UNDER_REVIEW','ADDITIONAL_INFORMATION_REQUIRED','APPROVED','ACTIVE'].includes(org.rows[0]?.status))throw new MartError('Verify your Oynk business email before connecting inventory.',409,'BUSINESS_NOT_VERIFIED');
  await db.query(`INSERT INTO mart_connections(id,organization_id,source_system,source_tenant_id,label,token_hash,status) VALUES($1,$2,$3,$4,$5,$6,'PENDING')`,[id,organizationId,input.sourceSystem,input.sourceTenantId,input.label,tokenHash(token)]);
  await event(db,{organizationId,connectionId:id,action:'CONNECTION_CREATED',actorType:'MERCHANT',actorReference:userId,metadata:{sourceSystem:input.sourceSystem}});
  await db.query('COMMIT');return{id,token,sourceSystem:input.sourceSystem,sourceTenantId:input.sourceTenantId,label:input.label};
 }catch(error){await db.query('ROLLBACK');if((error as {code?:string}).code==='23505')throw new MartError('This source is already connected.',409,'CONNECTION_EXISTS');throw error;}finally{db.release();}
}

export async function revokeConnection(organizationId:string,connectionId:string,userId:string){
 const db=await pool.connect();try{await db.query('BEGIN');
  const result=await db.query(`UPDATE mart_connections SET status='REVOKED',revoked_at=NOW() WHERE id=$1 AND organization_id=$2 AND status IN ('PENDING','ACTIVE') RETURNING id`,[connectionId,organizationId]);
  if(!result.rows[0])throw new MartError('Active connection not found.',404,'CONNECTION_NOT_FOUND');
  await event(db,{organizationId,connectionId,action:'CONNECTION_REVOKED',actorType:'MERCHANT',actorReference:userId});
  await db.query('COMMIT');return{revoked:true};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

export async function authenticateConnection(token:string){
 if(!/^mart_[A-Za-z0-9_-]{43}$/.test(token))throw new MartError('Connector authentication failed.',401,'CONNECTOR_UNAUTHORIZED');
 const result=await pool.query(`SELECT c.id,c.organization_id,c.source_system,c.source_tenant_id FROM mart_connections c JOIN organizations o ON o.id=c.organization_id WHERE c.token_hash=$1 AND c.status='ACTIVE' AND o.status IN ('COMPLIANCE_INCOMPLETE','COMPLIANCE_SUBMITTED','UNDER_REVIEW','ADDITIONAL_INFORMATION_REQUIRED','APPROVED','ACTIVE') AND o.type='BUSINESS'`,[tokenHash(token)]);
 if(!result.rows[0])throw new MartError('Connector authentication failed.',401,'CONNECTOR_UNAUTHORIZED');
 return result.rows[0] as {id:string;organization_id:string;source_system:string;source_tenant_id:string};
}
export async function pendingConnection(token:string){
 if(!/^mart_[A-Za-z0-9_-]{43}$/.test(token))throw new MartError('Connector authentication failed.',401,'CONNECTOR_UNAUTHORIZED');
 const result=await pool.query(`SELECT c.id,c.organization_id,c.source_system,c.source_tenant_id,c.status FROM mart_connections c JOIN organizations o ON o.id=c.organization_id WHERE c.token_hash=$1 AND c.status IN ('PENDING','ACTIVE') AND o.type='BUSINESS'`,[tokenHash(token)]);
 if(!result.rows[0])throw new MartError('Connector authentication failed.',401,'CONNECTOR_UNAUTHORIZED');
 return result.rows[0] as {id:string;organization_id:string;source_system:string;source_tenant_id:string;status:string};
}
export async function confirmConnection(token:string){const source=await pendingConnection(token);if(source.status==='PENDING'){const db=await pool.connect();try{await db.query('BEGIN');const result=await db.query(`UPDATE mart_connections SET status='ACTIVE' WHERE id=$1 AND status='PENDING' RETURNING id`,[source.id]);if(result.rows[0])await event(db,{organizationId:source.organization_id,connectionId:source.id,action:'CONNECTION_APPROVED',actorType:'CONNECTOR',actorReference:source.source_tenant_id});await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}}return{id:source.id,confirmed:true};}

export async function ingest(connection:{id:string;organization_id:string},batch:Ingest){
 const db=await pool.connect();try{await db.query('BEGIN');
  // Lock the connection so revocation and ingestion cannot cross in flight.
  const current=await db.query(`SELECT id FROM mart_connections WHERE id=$1 AND organization_id=$2 AND status='ACTIVE' FOR UPDATE`,[connection.id,connection.organization_id]);
  if(!current.rows[0])throw new MartError('Connector authentication failed.',401,'CONNECTOR_UNAUTHORIZED');
  const payloadHash=createHash('sha256').update(JSON.stringify(batch.items)).digest('hex');
  const claim=await db.query(`INSERT INTO mart_catalog_events(id,organization_id,connection_id,event_id,action,actor_type,actor_reference,metadata) VALUES($1,$2,$3,$4,'BATCH_INGESTED','CONNECTOR',$4,$5) ON CONFLICT(connection_id,event_id) DO NOTHING RETURNING id`,[randomUUID(),connection.organization_id,connection.id,batch.eventId,{itemCount:batch.items.length,payloadHash}]);
  if(!claim.rows[0]){
   const prior=await db.query(`SELECT metadata->>'payloadHash' AS payload_hash FROM mart_catalog_events WHERE connection_id=$1 AND event_id=$2`,[connection.id,batch.eventId]);
   if(prior.rows[0]?.payload_hash!==payloadHash)throw new MartError('This event ID was already used for different data.',409,'EVENT_CONFLICT');
   await db.query('COMMIT');return{duplicate:true,applied:0,stale:0};
  }
  let applied=0,stale=0;
  for(const rawItem of batch.items){
   const item=sourceItemSchema.parse(rawItem);
   const itemHash=createHash('sha256').update(JSON.stringify(item)).digest('hex');
   const result=await db.query(`INSERT INTO mart_items(id,organization_id,connection_id,source_item_id,source_revision,source_payload_hash,kind,sku,title,description,category,image_urls,currency,price_minor,quantity,availability,source_active,published,published_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,CASE WHEN $18 THEN NOW() ELSE NULL END)
    ON CONFLICT(connection_id,source_item_id) DO UPDATE SET source_revision=EXCLUDED.source_revision,source_payload_hash=EXCLUDED.source_payload_hash,kind=EXCLUDED.kind,sku=EXCLUDED.sku,title=EXCLUDED.title,description=EXCLUDED.description,category=EXCLUDED.category,image_urls=EXCLUDED.image_urls,currency=EXCLUDED.currency,price_minor=EXCLUDED.price_minor,quantity=EXCLUDED.quantity,availability=EXCLUDED.availability,source_active=EXCLUDED.source_active,last_synced_at=NOW(),updated_at=NOW()
    ,published=EXCLUDED.published,published_at=CASE WHEN EXCLUDED.published THEN COALESCE(mart_items.published_at,NOW()) ELSE NULL END
    WHERE mart_items.source_revision < EXCLUDED.source_revision OR (mart_items.source_revision=EXCLUDED.source_revision AND mart_items.source_payload_hash=EXCLUDED.source_payload_hash) RETURNING id`,[randomUUID(),connection.organization_id,connection.id,item.sourceItemId,item.revision,itemHash,item.kind,item.sku??null,item.title,item.description,item.category??null,JSON.stringify(item.imageUrls),item.currency,item.priceMinor,item.quantity??null,item.availability,item.active,item.published]);
   if(result.rows[0])applied++;else{
    const previous=await db.query(`SELECT source_revision FROM mart_items WHERE connection_id=$1 AND source_item_id=$2`,[connection.id,item.sourceItemId]);
    if(Number(previous.rows[0]?.source_revision)===item.revision)throw new MartError('Item data changed without a new revision.',409,'ITEM_REVISION_CONFLICT');
    stale++;
   }
  }
  await db.query(`UPDATE mart_connections SET last_synced_at=NOW() WHERE id=$1`,[connection.id]);
  await db.query('COMMIT');return{duplicate:false,applied,stale};
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

export async function updateStorefront(organizationId:string,userId:string,raw:{displayName:string;published:boolean;description?:string;serviceArea?:string;category?:string;imageUrl?:string|null;publicPhone?:string|null;pickupEnabled?:boolean;dispatchEnabled?:boolean;pickupAddress?:string;dispatchFeeMinor?:string;dispatchMinDays?:number;dispatchMaxDays?:number}){
 const input=storefrontSchema.parse(raw);
 const db=await pool.connect();try{await db.query('BEGIN');
  const org=await db.query(`SELECT status FROM organizations WHERE id=$1 AND type='BUSINESS' FOR SHARE`,[organizationId]);
  if(!['COMPLIANCE_INCOMPLETE','COMPLIANCE_SUBMITTED','UNDER_REVIEW','ADDITIONAL_INFORMATION_REQUIRED','APPROVED','ACTIVE'].includes(org.rows[0]?.status))throw new MartError('Verify your Oynk business email before setting up a storefront.',409,'BUSINESS_NOT_VERIFIED');
  if(input.published&&!['APPROVED','ACTIVE'].includes(org.rows[0].status))throw new MartError('Business review must be approved before preparing the storefront for publication.',409,'BUSINESS_NOT_APPROVED');
  if(input.imageUrl){
   const owned=await db.query('SELECT id FROM mart_media WHERE organization_id=$1 AND public_url=$2',[organizationId,input.imageUrl]);
   if(!owned.rows[0])throw new MartError('Choose a storefront photo uploaded by this business.',403,'PHOTO_NOT_OWNED');
  }
  const status=input.published?'PUBLISHED':'PRIVATE';
  const result=await db.query(`INSERT INTO mart_storefronts(organization_id,display_name,description,service_area,category,status,published_at,image_url,public_phone,pickup_enabled,dispatch_enabled,pickup_address,dispatch_fee_minor,dispatch_min_days,dispatch_max_days) VALUES($1,$2,$3,$4,$5,$6,CASE WHEN $6='PUBLISHED' THEN NOW() ELSE NULL END,$7,$9,$11,$12,$13,$14,$15,$16)
   ON CONFLICT(organization_id) DO UPDATE SET display_name=EXCLUDED.display_name,description=EXCLUDED.description,service_area=EXCLUDED.service_area,category=EXCLUDED.category,status=EXCLUDED.status,published_at=CASE WHEN EXCLUDED.status='PUBLISHED' THEN COALESCE(mart_storefronts.published_at,NOW()) ELSE NULL END,image_url=CASE WHEN $8::boolean THEN EXCLUDED.image_url ELSE mart_storefronts.image_url END,public_phone=CASE WHEN $10::boolean THEN EXCLUDED.public_phone ELSE mart_storefronts.public_phone END,pickup_enabled=EXCLUDED.pickup_enabled,dispatch_enabled=EXCLUDED.dispatch_enabled,pickup_address=EXCLUDED.pickup_address,dispatch_fee_minor=EXCLUDED.dispatch_fee_minor,dispatch_min_days=EXCLUDED.dispatch_min_days,dispatch_max_days=EXCLUDED.dispatch_max_days,updated_at=NOW()
   RETURNING organization_id,display_name,description,service_area,category,status,published_at,image_url,public_phone,pickup_enabled,dispatch_enabled,pickup_address,dispatch_fee_minor,dispatch_min_days,dispatch_max_days`,[organizationId,input.displayName,input.description??'',input.serviceArea??'',input.category??'other',status,input.imageUrl??null,input.imageUrl!==undefined,input.publicPhone??null,input.publicPhone!==undefined,input.pickupEnabled,input.dispatchEnabled,input.pickupAddress,input.dispatchFeeMinor,input.dispatchMinDays,input.dispatchMaxDays]);
  await event(db,{organizationId,action:'STOREFRONT_UPDATED',actorType:'MERCHANT',actorReference:userId,metadata:{status,imageChanged:input.imageUrl!==undefined,contactChanged:input.publicPhone!==undefined}});
  await db.query('COMMIT');return result.rows[0];
 }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

function partialSearchPattern(query:string){
 // Parameterized LIKE patterns treat punctuation as input, never wildcards.
 // Joining words with % also handles partial phrases and extra whitespace.
 return `%${query.trim().split(/\s+/).map(part=>part.replace(/[\\%_]/g,'\\$&')).join('%')}%`;
}

export async function discover(input:{query:string;limit:number;after?:string;storeId?:string;category?:string}){
 const result=await pool.query(`SELECT i.*,s.display_name,s.service_area,s.category AS store_category,s.pickup_enabled,s.dispatch_enabled,s.pickup_address,s.dispatch_fee_minor,s.dispatch_min_days,s.dispatch_max_days FROM mart_items i JOIN mart_storefronts s ON s.organization_id=i.organization_id JOIN mart_connections c ON c.id=i.connection_id JOIN organizations o ON o.id=i.organization_id
  WHERE i.published AND i.source_active AND i.availability='IN_STOCK' AND i.last_synced_at>NOW()-INTERVAL '24 hours' AND s.status='PUBLISHED' AND c.status='ACTIVE' AND o.status='ACTIVE'
   AND ($1::text='' OR ($7::boolean AND to_tsvector('simple',coalesce(i.title,'') || ' ' || coalesce(i.description,'') || ' ' || coalesce(i.category,'')) @@ plainto_tsquery('simple',$1))
    OR (coalesce(i.title,'') || ' ' || coalesce(i.description,'') || ' ' || coalesce(i.category,'') || ' ' || coalesce(i.sku,'')) ILIKE $6
    OR s.display_name ILIKE $6)
   AND ($2::uuid IS NULL OR i.organization_id=$2::uuid)
   AND ($3::text IS NULL OR s.category=$3)
   AND ($4::uuid IS NULL OR i.id<$4::uuid) ORDER BY i.id DESC LIMIT $5`,[input.query.trim(),input.storeId??null,input.category??null,input.after??null,input.limit+1,partialSearchPattern(input.query),!/[\\%_]/.test(input.query)]);
 const rows=result.rows.slice(0,input.limit);
 return{items:rows.map(publicItem),nextCursor:result.rows.length>input.limit?rows.at(-1)?.id??null:null};
}

export async function discoverStorefronts(input:{query:string;limit:number;after?:string;category?:string}){
 const result=await pool.query(`SELECT o.id,s.display_name AS name,s.description,s.service_area AS "serviceArea",s.category,TRUE AS verified,COUNT(i.id)::int AS "itemCount",
  s.image_url AS "imageUrl",s.public_phone AS "publicPhone",s.pickup_enabled AS "pickupEnabled",s.dispatch_enabled AS "dispatchEnabled",s.pickup_address AS "pickupAddress",s.dispatch_fee_minor::text AS "dispatchFeeMinor",s.dispatch_min_days AS "dispatchMinDays",s.dispatch_max_days AS "dispatchMaxDays",
  CASE WHEN s.image_url IS NOT NULL THEN 'storefront' ELSE NULL END AS "imageSource"
  FROM organizations o JOIN mart_storefronts s ON s.organization_id=o.id
  JOIN mart_items i ON i.organization_id=o.id JOIN mart_connections c ON c.id=i.connection_id
  WHERE o.type='BUSINESS' AND o.status='ACTIVE' AND s.status='PUBLISHED'
   AND c.status='ACTIVE' AND i.published AND i.source_active AND i.availability='IN_STOCK'
   AND i.last_synced_at>NOW()-INTERVAL '24 hours'
   AND ($2::text IS NULL OR s.category=$2)
   AND ($3::uuid IS NULL OR o.id<$3::uuid)
  GROUP BY o.id,s.display_name,s.description,s.service_area,s.category,s.image_url,s.public_phone,s.pickup_enabled,s.dispatch_enabled,s.pickup_address,s.dispatch_fee_minor,s.dispatch_min_days,s.dispatch_max_days
  HAVING ($1::text='' OR s.display_name ILIKE $5 OR bool_or(
   ($6::boolean AND to_tsvector('simple',coalesce(i.title,'') || ' ' || coalesce(i.description,'') || ' ' || coalesce(i.category,'')) @@ plainto_tsquery('simple',$1))
   OR (coalesce(i.title,'') || ' ' || coalesce(i.description,'') || ' ' || coalesce(i.category,'') || ' ' || coalesce(i.sku,'')) ILIKE $5))
  ORDER BY o.id DESC LIMIT $4`,[input.query.trim(),input.category??null,input.after??null,input.limit+1,partialSearchPattern(input.query),!/[\\%_]/.test(input.query)]);
 const rows=result.rows.slice(0,input.limit);
 return{stores:rows,nextCursor:result.rows.length>input.limit?rows.at(-1)?.id??null:null};
}

export async function publicStorefrontById(id:string){
 const result=await pool.query(`SELECT o.id,s.display_name AS name,s.description,s.service_area AS "serviceArea",s.category,TRUE AS verified,COUNT(i.id)::int AS "itemCount",
  s.image_url AS "imageUrl",s.public_phone AS "publicPhone",s.pickup_enabled AS "pickupEnabled",s.dispatch_enabled AS "dispatchEnabled",s.pickup_address AS "pickupAddress",s.dispatch_fee_minor::text AS "dispatchFeeMinor",s.dispatch_min_days AS "dispatchMinDays",s.dispatch_max_days AS "dispatchMaxDays",
  CASE WHEN s.image_url IS NOT NULL THEN 'storefront' ELSE NULL END AS "imageSource"
  FROM organizations o JOIN mart_storefronts s ON s.organization_id=o.id
  JOIN mart_items i ON i.organization_id=o.id JOIN mart_connections c ON c.id=i.connection_id
  WHERE o.id=$1 AND o.type='BUSINESS' AND o.status='ACTIVE' AND s.status='PUBLISHED'
   AND c.status='ACTIVE' AND i.published AND i.source_active AND i.availability='IN_STOCK'
   AND i.last_synced_at>NOW()-INTERVAL '24 hours'
  GROUP BY o.id,s.display_name,s.description,s.service_area,s.category,s.image_url,s.public_phone,s.pickup_enabled,s.dispatch_enabled,s.pickup_address,s.dispatch_fee_minor,s.dispatch_min_days,s.dispatch_max_days`,[id]);
 if(!result.rows[0])throw new MartError('Storefront not found or currently unavailable.',404,'STOREFRONT_UNAVAILABLE');
 return result.rows[0] as {id:string;name:string;description:string;serviceArea:string;category:string;verified:boolean;itemCount:number;imageUrl:string|null;imageSource:'storefront'|null;publicPhone:string|null};
}

export async function publicItemById(id:string){
 const result=await pool.query(`SELECT i.*,s.display_name,s.service_area,s.category AS store_category,s.pickup_enabled,s.dispatch_enabled,s.pickup_address,s.dispatch_fee_minor,s.dispatch_min_days,s.dispatch_max_days FROM mart_items i JOIN mart_storefronts s ON s.organization_id=i.organization_id JOIN mart_connections c ON c.id=i.connection_id JOIN organizations o ON o.id=i.organization_id WHERE i.id=$1 AND i.published AND i.source_active AND i.availability='IN_STOCK' AND i.last_synced_at>NOW()-INTERVAL '24 hours' AND s.status='PUBLISHED' AND c.status='ACTIVE' AND o.status='ACTIVE'`,[id]);
 if(!result.rows[0])throw new MartError('Offer not found or currently unavailable.',404,'OFFER_UNAVAILABLE');
 return publicItem(result.rows[0]);
}
