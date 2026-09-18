import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { secureHash } from '../auth/security.js';
import type { Identity } from './auth.js';
import { funding } from './settings.js';

const developmentTestPhones = new Set([
  '+2348012345678',
  '+2348012345679',
  '+2348012345670',
  '+2348123456789',
  '+2348012345680',
  '+2348012345681',
  '+2348012345682',
  '+2348012345683',
  '+2348012345684',
]);
// Additional deterministic fixtures for local/device testing only.
for (let suffix = 5700; suffix < 5750; suffix += 1) {
  developmentTestPhones.add(`+234801234${suffix}`);
}
const isDevelopmentFixture = (phone: string) => config.APP_ENV !== 'production' && developmentTestPhones.has(phone);
const phoneSchema = z.string().trim().refine(value => /^\+234[789]\d{9}$/.test(value) || isDevelopmentFixture(value), 'Invalid phone');
const codeSchema = z.string().regex(/^\d{6}$/);
const ttlMs = 5 * 60_000;

function normalizePhone(value: unknown): string {
  const parsed = phoneSchema.safeParse(value);
  if (!parsed.success) throw new PhoneAuthError('Enter a valid Nigerian mobile number.', 400);
  return parsed.data;
}

export class PhoneAuthError extends Error { constructor(message: string, readonly status = 400) { super(message); } }

