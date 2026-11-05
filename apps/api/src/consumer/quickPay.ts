import { pool } from '../db/pool.js';
import type { Identity } from './auth.js';
import { accountFor, FundingError, transaction } from './service.js';
import { vfdAccount } from './providers/vfdProvider.js';
import { vfdConfigured } from './providers/vfdClient.js';
import { hashPassword, secureHash } from '../auth/security.js';
import { createActionChallenge, consumeActionApproval } from './approvals.js';
import { z } from 'zod';

export const offlineAllowanceMinimumKobo = 10_000n;
export const offlineAllowanceMaximumKobo = 2_000_000n;

function parseOfflineLimit(value: unknown): bigint {
  if (value === '0') return 0n;
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value)) throw new FundingError('Enter a valid offline limit.');
  const limit = BigInt(value);
  if (limit < offlineAllowanceMinimumKobo || limit > offlineAllowanceMaximumKobo) {
    throw new FundingError('Choose an offline limit between ₦100 and ₦20,000.');
  }
  return limit;
}

function parseExpiry(value: unknown, enabled: boolean): Date | null {
  if (!enabled || value === null) return null;
  if (typeof value !== 'string') throw new FundingError('Choose when Offline Pay should expire.');
  const expiry = new Date(value);
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) throw new FundingError('Choose a future expiration date.');
  return expiry;
}

function offlinePayload(limit: bigint, expiresAt: Date | null, pin: unknown) {
 if (pin !== undefined && (typeof pin !== 'string' || !/^\d{6}$/.test(pin))) throw new FundingError('Enter your six-digit Offline Pay PIN.');
 return { limitKobo:String(limit), expiresAt:expiresAt?.toISOString()??null, pinChange:typeof pin==='string'?secureHash(`offline-pin-change:v1:${pin}`):null };
}
export async function createOfflineConfigurationChallenge(identity: Identity, raw: unknown) {
 const input = raw && typeof raw === 'object' ? raw as Record<string,unknown> : {};
 const limit = parseOfflineLimit(input.limitKobo), expiresAt = parseExpiry(input.expiresAt,true);
 if (limit===0n) throw new FundingError('Offline Pay can be turned off without an approval.');
 if ((await accountFor(identity)).tier===0) throw new FundingError('Activate Oynk Pay before enabling Offline Pay.',409);
 return createActionChallenge(identity,'OFFLINE_PAY_CONFIGURE',offlinePayload(limit,expiresAt,input.pin));
}

