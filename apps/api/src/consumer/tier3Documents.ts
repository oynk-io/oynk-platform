import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import type { Identity } from './auth.js';
import { accountFor, FundingError, transaction } from './service.js';
import { VfdError, vfdConfigured, vfdEnvironment, vfdKycRequest } from './providers/vfdClient.js';

const maxBytes=4*1024*1024;
const image=z.string().max(5_600_000);
const input=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('IDENTITY'),identityType:z.enum(['NIN','National ID','Driver License','International Passport']),base64Image:image,consent:z.literal(true)}).strict(),
 z.object({kind:z.literal('ADDRESS'),base64Image:image,consent:z.literal(true)}).strict(),
]);
type DocumentInput=z.infer<typeof input>;

export function parseTier3Document(raw:unknown){
 const parsed=input.safeParse(raw);
 if(!parsed.success)throw new FundingError('Choose a valid ID or utility-bill image.');
 const match=/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(parsed.data.base64Image);
 if(!match)throw new FundingError('Choose a JPG or PNG image.');
 const bytes=Buffer.from(match[2],'base64');
 const jpeg=bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[bytes.length-2]===0xff&&bytes[bytes.length-1]===0xd9;
 const png=bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(!bytes.length||bytes.length>maxBytes||!((match[1]==='jpeg'&&jpeg)||(match[1]==='png'&&png))||bytes.toString('base64')!==match[2])throw new FundingError('Choose a JPG or PNG image smaller than 4 MB.');
 return{document:parsed.data,sha256:createHash('sha256').update(bytes).digest('hex')};
}

export function tier3ProviderBody(accountNo:string,document:DocumentInput){
 if(document.kind==='ADDRESS')return{accountNo,documentType:'utilityBill',utilityBill:{base64Image:document.base64Image}};
 return{accountNo,documentType:'identityDocuments',identityDocuments:[{identityType:document.identityType,frontImage:{base64Image:document.base64Image}}]};
}

// VFD's documented uploadResults rows carry SUCCESS/FAILED. Their documentType
// value can vary, so decide from each row's status rather than its type.
export function documentUploadOutcome(result:Record<string,unknown>):'confirmed'|'rejected'|'unknown'{
 const data=result.data&&typeof result.data==='object'&&!Array.isArray(result.data)?result.data as Record<string,unknown>:{};
 const rows=Array.isArray(data.uploadResults)?data.uploadResults:Array.isArray(result.uploadResults)?result.uploadResults:null;
 if(rows){
  if(rows.length===0||rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)))return'unknown';
  const statuses=rows.map(row=>String((row as {status?:unknown}).status??'').trim().toUpperCase());
  if(statuses.some(value=>/(?:FAIL|REJECT|INVALID|ERROR|UNSUCCESSFUL)/.test(value)))return'rejected';
  if(statuses.every(value=>value==='SUCCESS'||value==='UPLOADED'))return result.status==='00'?'confirmed':'unknown';
  return'unknown';
 }
 const messages=[result.message,data.message,data.status].filter(value=>typeof value==='string').map(String);
 if(messages.some(value=>/(?:fail|reject|invalid|error)/i.test(value)))return'rejected';
 return result.status==='00'&&messages.some(value=>/(?:success|uploaded)/i.test(value))?'confirmed':'unknown';
}

async function eligibleAccount(identity:Identity){
 const account=await accountFor(identity);
 if(account.tier!==2)throw new FundingError('Complete Tier 2 before uploading Tier 3 documents.',409);
 if(!vfdConfigured)throw new FundingError('Document verification is being configured.',503);
 if((vfdEnvironment==='live')!==(identity.network==='PUBLIC'))throw new FundingError('The banking environment does not match this account.',409);
 const [deposit,verification]=await Promise.all([
  pool.query(`SELECT account_number FROM consumer_quick_pay_deposit_accounts WHERE account_id=$1 AND provider='VFD' AND status='ACTIVE'`,[account.id]),
  pool.query('SELECT provider_tier,nin_fingerprint,bvn_fingerprint FROM consumer_fiat_verifications WHERE account_id=$1',[account.id]),
 ]);
 if(!deposit.rows[0]?.account_number||verification.rows[0]?.provider_tier!==2||!verification.rows[0]?.nin_fingerprint||!verification.rows[0]?.bvn_fingerprint)throw new FundingError('Your Tier 2 verification needs review.',409);
 return{accountId:account.id,accountNo:String(deposit.rows[0].account_number)};
}

export async function tier3DocumentStatus(identity:Identity){
 const account=await accountFor(identity);
 const [rows,upgrade]=await Promise.all([
  pool.query('SELECT kind,document_type AS "documentType",status,uploaded_at AS "uploadedAt" FROM consumer_fiat_tier_documents WHERE account_id=$1',[account.id]),
  pool.query('SELECT status,updated_at AS "updatedAt" FROM consumer_fiat_tier_upgrades WHERE account_id=$1 AND target_tier=3',[account.id]),
 ]);
 return{documents:rows.rows,upgrade:{status:upgrade.rows[0]?.status??null,updatedAt:upgrade.rows[0]?.updatedAt??null}};
}

