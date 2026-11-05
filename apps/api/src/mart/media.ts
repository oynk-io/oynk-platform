import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { MartError } from './service.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const mediaPath = '/api/mart/media/';
const mediaTypes: Record<string, string> = {'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'};

export async function normalizePhoto(input: Buffer, contentType: string) {
 if (!mediaTypes[contentType] || !input.length || input.length > MAX_PHOTO_BYTES)
  throw new MartError('Choose a JPG, PNG or WebP photo up to 5 MB.',400,'INVALID_PHOTO');
 try {
  const image = sharp(input,{limitInputPixels:40_000_000,failOn:'warning'});
  const metadata = await image.metadata();
  if (metadata.format !== mediaTypes[contentType] || (metadata.pages ?? 1) !== 1)
   throw new Error('Invalid photo format');
  // Auto-orient, resize and re-encode; no EXIF, location or other metadata survives.
  const content = await image.rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();
  if (content.length > 2 * 1024 * 1024) throw new Error('Photo is too large');
  return {content,sha256:createHash('sha256').update(content).digest('hex')};
 } catch {
  throw new MartError('This photo could not be opened. Choose a clear JPG, PNG or WebP image.',400,'INVALID_PHOTO');
 }
}

export async function savePhoto(organizationId:string,userId:string,input:Buffer,contentType:string) {
 const base = new URL(config.API_PUBLIC_URL);
 if (base.protocol !== 'https:') throw new MartError('Photo uploads need a secure public API URL. Contact support.',503,'MEDIA_NOT_CONFIGURED');
 const {content,sha256} = await normalizePhoto(input,contentType);
 const db = await pool.connect();
 try {
  await db.query('BEGIN');
  // Serialize quota checks, including concurrent uploads, within this organization.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`mart-media:${organizationId}`]);
  const existing = await db.query('SELECT id,public_url AS url FROM mart_media WHERE organization_id=$1 AND content_sha256=$2',[organizationId,sha256]);
  if (existing.rows[0]) {await db.query('COMMIT');return existing.rows[0] as {id:string;url:string};}
  const usage = await db.query(`SELECT COALESCE(SUM(byte_size),0)::bigint AS bytes, COUNT(*) FILTER(WHERE created_at>NOW()-INTERVAL '1 hour')::integer AS recent FROM mart_media WHERE organization_id=$1`,[organizationId]);
  if (Number(usage.rows[0].bytes)+content.length>200*1024*1024 || usage.rows[0].recent>=60)
   throw new MartError('Photo upload limit reached. Please try again later or contact support.',429,'MEDIA_LIMIT');
  const id=randomUUID(),url=new URL(`${mediaPath}${id}`,base).toString();
  await db.query(`INSERT INTO mart_media(id,organization_id,content_sha256,content_type,byte_size,content,public_url,created_by) VALUES($1,$2,$3,'image/webp',$4,$5,$6,$7)`,[id,organizationId,sha256,content.length,content,url,userId]);
  await db.query('COMMIT');
  return {id,url};
 } catch(error) {await db.query('ROLLBACK');throw error;} finally {db.release();}
}

export async function validatePhotoOwnership(organizationId:string,urls:string[]) {
 // External HTTPS URLs can arrive from inventory connectors. Oynk-hosted photos
 // must belong to this business; never attach another merchant's private upload.
 const ids=urls.flatMap(url=>{const path=new URL(url).pathname;return path.startsWith(mediaPath)?[path.slice(mediaPath.length)]:[];});
 if (!ids.length) return;
 if (ids.some(id=>!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(id))) throw new MartError('Choose photos uploaded by this business.',400,'INVALID_PHOTO');
 const rows=await pool.query('SELECT public_url FROM mart_media WHERE organization_id=$1 AND id=ANY($2::uuid[])',[organizationId,ids]);
 const owned=new Set(rows.rows.map(row=>row.public_url));
 if(urls.some(url=>new URL(url).pathname.startsWith(mediaPath)&&!owned.has(url)))
  throw new MartError('Choose photos uploaded by this business.',403,'PHOTO_NOT_OWNED');
}

export async function readPhoto(id:string,ownerId?:string) {
 const result=await pool.query(`SELECT m.content,m.content_type,m.content_sha256 FROM mart_media m WHERE m.id=$1 AND (m.organization_id=$2::uuid OR EXISTS (
  SELECT 1 FROM mart_items i JOIN mart_connections c ON c.id=i.connection_id JOIN mart_storefronts s ON s.organization_id=i.organization_id JOIN organizations o ON o.id=i.organization_id
  WHERE i.organization_id=m.organization_id AND i.image_urls @> jsonb_build_array(m.public_url) AND i.published AND i.source_active AND c.status='ACTIVE' AND s.status='PUBLISHED' AND o.status='ACTIVE'
 ) OR EXISTS (
  SELECT 1 FROM mart_storefronts s JOIN organizations o ON o.id=s.organization_id
  WHERE s.organization_id=m.organization_id AND s.image_url=m.public_url AND s.status='PUBLISHED' AND o.status='ACTIVE'
  AND EXISTS (SELECT 1 FROM mart_items i JOIN mart_connections c ON c.id=i.connection_id
   WHERE i.organization_id=s.organization_id AND c.status='ACTIVE' AND i.published AND i.source_active AND i.availability='IN_STOCK' AND i.last_synced_at>NOW()-INTERVAL '24 hours')
 ))`,[id,ownerId??null]);
 if(!result.rows[0]) throw new MartError('Photo not found.',404,'PHOTO_NOT_FOUND');
 return result.rows[0] as {content:Buffer;content_type:string;content_sha256:string};
}
