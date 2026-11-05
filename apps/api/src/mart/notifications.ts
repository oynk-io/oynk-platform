import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import type { Identity } from '../consumer/auth.js';
import { accountFor } from '../consumer/service.js';
import { MartError } from './service.js';

type NoticeInput={
 type:string;title:string;body:string;deduplicationKey:string;data?:Record<string,unknown>;
 consumerAccountId?:string;organizationId?:string;
};

export async function createMartNotification(db:PoolClient,input:NoticeInput){
 const id=randomUUID();
 const created=await db.query(`INSERT INTO mart_notifications(id,consumer_account_id,organization_id,type,title,body,data,deduplication_key)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(deduplication_key) DO NOTHING RETURNING id`,
 [id,input.consumerAccountId??null,input.organizationId??null,input.type,input.title,input.body,input.data??{},input.deduplicationKey]);
 if(!created.rows[0]||!input.consumerAccountId)return created.rows[0]?.id??null;
 await db.query(`INSERT INTO mart_notification_deliveries(id,notification_id,push_device_id)
  SELECT gen_random_uuid(),$1,d.id FROM consumer_push_devices d WHERE d.consumer_account_id=$2 AND d.active
  ON CONFLICT(notification_id,push_device_id) DO NOTHING`,[id,input.consumerAccountId]);
 return id;
}

export async function notifyBuyerForOrder(db:PoolClient,orderId:string,input:Omit<NoticeInput,'consumerAccountId'|'organizationId'|'deduplicationKey'>&{event:string}){
 const account=(await db.query(`SELECT a.id FROM mart_orders o JOIN consumer_accounts a ON a.subject=o.buyer_subject AND a.network=o.buyer_network AND a.wallet=o.buyer_wallet WHERE o.id=$1`,[orderId])).rows[0];
 if(!account)return null;
 return createMartNotification(db,{...input,consumerAccountId:account.id,deduplicationKey:`order:${orderId}:${input.event}`});
}

export async function notifyMerchantForOrder(db:PoolClient,orderId:string,input:Omit<NoticeInput,'consumerAccountId'|'organizationId'|'deduplicationKey'>&{event:string}){
 const order=(await db.query(`SELECT organization_id FROM mart_orders WHERE id=$1`,[orderId])).rows[0];
 if(!order)return null;
 return createMartNotification(db,{...input,organizationId:order.organization_id,deduplicationKey:`order:${orderId}:${input.event}`});
}

export async function consumerNotifications(identity:Identity){
 const account=await accountFor(identity);
 const rows=await pool.query(`SELECT id,type,title,body,data,read_at AS "readAt",created_at AS "createdAt" FROM mart_notifications WHERE consumer_account_id=$1 ORDER BY created_at DESC LIMIT 100`,[account.id]);
 const unread=rows.rows.filter(row=>!row.readAt).length;
 return{notifications:rows.rows,unread};
}

export async function readConsumerNotification(identity:Identity,id:string){
 const account=await accountFor(identity);
 const row=(await pool.query(`UPDATE mart_notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND consumer_account_id=$2 RETURNING id,read_at AS "readAt"`,[id,account.id])).rows[0];
 if(!row)throw new MartError('Notification not found.',404,'NOTIFICATION_NOT_FOUND');
 return row;
}

export async function registerPushDevice(identity:Identity,input:{deviceId:string;platform:'IOS'|'ANDROID';pushToken:string}){
 const account=await accountFor(identity);const id=randomUUID();
 await pool.query(`INSERT INTO consumer_push_devices(id,consumer_account_id,device_id,platform,push_token,active,last_seen_at)
  VALUES($1,$2,$3,$4,$5,TRUE,NOW()) ON CONFLICT(consumer_account_id,device_id) DO UPDATE SET platform=EXCLUDED.platform,push_token=EXCLUDED.push_token,active=TRUE,last_seen_at=NOW()`,[id,account.id,input.deviceId,input.platform,input.pushToken]);
 return{registered:true};
}

export async function unregisterPushDevice(identity:Identity,deviceId:string){
 const account=await accountFor(identity);
 await pool.query(`UPDATE consumer_push_devices SET active=FALSE,last_seen_at=NOW() WHERE consumer_account_id=$1 AND device_id=$2`,[account.id,deviceId]);
 return{unregistered:true};
}

export async function businessNotifications(organizationId:string){
 const rows=await pool.query(`SELECT id,type,title,body,data,read_at AS "readAt",created_at AS "createdAt" FROM mart_notifications WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100`,[organizationId]);
 return{notifications:rows.rows,unread:rows.rows.filter(row=>!row.readAt).length};
}

export async function readBusinessNotification(organizationId:string,id:string){
 const row=(await pool.query(`UPDATE mart_notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND organization_id=$2 RETURNING id,read_at AS "readAt"`,[id,organizationId])).rows[0];
 if(!row)throw new MartError('Notification not found.',404,'NOTIFICATION_NOT_FOUND');return row;
}

export async function deliverMartPushNotifications(limit=40){
 const rows=(await pool.query(`SELECT d.id,d.attempt_count,n.title,n.body,n.data,p.push_token
  FROM mart_notification_deliveries d JOIN mart_notifications n ON n.id=d.notification_id JOIN consumer_push_devices p ON p.id=d.push_device_id
  WHERE d.state='PENDING' AND d.next_attempt_at<=NOW() AND p.active ORDER BY d.next_attempt_at LIMIT $1`,[limit])).rows;
 for(const row of rows){
  try{
   const response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({to:row.push_token,title:row.title,body:row.body,data:row.data,sound:'default'}),signal:AbortSignal.timeout(8000)});
   const result=await response.json().catch(()=>null) as {data?:{status?:string;id?:string;message?:string}}|null;
   if(!response.ok||result?.data?.status==='error')throw new Error(result?.data?.message??`Expo push returned ${response.status}`);
   await pool.query(`UPDATE mart_notification_deliveries SET state='SENT',attempt_count=attempt_count+1,provider_reference=$2,sent_at=NOW(),updated_at=NOW() WHERE id=$1`,[row.id,result?.data?.id??null]);
  }catch(error){const attempts=Number(row.attempt_count)+1;await pool.query(`UPDATE mart_notification_deliveries SET state=CASE WHEN $2>=5 THEN 'FAILED' ELSE 'PENDING' END,attempt_count=$2,failure_reason=$3,next_attempt_at=NOW()+make_interval(secs=>LEAST(900,30*(2^LEAST($2,5)))),updated_at=NOW() WHERE id=$1`,[row.id,attempts,error instanceof Error?error.message.slice(0,300):'Push delivery failed']);}
 }
 return rows.length;
}