async function sendSms(phone: string, code: string): Promise<void> {
  if (!config.AFRICASTALKING_API_KEY) {
    if (config.APP_ENV === 'development') return;
    throw new PhoneAuthError('Phone verification is being configured. Please try again later.', 503);
  }
  const body = new URLSearchParams({ username: config.AFRICASTALKING_USERNAME, to: phone, message: `Your Oynk verification code is ${code}. It expires in 5 minutes. Do not share it.`, from: config.AFRICASTALKING_SENDER_ID });
  const response = await fetch(config.AFRICASTALKING_API_URL, { method: 'POST', headers: { apiKey: config.AFRICASTALKING_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new PhoneAuthError('We could not send the code. Please try again.', 503);
}

export async function startPhoneChallenge(phoneInput: unknown, ip?: string) {
  const phone = normalizePhone(phoneInput);
  const linked = await pool.query('SELECT auth_method FROM consumer_phone_links WHERE phone=$1 AND client_id=$2 LIMIT 1', [phone, funding.SOCKETFI_CLIENT_ID]);
  const accountMethod = linked.rows[0]?.auth_method ?? null;
  const recent = await pool.query(`SELECT resend_available_at FROM consumer_phone_challenges WHERE phone=$1 AND invalidated_at IS NULL ORDER BY created_at DESC LIMIT 1`, [phone]);
  const fixture = isDevelopmentFixture(phone);
  if (!fixture && recent.rows[0] && new Date(recent.rows[0].resend_available_at).getTime() > Date.now()) throw new PhoneAuthError('Please wait before requesting another code.', 429);
  const id = randomUUID(); const code = fixture ? '000000' : String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expires = new Date(Date.now() + ttlMs); const resend = new Date(Date.now() + 60_000);
  await pool.query(`UPDATE consumer_phone_challenges SET invalidated_at=NOW() WHERE phone=$1 AND consumed_at IS NULL AND invalidated_at IS NULL`, [phone]);
  await pool.query(`INSERT INTO consumer_phone_challenges(id,phone,code_hash,expires_at,resend_available_at,created_ip) VALUES($1,$2,$3,$4,$5,$6)`, [id, phone, secureHash(`${id}:${phone}:${code}`), expires, resend, ip ?? null]);
  await sendSms(phone, code);
  return {
    challengeId: id,
    accountExists: linked.rows.length > 0,
    accountMethod,
    verificationRequired: true,
    expiresAt: expires.toISOString(),
    resendAvailableAt: resend.toISOString(),
    destinationHint: `${phone.slice(0, 7)}••••${phone.slice(-2)}`,
    ...(config.APP_ENV === 'development' && !config.AFRICASTALKING_API_KEY ? { developmentCode: code } : {}),
  };
}

export async function verifyPhoneChallenge(challengeInput: unknown, codeInput: unknown) {
  const id = z.string().uuid().safeParse(challengeInput); const code = codeSchema.safeParse(codeInput);
  if (!id.success || !code.success) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`SELECT * FROM consumer_phone_challenges WHERE id=$1 FOR UPDATE`, [id.data]);
    const row = result.rows[0];
    if (!row || row.consumed_at || row.invalidated_at || new Date(row.expires_at).getTime() <= Date.now() || row.attempts >= row.max_attempts) { await client.query('ROLLBACK'); return null; }
    const testCode = isDevelopmentFixture(row.phone) && code.data === '000000';
    if (!testCode && secureHash(`${row.id}:${row.phone}:${code.data}`) !== row.code_hash) { await client.query(`UPDATE consumer_phone_challenges SET attempts=attempts+1 WHERE id=$1`, [id.data]); await client.query('COMMIT'); return null; }
    await client.query(`UPDATE consumer_phone_challenges SET consumed_at=NOW() WHERE id=$1`, [id.data]);
    const linked = await client.query(
      'SELECT auth_method FROM consumer_phone_links WHERE phone=$1 AND client_id=$2 LIMIT 1',
      [row.phone, funding.SOCKETFI_CLIENT_ID],
    );
    await client.query('COMMIT');
    return {
      phone: row.phone,
      verifiedAt: new Date().toISOString(),
      accountExists: linked.rows.length > 0,
      accountMethod: linked.rows[0]?.auth_method ?? null,
    };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function linkVerifiedPhone(identity: Identity, challengeInput: unknown) {
  const id = z.string().uuid().safeParse(challengeInput);
  if (!id.success) throw new PhoneAuthError('Verify your phone number before continuing.', 400);
  const result = await pool.query('SELECT phone,consumed_at,expires_at,invalidated_at FROM consumer_phone_challenges WHERE id=$1', [id.data]);
  const challenge = result.rows[0];
  if (!challenge?.consumed_at || challenge.invalidated_at || new Date(challenge.expires_at).getTime() <= Date.now()) throw new PhoneAuthError('Verify your phone number before continuing.', 401);
  try {
    const existing = await pool.query('SELECT subject,network,wallet,auth_method FROM consumer_phone_links WHERE phone=$1 AND client_id=$2', [challenge.phone, identity.clientId]);
    if (existing.rows[0] && (existing.rows[0].subject !== identity.subject || existing.rows[0].network !== identity.network || existing.rows[0].wallet !== identity.wallet)) throw new PhoneAuthError('This phone number is already linked to another Oynk account.', 409);
    if (existing.rows[0] && existing.rows[0].auth_method !== identity.authMethod) throw new PhoneAuthError('This phone number is already linked to another Oynk account.', 409);
    if (!existing.rows[0]) await pool.query(`INSERT INTO consumer_phone_links(phone,subject,client_id,network,wallet,auth_method) VALUES($1,$2,$3,$4,$5,$6)`, [challenge.phone, identity.subject, identity.clientId, identity.network, identity.wallet, identity.authMethod]);
    await pool.query(`INSERT INTO consumer_accounts(id,subject,client_id,network,wallet,profile) VALUES($1,$2,$3,$4,$5,'{}'::jsonb) ON CONFLICT(client_id,subject,network) DO UPDATE SET wallet=EXCLUDED.wallet`, [randomUUID(), identity.subject, identity.clientId, identity.network, identity.wallet]);
    return { linked: true, phone: challenge.phone };
  } catch (error: any) {
    if (error?.code === '23505') throw new PhoneAuthError('This smart account or phone number is already linked to another Oynk account.', 409);
    throw error;
  }
}
