import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';

export class BusinessManagementError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

async function audit(db: PoolClient, input: { id: string; userId: string; event: string; state: string; previousState?: string; note?: string; metadata?: Record<string, unknown> }) {
  await db.query(`INSERT INTO business_application_events(organization_id,event_type,from_status,to_status,actor_user_id,note,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)`, [input.id,input.event,input.previousState ?? input.state,input.state,input.userId,input.note ?? null,input.metadata ?? {}]);
  await db.query(`INSERT INTO audit_logs(id,actor_user_id,organization_id,action,resource_type,resource_id,result,metadata) VALUES($1,$2,$3::uuid,$4,'BUSINESS',$3::text,'SUCCESS',$5)`, [randomUUID(),input.userId,input.id,input.event,{ previousState: input.previousState ?? input.state, state: input.state, note: input.note ?? null, ...input.metadata }]);
}

export async function changeBusinessActivation(id: string, userId: string, action: 'activate' | 'deactivate' | 'reactivate', reason: string) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query(`SELECT o.status,o.activated_at,f.provisioning_state,f.vfd_account_number,f.smart_account_address,f.crypto_usdc_ready
      FROM organizations o LEFT JOIN business_financial_accounts f ON f.organization_id=o.id
      WHERE o.id=$1 AND o.type='BUSINESS' FOR UPDATE OF o`, [id]);
    const business = result.rows[0];
    if (!business) throw new BusinessManagementError('This business could not be found.',404,'BUSINESS_NOT_FOUND');
    const expected = action === 'deactivate' ? 'ACTIVE' : action === 'reactivate' ? 'SUSPENDED' : 'APPROVED';
    if (business.status !== expected || (action === 'reactivate' && !business.activated_at)) {
      throw new BusinessManagementError('This action is not available in the business’s current state. Refresh and try again.',409,'INVALID_STATE');
    }
    if (action !== 'deactivate' && (business.provisioning_state !== 'READY' || !business.vfd_account_number || !business.smart_account_address || !business.crypto_usdc_ready)) {
      throw new BusinessManagementError('The bank and verified USDC accounts must be ready before activation.',409,'PROVISIONING_INCOMPLETE');
    }
    const status = action === 'deactivate' ? 'SUSPENDED' : 'ACTIVE';
    // An older ACTIVE record may lack its original activation timestamp. Its
    // valid deactivation still establishes that it is eligible to reactivate.
    await db.query(`UPDATE organizations SET status=$2,activated_at=COALESCE(activated_at,NOW()),updated_at=NOW() WHERE id=$1`, [id,status]);
    await audit(db,{id,userId,event:action === 'deactivate' ? 'BUSINESS_DEACTIVATED' : action === 'reactivate' ? 'BUSINESS_REACTIVATED' : 'BUSINESS_ACTIVATED',state:status,previousState:business.status,note:reason});
    await db.query('COMMIT');
    return { id,status };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}

export async function decideBusinessApplication(id: string, userId: string, action: 'approve' | 'reject', note?: string) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query(`SELECT status FROM organizations WHERE id=$1 AND type='BUSINESS' FOR UPDATE`, [id]);
    const business = result.rows[0];
    if (!business) throw new BusinessManagementError('This business could not be found.',404,'BUSINESS_NOT_FOUND');
    const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    if (business.status !== status) {
      if (!['COMPLIANCE_SUBMITTED','UNDER_REVIEW','ADDITIONAL_INFORMATION_REQUIRED'].includes(business.status)) {
        throw new BusinessManagementError('This application is not ready for a review decision.',409,'INVALID_STATE');
      }
      await db.query(`UPDATE organizations SET status=$2,updated_at=NOW() WHERE id=$1`, [id,status]);
      if (action === 'approve') await db.query(`INSERT INTO business_financial_accounts(organization_id,provisioning_state,provision_idempotency_key) VALUES($1,'PENDING',$2) ON CONFLICT(organization_id) DO NOTHING`, [id,`business-provision:${id}`]);
      await audit(db,{id,userId,event:action === 'approve' ? 'APPLICATION_APPROVED' : 'APPLICATION_REJECTED',state:status,previousState:business.status,note});
    }
    const accounts = await db.query(`SELECT provisioning_state FROM business_financial_accounts WHERE organization_id=$1`, [id]);
    await db.query('COMMIT');
    return {id,status,provisioningState:accounts.rows[0]?.provisioning_state ?? null};
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}