export async function uploadTier3Document(identity:Identity,raw:unknown){
 const {document,sha256}=parseTier3Document(raw);
 const {accountId,accountNo}=await eligibleAccount(identity);
 const documentType=document.kind==='IDENTITY'?document.identityType:'utilityBill';
 const claim=await transaction(async db=>{
  const upgrade=(await db.query('SELECT status FROM consumer_fiat_tier_upgrades WHERE account_id=$1 AND target_tier=3 FOR UPDATE',[accountId])).rows[0];
  if(upgrade&&['PROCESSING','PENDING_REVIEW','UNKNOWN','PROVIDER_CONFIRMED','COMPLETED'].includes(upgrade.status))throw new FundingError('Your Tier 3 upgrade is already being checked. Contact support if it does not update.',409);
  const current=(await db.query('SELECT status,content_sha256 FROM consumer_fiat_tier_documents WHERE account_id=$1 AND kind=$2 FOR UPDATE',[accountId,document.kind])).rows[0];
  if(current?.status==='UPLOADED'&&current.content_sha256===sha256)return false;
  if(current?.status==='PROCESSING'||current?.status==='UNKNOWN')throw new FundingError('We are checking this document upload. Contact support before trying again.',409);
  await db.query(`INSERT INTO consumer_fiat_tier_documents(account_id,kind,document_type,content_sha256,status) VALUES($1,$2,$3,$4,'PROCESSING')
   ON CONFLICT(account_id,kind) DO UPDATE SET document_type=EXCLUDED.document_type,content_sha256=EXCLUDED.content_sha256,status='PROCESSING',provider_error_code=NULL,uploaded_at=NULL,updated_at=NOW()`,[accountId,document.kind,documentType,sha256]);
  await db.query(`INSERT INTO consumer_fiat_tier_document_events(id,account_id,kind,content_sha256,status) VALUES($1,$2,$3,$4,'PROCESSING')`,[randomUUID(),accountId,document.kind,sha256]);
  return true;
 });
 if(!claim)return tier3DocumentStatus(identity);
 let status:'UPLOADED'|'FAILED'|'UNKNOWN'='UNKNOWN';let errorCode:string|null=null;
 try{
  const result=await vfdKycRequest('/bulk-upload/kyc-bundle',{method:'POST',body:tier3ProviderBody(accountNo,document),timeoutMs:55_000});
  const outcome=documentUploadOutcome(result);
  if(outcome!=='confirmed'){
   const data=result.data&&typeof result.data==='object'&&!Array.isArray(result.data)?result.data as Record<string,unknown>:{};
   const rows=Array.isArray(data.uploadResults)?data.uploadResults:[];
   const rowStatuses=rows.map(row=>{
    const value=row&&typeof row==='object'&&!Array.isArray(row)?String((row as {status?:unknown}).status??''):'';
    return /^[A-Za-z_]{1,24}$/.test(value)?value.toUpperCase():'UNRECOGNIZED';
   });
   console.warn('[vfd/kyc-upload] upload not confirmed',{kind:document.kind,outcome,responseKeys:Object.keys(result).sort(),dataKeys:Object.keys(data).sort(),rowStatuses});
   throw new VfdError(outcome==='rejected'?'rejected':'unavailable',outcome==='rejected'?'VFD_DOCUMENT_REJECTED':'VFD_DOCUMENT_UNCONFIRMED');
  }
  status='UPLOADED';
 }catch(error){
  errorCode=error instanceof VfdError?error.code:'VFD_DOCUMENT_UNEXPECTED';
  status=error instanceof VfdError&&error.kind!=='unavailable'?'FAILED':'UNKNOWN';
 }
 await transaction(async db=>{
  await db.query('UPDATE consumer_fiat_tier_documents SET status=$4,provider_error_code=$5,uploaded_at=CASE WHEN $4=\'UPLOADED\' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE account_id=$1 AND kind=$2 AND content_sha256=$3',[accountId,document.kind,sha256,status,errorCode]);
  await db.query('INSERT INTO consumer_fiat_tier_document_events(id,account_id,kind,content_sha256,status,provider_error_code) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),accountId,document.kind,sha256,status,errorCode]);
 });
 if(status!=='UPLOADED')throw new FundingError(status==='UNKNOWN'?'We could not confirm the document upload. Contact support before trying again.':'VFD could not accept that document. Choose a clear image and try again.',status==='UNKNOWN'?503:400);
 return tier3DocumentStatus(identity);
}

export async function requireTier3Documents(accountId:string,db:Pick<PoolClient,'query'>=pool){
 const result=await db.query(`SELECT kind FROM consumer_fiat_tier_documents WHERE account_id=$1 AND status='UPLOADED' AND kind IN ('IDENTITY','ADDRESS') FOR SHARE`,[accountId]);
 if(new Set(result.rows.map(row=>row.kind)).size!==2)throw new FundingError('Upload your ID and a utility bill before unlocking Tier 3.',409);
}
