import { createHmac, randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { MartError } from './service.js';

type Connection={id:string;source_system:string;token_hash:string};
async function connection(organizationId:string,connectionId?:string){
 const result=await pool.query(`SELECT id,source_system,token_hash FROM mart_connections WHERE organization_id=$1 AND status='ACTIVE' AND ($2::uuid IS NULL OR id=$2) ORDER BY created_at DESC LIMIT 1`,[organizationId,connectionId??null]);
 if(!result.rows[0])throw new MartError('Connect an inventory provider first.',409,'SOURCE_NOT_CONNECTED');
 return result.rows[0] as Connection;
}
async function sourceResponse(organizationId:string,method:'GET'|'POST'|'PATCH',path:string,payload?:unknown,requestId?:string,connectionId?:string){
 const source=await connection(organizationId,connectionId);
 // Providers are chosen by Oynk deployment configuration, never by merchant input.
 const target=source.source_system==='lemonbooks'?process.env.MART_LEMONBOOKS_API_URL?.trim():undefined;
 if(!target)throw new MartError('Inventory management is not available for this provider yet.',503,'SOURCE_UNAVAILABLE');
 const url=new URL(`/api/v3/integrations/oynk-mart/source-inventory${path}`,target);
 const local=config.APP_ENV!=='production'&&url.protocol==='http:'&&['localhost','127.0.0.1','host.docker.internal'].includes(url.hostname);
 if(url.protocol!=='https:'&&!local)throw new MartError('Inventory source is not configured securely.',503,'SOURCE_UNAVAILABLE');
 const body=method==='GET'?'':JSON.stringify(payload??{});
 const timestamp=String(Date.now());
 const signature=createHmac('sha256',source.token_hash).update(`mart-source-admin:v1\n${method}\n${path}\n${source.id}\n${timestamp}\n${body}`).digest('hex');
 let response:Response;
 try{response=await fetch(url,{method,redirect:'error',headers:{'content-type':'application/json','x-mart-connection-id':source.id,'x-mart-timestamp':timestamp,'x-mart-signature':signature,...(method==='GET'?{}:{'x-mart-request-id':requestId??randomUUID()})},...(method==='GET'?{}:{body}),signal:AbortSignal.timeout(10000)});}catch{throw new MartError('Could not reach your inventory provider. Try again.',503,'SOURCE_UNAVAILABLE');}
 if(!response.ok){const error=await response.json().catch(()=>null) as {error?:string}|null;throw new MartError(response.status===409?(error?.error??'This item changed. Refresh before saving.'):'Your inventory provider could not complete the request.',response.status===409?409:503,'SOURCE_ERROR');}
 return response;
}
export async function inventoryRequest(organizationId:string,method:'GET'|'POST'|'PATCH',path:string,payload?:unknown,requestId?:string,connectionId?:string){
 const response=await sourceResponse(organizationId,method,path,payload,requestId,connectionId);
 try{return await response.json() as unknown;}catch{throw new MartError('Your inventory provider returned an invalid response.',503,'SOURCE_INVALID_RESPONSE');}
}
export async function inventoryPhoto(organizationId:string,connectionId:string,photoId:string){
 const response=await sourceResponse(organizationId,'GET',`/photos/${photoId}`,undefined,undefined,connectionId);
 if(response.headers.get('content-type')?.split(';')[0]!=='image/webp')throw new MartError('Photo is unavailable.',502,'SOURCE_INVALID_PHOTO');
 const content=Buffer.from(await response.arrayBuffer());
 if(content.length>2*1024*1024)throw new MartError('Photo is unavailable.',502,'SOURCE_INVALID_PHOTO');
 return content;
}