export async function requestBusinessInformation(id: string, userId: string, requestId: string, note: string) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`business-information:${requestId}`]);
    const org = await db.query(`SELECT status FROM organizations WHERE id=$1 AND type='BUSINESS' FOR UPDATE`,[id]);
    if (!org.rows[0]) throw new BusinessManagementError('This business could not be found.',404,'BUSINESS_NOT_FOUND');
    if (org.rows[0].status === 'CLOSED') throw new BusinessManagementError('A closed business cannot receive a new information request.',409,'INVALID_STATE');
    const previous = await db.query(`SELECT organization_id,note FROM business_information_requests WHERE id=$1`,[requestId]);
    if (previous.rows[0]) {
      if (previous.rows[0].organization_id !== id || previous.rows[0].note !== note) throw new BusinessManagementError('This request identifier has already been used.',409,'IDEMPOTENCY_CONFLICT');
      await db.query('COMMIT'); return { id:requestId,created:false };
    }
    await db.query(`INSERT INTO business_information_requests(id,organization_id,requested_by,note) VALUES($1,$2,$3,$4)`,[requestId,id,userId,note]);
    await audit(db,{id,userId,event:'INFORMATION_REQUESTED',state:org.rows[0].status,note,metadata:{requestId}});
    await db.query('COMMIT');
    return { id:requestId,created:true };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}

export async function businessInformationRequests(id: string) {
  const result = await pool.query(`SELECT id,note,state,response,resolution_note AS "resolutionNote",created_at AS "createdAt",responded_at AS "respondedAt",resolved_at AS "resolvedAt"
    FROM business_information_requests WHERE organization_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[id]);
  return result.rows;
}

export async function respondToBusinessInformation(organizationId: string, requestId: string, userId: string, response: string) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query(`SELECT r.*,o.status AS business_status FROM business_information_requests r JOIN organizations o ON o.id=r.organization_id
      WHERE r.id=$1 AND r.organization_id=$2 AND o.type='BUSINESS' FOR UPDATE OF r`,[requestId,organizationId]);
    const request = result.rows[0];
    if (!request) throw new BusinessManagementError('This information request could not be found.',404,'REQUEST_NOT_FOUND');
    if (request.state === 'RESPONDED' && request.response === response) { await db.query('COMMIT'); return {id:requestId,state:'RESPONDED'}; }
    if (request.state !== 'OPEN') throw new BusinessManagementError('This information request is no longer awaiting a response.',409,'INVALID_STATE');
    await db.query(`UPDATE business_information_requests SET state='RESPONDED',response=$2,responded_by=$3,responded_at=NOW() WHERE id=$1`,[requestId,response,userId]);
    await audit(db,{id:organizationId,userId,event:'INFORMATION_RESPONSE_SUBMITTED',state:request.business_status,metadata:{requestId}});
    await db.query('COMMIT');
    return {id:requestId,state:'RESPONDED'};
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}

export async function resolveBusinessInformation(organizationId: string, requestId: string, userId: string, note: string) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await db.query(`SELECT r.*,o.status AS business_status FROM business_information_requests r JOIN organizations o ON o.id=r.organization_id
      WHERE r.id=$1 AND r.organization_id=$2 AND o.type='BUSINESS' FOR UPDATE OF r`,[requestId,organizationId]);
    const request = result.rows[0];
    if (!request) throw new BusinessManagementError('This information request could not be found.',404,'REQUEST_NOT_FOUND');
    if (request.state === 'RESOLVED') { await db.query('COMMIT'); return {id:requestId,state:'RESOLVED'}; }
    await db.query(`UPDATE business_information_requests SET state='RESOLVED',resolution_note=$2,resolved_by=$3,resolved_at=NOW() WHERE id=$1`,[requestId,note,userId]);
    await audit(db,{id:organizationId,userId,event:'INFORMATION_REQUEST_RESOLVED',state:request.business_status,note,metadata:{requestId}});
    await db.query('COMMIT');
    return {id:requestId,state:'RESOLVED'};
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
