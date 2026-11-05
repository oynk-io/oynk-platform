import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import type { Identity } from './auth.js';

export class HandleError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

const handlePattern = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$/;
const reserved = new Set([
  'admin', 'administrator', 'api', 'billing', 'help', 'legal', 'oynk',
  'payments', 'privacy', 'security', 'support', 'system', 'terms', 'wallet',
]);

export function normalizeHandle(value: unknown): string {
  if (typeof value !== 'string') throw new HandleError('Choose a valid Oynk handle.', 400);
  const handle = value.trim().toLowerCase();
  if (!handlePattern.test(handle) || reserved.has(handle)) {
    throw new HandleError('Use 3–30 letters, numbers, underscores or hyphens. Start and end with a letter or number.', 400);
  }
  return handle;
}

async function verifiedChallenge(db: Pick<PoolClient, 'query'>, challengeId: string, lock = false) {
  const result = await db.query(
    `SELECT id FROM consumer_phone_challenges
     WHERE id=$1 AND consumed_at IS NOT NULL AND invalidated_at IS NULL AND expires_at > NOW()
     ${lock ? 'FOR UPDATE' : ''}`,
    [challengeId],
  );
  if (!result.rows[0]) throw new HandleError('Your verification expired. Verify your phone number again.', 401);
}

export async function checkHandleAvailability(challengeValue: unknown, handleValue: unknown) {
  const challenge = z.string().uuid().safeParse(challengeValue);
  if (!challenge.success) throw new HandleError('Verify your phone number before choosing a handle.', 401);
  const handle = normalizeHandle(handleValue);
  await verifiedChallenge(pool, challenge.data);
  const result = await pool.query(
    `SELECT EXISTS(
       SELECT 1 FROM consumer_handles WHERE handle=$1
       UNION ALL
       SELECT 1 FROM consumer_handle_reservations
       WHERE handle=$1 AND challenge_id<>$2 AND expires_at>NOW()
     ) AS unavailable`,
    [handle, challenge.data],
  );
  return { available: result.rows[0]?.unavailable !== true, handle };
}

export async function reserveHandle(challengeValue: unknown, handleValue: unknown) {
  const challenge = z.string().uuid().safeParse(challengeValue);
  if (!challenge.success) throw new HandleError('Verify your phone number before choosing a handle.', 401);
  const handle = normalizeHandle(handleValue);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await verifiedChallenge(db, challenge.data, true);
    await db.query('DELETE FROM consumer_handle_reservations WHERE expires_at <= NOW()');
    if ((await db.query('SELECT 1 FROM consumer_handles WHERE handle=$1', [handle])).rows[0]) {
      throw new HandleError('That Oynk handle is already taken.', 409);
    }
    const current = await db.query<{ handle: string }>(
      'SELECT handle FROM consumer_handle_reservations WHERE challenge_id=$1 FOR UPDATE',
      [challenge.data],
    );
    if (current.rows[0]?.handle === handle) {
      await db.query('COMMIT');
      return { available: true, handle };
    }
    if (current.rows[0]) await db.query('DELETE FROM consumer_handle_reservations WHERE challenge_id=$1', [challenge.data]);
    try {
      await db.query(
        `INSERT INTO consumer_handle_reservations(handle,challenge_id,expires_at)
         VALUES($1,$2,NOW()+INTERVAL '5 minutes')`,
        [handle, challenge.data],
      );
    } catch (error: any) {
      if (error?.code === '23505') throw new HandleError('That Oynk handle is already taken.', 409);
      throw error;
    }
    await db.query('COMMIT');
    return { available: true, handle };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export async function claimHandle(
  db: Pick<PoolClient, 'query'>,
  challengeId: string,
  accountId: string,
  handleValue: unknown,
  trustedProjectHandle?: string,
): Promise<string | null> {
  if (handleValue === undefined && !trustedProjectHandle) return null;
  const handle = normalizeHandle(handleValue ?? trustedProjectHandle);
  const owned = await db.query<{ handle: string }>('SELECT handle FROM consumer_handles WHERE account_id=$1 FOR UPDATE', [accountId]);
  if (owned.rows[0]) {
    if (owned.rows[0].handle !== handle) throw new HandleError('This account already has a different Oynk handle.', 409);
    return handle;
  }
  const trusted = trustedProjectHandle === handle;
  if (!trusted) {
    const reservation = await db.query(
      `SELECT 1 FROM consumer_handle_reservations
       WHERE handle=$1 AND challenge_id=$2 AND expires_at > NOW() FOR UPDATE`,
      [handle, challengeId],
    );
    if (!reservation.rows[0]) throw new HandleError('That handle reservation expired. Choose your handle again.', 409);
  }
  try {
    await db.query('INSERT INTO consumer_handles(handle,account_id) VALUES($1,$2)', [handle, accountId]);
  } catch (error: any) {
    if (error?.code === '23505') throw new HandleError('That Oynk handle is already taken.', 409);
    throw error;
  }
  await db.query('DELETE FROM consumer_handle_reservations WHERE challenge_id=$1', [challengeId]);
  return handle;
}

export async function handleForIdentity(identity: Identity) {
  const result = await pool.query<{ handle: string; wallet: string; network: string }>(
    `SELECT h.handle,a.wallet,a.network
     FROM consumer_handles h JOIN consumer_accounts a ON a.id=h.account_id
     WHERE a.subject=$1 AND a.client_id=$2 AND a.network=$3 AND a.wallet=$4
     LIMIT 1`,
    [identity.subject, identity.clientId, identity.network, identity.wallet],
  );
  const row = result.rows[0];
  if (!row) throw new HandleError('Set up your Oynk handle before receiving handle payments.', 404);
  return { handle: row.handle, wallet: row.wallet, network: row.network };
}

export async function resolveHandle(identity: Identity, handleValue: unknown) {
  const handle = normalizeHandle(handleValue);
  const result = await pool.query<{ handle: string; wallet: string; network: string }>(
    `SELECT h.handle,a.wallet,a.network
     FROM consumer_handles h JOIN consumer_accounts a ON a.id=h.account_id
     WHERE h.handle=$1 AND a.client_id=$2 AND a.network=$3
     LIMIT 1`,
    [handle, identity.clientId, identity.network],
  );
  const row = result.rows[0];
  if (!row) throw new HandleError('This Oynk handle could not be found.', 404);
  return { handle: row.handle, wallet: row.wallet, network: row.network };
}