function response(row: Record<string, unknown>) {
  const ledger = BigInt(String(row.ledgerBalanceKobo));
  const expiresAt = row.offlineExpiresAt ? new Date(String(row.offlineExpiresAt)) : null;
  const expired = row.offlineEnabled === true && expiresAt !== null && expiresAt.getTime() <= Date.now();
  const enabled = row.offlineEnabled === true && !expired;
  const limit = row.offlineEnabled === true ? BigInt(String(row.offlineLimitKobo)) : 0n;
  const spent = row.offlineEnabled === true ? BigInt(String(row.offlineSpentKobo)) : 0n;
  const remaining = limit > spent ? limit - spent : 0n;
  const offlineAvailable = remaining > ledger ? ledger : remaining;
  return {
    currency: 'NGN',
    balanceKobo: String(ledger),
    ledgerBalanceKobo: String(ledger),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
    available: true,
    offline: {
      enabled,
      status: expired ? 'expired' : enabled ? 'active' : 'disabled',
      limitKobo: String(limit),
      spentKobo: String(spent),
      availableKobo: String(enabled ? offlineAvailable : 0n),
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  };
}

/**
 * Quick Pay presents the balance held in the consumer's dedicated VFD account.
 * The Oynk ledger is an indexed audit/cache layer and is reconciled from VFD;
 * the mobile client never invents or owns the authoritative naira balance.
 */
export async function quickPayBalance(identity: Identity) {
  const account = await accountFor(identity);
  let result = await pool.query(`
    SELECT COALESCE(q.balance_kobo, 0)::text AS "ledgerBalanceKobo",
           COALESCE(q.offline_limit_kobo, 0)::text AS "offlineLimitKobo",
           COALESCE((SELECT SUM(t.amount_kobo) FROM terminal_payments t
              WHERE t.consumer_account_id=a.id AND t.state='COMPLETED'
                AND t.completed_at>NOW()-INTERVAL '24 hours'), 0)::text AS "offlineSpentKobo",
           COALESCE(q.offline_enabled, FALSE) AS "offlineEnabled",
           q.offline_expires_at AS "offlineExpiresAt",
           COALESCE(q.updated_at, a.created_at) AS "updatedAt",
           d.account_number AS "providerAccountNumber"
      FROM consumer_accounts a
      LEFT JOIN consumer_quick_pay_accounts q ON q.account_id = a.id
      LEFT JOIN consumer_quick_pay_deposit_accounts d ON d.account_id=a.id AND d.provider='VFD' AND d.status='ACTIVE'
     WHERE a.id = $1
  `, [account.id]);
  let row = result.rows[0];
  if (!row) throw new Error('Quick Pay account not found');
  let providerBalanceStatus:'current'|'unavailable'|'not_linked'=row.providerAccountNumber?'unavailable':'not_linked';
  if(vfdConfigured&&row.providerAccountNumber){
    try{
      const provider=await vfdAccount(row.providerAccountNumber);
      await pool.query(`INSERT INTO consumer_quick_pay_accounts(account_id,balance_kobo) VALUES($1,$2)
        ON CONFLICT(account_id) DO UPDATE SET balance_kobo=$2,updated_at=NOW()`,[account.id,String(provider.balanceMinor)]);
      row={...row,ledgerBalanceKobo:String(provider.balanceMinor),updatedAt:new Date()};providerBalanceStatus='current';
    }catch(error){console.warn('[vfd/balance-reconciliation]',{accountId:account.id,code:error instanceof Error?error.message:'UNKNOWN'});}
  }
  return {...response(row),providerBalanceStatus};
}

export async function configureOfflineAllowance(identity: Identity, raw: unknown) {
  const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const rawLimit = input.limitKobo;
  const limit = parseOfflineLimit(rawLimit);
  const expiresAt = parseExpiry(input.expiresAt, limit > 0n);
  const pin = input.pin;
  if (pin !== undefined && (typeof pin !== 'string' || !/^\d{6}$/.test(pin))) throw new FundingError('Enter your six-digit Offline Pay PIN.');
  const challengeId = limit > 0n ? z.string().uuid().safeParse(input.challengeId) : null;
  if (limit > 0n && !challengeId?.success) throw new FundingError('Approve this Offline Pay change again.', 409);
  const pinHash = limit > 0n && typeof pin === 'string' ? await hashPassword(pin) : null;
  return transaction(async db => {
    const account = await accountFor(identity, db, true);
    if(account.tier===0&&limit>0n)throw new FundingError('Activate Oynk Pay before enabling Offline Pay.',409);
    if(limit>0n){
      await consumeActionApproval(db,identity,'OFFLINE_PAY_CONFIGURE',offlinePayload(limit,expiresAt,pin),input);
    }
    await db.query(`INSERT INTO consumer_quick_pay_accounts(account_id) VALUES($1) ON CONFLICT(account_id) DO NOTHING`, [account.id]);
    const current = await db.query(`
      SELECT balance_kobo, offline_limit_kobo, offline_spent_kobo,
             offline_signer_address, offline_public_key_hex, offline_pin_hash
        FROM consumer_quick_pay_accounts WHERE account_id=$1 FOR UPDATE
    `, [account.id]);
    const row = current.rows[0];
    if(limit>0n&&!pinHash&&!row.offline_pin_hash)throw new FundingError('Create a six-digit Offline Pay PIN.');
    const signerAddress = row.offline_signer_address;
    const publicKeyHex = row.offline_public_key_hex;
    const updated = await db.query(`
      UPDATE consumer_quick_pay_accounts
         SET offline_limit_kobo=$2,
             offline_spent_kobo=0,
             offline_enabled=$2::bigint>0,
             offline_expires_at=$5,
             offline_pin_hash=CASE WHEN $2::bigint=0 THEN NULL ELSE COALESCE($6,offline_pin_hash) END,
             offline_policy_version=offline_policy_version+1,
             offline_pin_failures=0,
             offline_pin_locked_until=NULL,
             offline_signer_address=COALESCE($3, offline_signer_address),
             offline_public_key_hex=COALESCE($4, offline_public_key_hex),
             offline_updated_at=NOW(), updated_at=NOW()
       WHERE account_id=$1
       RETURNING balance_kobo::text AS "ledgerBalanceKobo",
                 offline_limit_kobo::text AS "offlineLimitKobo",
                 offline_spent_kobo::text AS "offlineSpentKobo",
                 offline_enabled AS "offlineEnabled",
                 offline_expires_at AS "offlineExpiresAt", updated_at AS "updatedAt"
    `, [account.id, limit.toString(), signerAddress ?? null, publicKeyHex ?? null, expiresAt, pinHash]);
    return response(updated.rows[0]);
  });
}
