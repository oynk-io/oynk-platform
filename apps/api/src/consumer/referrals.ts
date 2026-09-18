import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import type { Identity } from './auth.js';
import { accountFor, transaction } from './service.js';
import { config } from '../config.js';

const CAMPAIGN_KEY = 'evergreen-referral-v1';
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LENGTH = 10;

export class ReferralError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function normalizeReferralCode(value: unknown): string {
  if (typeof value !== 'string') throw new ReferralError('Enter a valid invite code.');
  const normalized = value.trim().toUpperCase();
  if (!new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(normalized)) throw new ReferralError('This invite link is not valid.', 404);
  return normalized;
}

export function referralCodeHash(code: string): string {
  return createHash('sha256').update(`oynk:referral:v1:${normalizeReferralCode(code)}`).digest('hex');
}

export function generateReferralCode(bytes = randomBytes): string {
  // Rejection sampling prevents modulo bias because 224 is divisible by 32.
  let value = '';
  while (value.length < CODE_LENGTH) {
    for (const byte of bytes(16)) {
      if (byte >= 224) continue;
      value += ALPHABET[byte % ALPHABET.length];
      if (value.length === CODE_LENGTH) break;
    }
  }
  return value;
}

function publicLink(code: string): string {
  const base = new URL(config.REFERRAL_PUBLIC_URL);
  base.pathname = `/${code}`;
  base.search = '';
  base.hash = '';
  return base.toString().replace(/\/$/, '');
}

async function createCode(ownerAccountId: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateReferralCode();
    try {
      const result = await pool.query<{ code: string }>(
        `INSERT INTO consumer_referral_codes(id,campaign_key,code,code_hash,owner_account_id)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(campaign_key,owner_account_id) DO UPDATE SET owner_account_id=EXCLUDED.owner_account_id
         RETURNING code`,
        [randomUUID(), CAMPAIGN_KEY, code, referralCodeHash(code), ownerAccountId],
      );
      return result.rows[0].code;
    } catch (error) {
      if ((error as { code?: string }).code !== '23505') throw error;
      const existing = await pool.query<{ code: string }>(
        'SELECT code FROM consumer_referral_codes WHERE campaign_key=$1 AND owner_account_id=$2',
        [CAMPAIGN_KEY, ownerAccountId],
      );
      if (existing.rows[0]) return existing.rows[0].code;
    }
  }
  throw new ReferralError('Your invite link could not be created. Please try again.', 503);
}

export async function referralSummary(identity: Identity) {
  const account = await accountFor(identity);
  let codeResult = await pool.query<{ code: string }>(
    `SELECT code FROM consumer_referral_codes
     WHERE campaign_key=$1 AND owner_account_id=$2 AND active=TRUE
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [CAMPAIGN_KEY, account.id],
  );
  if (!codeResult.rows[0]) {
    await createCode(account.id);
    codeResult = await pool.query<{ code: string }>(
      'SELECT code FROM consumer_referral_codes WHERE campaign_key=$1 AND owner_account_id=$2',
      [CAMPAIGN_KEY, account.id],
    );
  }
  const code = codeResult.rows[0]?.code;
  if (!code) throw new ReferralError('Your invite link could not be loaded.', 503);
  const counts = await pool.query<{ joined: number; qualified: number; rewarded: number }>(
    `SELECT COUNT(*)::int AS joined,
       COUNT(*) FILTER (WHERE status IN ('QUALIFIED','REWARDED'))::int AS qualified,
       COUNT(*) FILTER (WHERE status='REWARDED')::int AS rewarded
     FROM consumer_referral_attributions WHERE campaign_key=$1 AND inviter_account_id=$2`,
    [CAMPAIGN_KEY, account.id],
  );
  return { campaignKey: CAMPAIGN_KEY, code, link: publicLink(code), ...counts.rows[0] };
}

export async function resolveReferral(codeValue: unknown) {
  const code = normalizeReferralCode(codeValue);
  const result = await pool.query<{ expires_at: Date | null }>(
    `SELECT expires_at FROM consumer_referral_codes
     WHERE campaign_key=$1 AND code=$2 AND active=TRUE
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [CAMPAIGN_KEY, code],
  );
  if (!result.rows[0]) throw new ReferralError('This invite link is no longer available.', 404);
  return { valid: true, code, campaignKey: CAMPAIGN_KEY, expiresAt: result.rows[0].expires_at };
}

export async function bindReferral(identity: Identity, codeValue: unknown) {
  const code = normalizeReferralCode(codeValue);
  return transaction(async db => {
    const linkedPhone = await db.query(
      `SELECT 1 FROM consumer_phone_links
       WHERE subject=$1 AND client_id=$2 AND network=$3 AND wallet=$4 LIMIT 1`,
      [identity.subject, identity.clientId, identity.network, identity.wallet],
    );
    if (!linkedPhone.rows[0]) throw new ReferralError('Verify your phone number before accepting an invite.', 409);

    const referral = await db.query<{ id: string; owner_account_id: string; wallet: string; client_id: string; network: string }>(
      `SELECT c.id,c.owner_account_id,a.wallet,a.client_id,a.network
       FROM consumer_referral_codes c JOIN consumer_accounts a ON a.id=c.owner_account_id
       WHERE c.campaign_key=$1 AND c.code=$2 AND c.active=TRUE
         AND (c.expires_at IS NULL OR c.expires_at > NOW()) FOR UPDATE`,
      [CAMPAIGN_KEY, code],
    );
    const row = referral.rows[0];
    if (!row) throw new ReferralError('This invite link is no longer available.', 404);
    if (row.client_id === identity.clientId && row.network === identity.network && row.wallet === identity.wallet) throw new ReferralError('You cannot use your own invite link.', 409);

    const existing = await db.query<{ code_id: string; status: string }>(
      `SELECT code_id,status FROM consumer_referral_attributions
       WHERE campaign_key=$1 AND invitee_client_id=$2 AND invitee_network=$3 AND invitee_wallet=$4 FOR UPDATE`,
      [CAMPAIGN_KEY, identity.clientId, identity.network, identity.wallet],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].code_id !== row.id) throw new ReferralError('This account is already connected to another invite.', 409);
      return { bound: true, status: existing.rows[0].status, code };
    }

    await db.query(
      `INSERT INTO consumer_referral_attributions(
        id,campaign_key,code_id,inviter_account_id,invitee_subject,invitee_client_id,invitee_network,invitee_wallet
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), CAMPAIGN_KEY, row.id, row.owner_account_id, identity.subject, identity.clientId, identity.network, identity.wallet],
    );
    return { bound: true, status: 'BOUND', code };
  });
}
