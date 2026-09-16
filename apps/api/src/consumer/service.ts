import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import type { Identity } from './auth.js';
import { funding, paystackDomain } from './settings.js';
import { kobo, limits, rollingAllowance, transferQuote } from './money.js';
import { paystack } from './paystack.js';

export class FundingError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const detailsSchema = z.object({
 firstName: z.string().trim().min(2).max(100), lastName: z.string().trim().min(2).max(100),
 // Email is optional for Tier 1. Normalize an omitted value to an empty
 // string so downstream providers never receive `undefined` unexpectedly.
 email: z.union([z.email().max(254).transform(x => x.toLowerCase()), z.literal('')]).default(''), phone: z.string().regex(/^\+234\d{10}$/).optional(),
 addressLine: z.string().trim().min(5).max(240), city: z.string().trim().min(2).max(100), state: z.string().trim().min(2).max(100), country: z.literal('NG'),
});
type Account = { id: string; wallet: string; network: string; tier: 1|2|3; profile: z.infer<typeof detailsSchema> };
export async function transaction<T>(fn: (db: PoolClient) => Promise<T>) {
 const db = await pool.connect();
 try { await db.query('BEGIN'); await db.query("SET LOCAL lock_timeout = '3s'"); await db.query("SET LOCAL statement_timeout = '8s'"); const result = await fn(db); await db.query('COMMIT'); return result; }
 catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
}
export async function accountFor(identity: Identity, db: Pick<PoolClient,'query'> = pool, lock = false): Promise<Account> {
 const result = await db.query('SELECT * FROM consumer_accounts WHERE subject=$1 AND client_id=$2 AND network=$3' + (lock ? ' FOR UPDATE' : ''), [identity.subject, identity.clientId, identity.network]);
 const account = result.rows[0] as Account | undefined;
 if (!account) throw new FundingError('Complete your personal details before depositing.');
 if (account.wallet !== identity.wallet) throw new FundingError('Your smart-account mapping needs review. Contact Oynk support.', 409);
 return account;
}
export async function saveProfile(identity: Identity, raw: unknown) {
 const input = raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : raw;
 if (input && typeof input === 'object' && typeof (input as Record<string, unknown>).email !== 'string') (input as Record<string, unknown>).email = '';
 if (input && typeof input === 'object' && !(input as Record<string, unknown>).phone) {
  const linked = await pool.query('SELECT phone FROM consumer_phone_links WHERE subject=$1 AND client_id=$2 AND network=$3 LIMIT 1', [identity.subject, identity.clientId, identity.network]);
  if (linked.rows[0]?.phone) (input as Record<string, unknown>).phone = linked.rows[0].phone;
 }
 const parsed = detailsSchema.safeParse(input);
 if (!parsed.success) throw new FundingError('Please review your personal details.');
 return transaction(async db => {
  await db.query(`INSERT INTO consumer_accounts(id,subject,client_id,network,wallet,profile) VALUES($1,$2,$3,$4,$5,$6)
   ON CONFLICT(client_id,subject,network) DO NOTHING`, [randomUUID(),identity.subject,identity.clientId,identity.network,identity.wallet,parsed.data]);
  const account = await accountFor(identity,db,true);
  // Editing identity fields cannot silently retain a previously verified higher tier.
  if (account.tier > 1 && Object.keys(parsed.data).some(key => account.profile[key as keyof typeof parsed.data] !== parsed.data[key as keyof typeof parsed.data])) throw new FundingError('Contact support to change verified personal details.',409);
  await db.query('UPDATE consumer_accounts SET profile=$2 WHERE id=$1',[account.id,parsed.data]);
  return { profile: parsed.data, tier: account.tier };
 });
}
async function allowance(db: Pick<PoolClient,'query'>, account: Account) {
 const result = await db.query(`SELECT (i.quote->>'depositKobo')::bigint AS amount_kobo,r.paid_at AS at FROM consumer_fiat_receipts r JOIN consumer_deposit_intents i USING(reference) WHERE r.account_id=$1 AND r.state='fiat_received' AND r.paid_at > now()-interval '24 hours'`,[account.id]);
 const rolling = rollingAllowance(account.tier,result.rows.map(row => ({amount:BigInt(row.amount_kobo),at:new Date(row.at).getTime()})),Date.now());
 const reserved = await db.query(`SELECT COALESCE(sum((quote->>'depositKobo')::bigint),0)::text AS total FROM consumer_deposit_intents WHERE account_id=$1 AND state IN ('creating','pending','review')`,[account.id]);
 const held = BigInt(reserved.rows[0].total); const available = BigInt(rolling.remainingKobo)-held;
 return { ...rolling, availableToRequestKobo:String(available > 0n ? available : 0n), reservedKobo:String(held) };
}
export async function fundingStatus(identity: Identity) {
 const account = await accountFor(identity);
 const receipts = await pool.query('SELECT reference,amount_kobo AS "amountKobo",fee_kobo AS "feeKobo",paid_at AS "paidAt",state FROM consumer_fiat_receipts WHERE account_id=$1 ORDER BY paid_at DESC LIMIT 30',[account.id]);
 const pending = await pool.query(`SELECT reference,state,quote,bank,expires_at AS "expiresAt" FROM consumer_deposit_intents WHERE account_id=$1 AND state IN ('creating','pending','review') ORDER BY created_at DESC`,[account.id]);
 return { tier:account.tier, limits:await allowance(pool,account), receipts:receipts.rows, pending:pending.rows, mode:paystackDomain, settlement:'not_available', available:/^sk_(test|live)_/.test(funding.PAYSTACK_SECRET_KEY) && ((paystackDomain==='live') === (identity.network==='PUBLIC')) };
}
function currentRate() {
 if (!funding.OYNK_NGN_PER_USDC || Date.parse(funding.OYNK_RATE_EXPIRES_AT) <= Date.now() || !Number.isFinite(Date.parse(funding.OYNK_RATE_EXPIRES_AT))) return null;
 const value = kobo(funding.OYNK_NGN_PER_USDC); return value > 0n ? value : null;
}
export async function createQuote(identity: Identity, amount: unknown) {
 let principal: bigint;
 try { principal = kobo(amount); } catch { throw new FundingError('Enter a valid naira amount with at most two decimals.'); }
 if (principal < 5000n || principal > limits[3]) throw new FundingError('Enter a deposit of at least ₦50 within your account limit.');
 return transaction(async db => {
  const account = await accountFor(identity,db,true); const available = await allowance(db,account);
  const recent = await db.query(`SELECT count(*)::int AS count FROM consumer_deposit_intents WHERE account_id=$1 AND created_at > now()-interval '5 minutes'`,[account.id]);
  if (recent.rows[0].count >= 10) throw new FundingError('Please wait a few minutes before requesting more quotes.',429);
  const quote = transferQuote(principal,currentRate());
  if (principal > BigInt(available.availableToRequestKobo)) throw new FundingError(BigInt(available.reservedKobo)>0n ? 'You already have a pending deposit using part of your allowance. Finish it before requesting this amount.' : 'This deposit exceeds your remaining 24-hour allowance. Fees do not count toward your limit.');
  const reference = `oynk-${randomUUID()}`;
  const expiresAt = new Date(Date.now()+5*60000).toISOString();
  await db.query('INSERT INTO consumer_deposit_intents(reference,account_id,amount_kobo,quote,expires_at) VALUES($1,$2,$3,$4,$5)',[reference,account.id,quote.totalKobo,quote,expiresAt]);
  return { reference,...quote,expiresAt,limits:available };
 });
}
function networkCheck(identity: Identity) {
 if ((paystackDomain === 'live') !== (identity.network === 'PUBLIC')) throw new FundingError('The payment environment does not match your smart-account network.',409);
}
function bankDetails(data: Record<string,any>, reference: string) {
 if (data.reference !== reference || data.status !== 'pending_bank_transfer' || typeof data.account_number !== 'string' || !/^\d{10}$/.test(data.account_number) || typeof data.account_name !== 'string' || typeof data.bank?.name !== 'string' || !Number.isFinite(Date.parse(data.account_expires_at))) throw new FundingError('Bank details are still being confirmed. Refresh this deposit before sending.',409);
 return { account_number:data.account_number,account_name:data.account_name,bank_name:data.bank.name };
}
export async function startDeposit(identity: Identity, reference: string, consent: unknown) {
 networkCheck(identity);
 if (!/^sk_(test|live)_/.test(funding.PAYSTACK_SECRET_KEY)) throw new FundingError('Naira deposits are being configured. Please try again later.',503);
 if (consent !== true) throw new FundingError('Confirm that Paystack may use your details to process this deposit.');
 const started = await transaction(async db => {
  const account = await accountFor(identity,db,true);
  const result = await db.query('SELECT * FROM consumer_deposit_intents WHERE reference=$1 AND account_id=$2 FOR UPDATE',[reference,account.id]);
  const intent = result.rows[0]; if (!intent) throw new FundingError('Deposit quote not found.',404);
  if (intent.state !== 'quoted') return { account,intent,create:false };
  if (new Date(intent.expires_at).getTime() <= Date.now()) throw new FundingError('This quote expired. Request a fresh quote.');
  const available = await allowance(db,account);
  if (BigInt(intent.quote.depositKobo) > BigInt(available.availableToRequestKobo)) throw new FundingError('Your available deposit allowance changed. Request a fresh quote.');
  await db.query(`UPDATE consumer_deposit_intents SET state='creating',expires_at=now()+interval '30 minutes' WHERE reference=$1`,[reference]);
  await db.query('UPDATE consumer_accounts SET consent_at=now() WHERE id=$1',[account.id]);
  return { account,intent,create:true };
 });
 if (started.create) {
  // Exactly one creator wins the DB transition. A timeout never causes a second POST.
  const data = await paystack('/charge',{ email:started.account.profile.email, amount:started.intent.amount_kobo, currency:'NGN', reference,
   metadata:{ oynk_account_id:started.account.id }, bank_transfer:{ account_expires_at:new Date(Date.now()+30*60000).toISOString() } });
  if (data.status === 'pending_bank_transfer') {
   const bank = bankDetails(data,reference);
   await pool.query(`UPDATE consumer_deposit_intents SET bank=$2,state='pending',expires_at=$3 WHERE reference=$1 AND state='creating'`,[reference,bank,data.account_expires_at]);
  }
 }
 return getDeposit(identity,reference);
}
export async function getDeposit(identity: Identity, reference: string) {
 const account = await accountFor(identity);
 const result = await pool.query('SELECT reference,state,quote,bank,expires_at AS "expiresAt" FROM consumer_deposit_intents WHERE reference=$1 AND account_id=$2',[reference,account.id]);
 if (!result.rows[0]) throw new FundingError('Deposit not found.',404);
 return result.rows[0];
}

export async function reconcile(reference: string) {
 const data = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
 if (data.reference !== reference || data.domain !== paystackDomain) throw new Error('Payment verification mismatch');
 if (data.status !== 'success') {
  // Only terminal provider status, after expiry/grace, can release a reservation.
  if (['failed','abandoned'].includes(data.status)) await pool.query(`UPDATE consumer_deposit_intents SET state='expired' WHERE reference=$1 AND state IN ('creating','pending') AND expires_at < now()-interval '5 minutes'`,[reference]);
  return;
 }
 if (data.currency !== 'NGN' || data.channel !== 'bank_transfer' || !Number.isSafeInteger(data.amount) || data.amount <= 0 || !Number.isSafeInteger(data.fees) || data.fees < 0 || !Number.isSafeInteger(data.id) || !Number.isFinite(Date.parse(data.paid_at)) || Date.parse(data.paid_at) > Date.now()+60000) throw new Error('Invalid verified payment');
 await transaction(async db => {
  const found = await db.query('SELECT account_id FROM consumer_deposit_intents WHERE reference=$1',[reference]);
  const accountId = found.rows[0]?.account_id;
  // Unknown references are quarantined, never matched by a caller-controlled email.
  const account = accountId ? (await db.query('SELECT * FROM consumer_accounts WHERE id=$1 FOR UPDATE',[accountId])).rows[0] as Account : null;
  const existing = await db.query('SELECT reference FROM consumer_fiat_receipts WHERE reference=$1 OR provider_id=$2',[reference,String(data.id)]);
  if (existing.rowCount) return;
  const intent = (await db.query('SELECT * FROM consumer_deposit_intents WHERE reference=$1 FOR UPDATE',[reference])).rows[0];
  let reason: string|null = !account ? 'unmatched_reference' : String(data.amount) !== intent.amount_kobo ? 'amount_mismatch' : data.fees >= data.amount ? 'fee_mismatch' : null;
  if (account) {
   const used = await db.query(`SELECT COALESCE(sum((i.quote->>'depositKobo')::bigint),0)::text AS total FROM consumer_fiat_receipts r JOIN consumer_deposit_intents i USING(reference) WHERE r.account_id=$1 AND r.state='fiat_received' AND r.paid_at > $2::timestamptz-interval '24 hours' AND r.paid_at <= $2`,[account.id,data.paid_at]);
   if (!reason && BigInt(used.rows[0].total)+BigInt(intent.quote.depositKobo) > limits[account.tier]) reason = 'over_limit';
   if (intent.state === 'quoted' || intent.state === 'expired') reason = 'unexpected_payment';
  }
  await db.query('INSERT INTO consumer_fiat_receipts(reference,provider_id,account_id,amount_kobo,fee_kobo,paid_at,state,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[reference,String(data.id),accountId??null,String(data.amount),String(data.fees),data.paid_at,reason?'review':'fiat_received',reason]);
  if (account) await db.query('UPDATE consumer_deposit_intents SET state=$2 WHERE reference=$1',[reference,reason?'review':'received']);
 });
}

export async function recoverDeposit(reference: string) {
 await pool.query('UPDATE consumer_deposit_intents SET last_checked_at=now() WHERE reference=$1',[reference]);
 try { await reconcile(reference); } catch { /* Check the pending-charge endpoint as an independent recovery source. */ }
 const intent = (await pool.query('SELECT state FROM consumer_deposit_intents WHERE reference=$1',[reference])).rows[0];
 if (intent?.state !== 'creating') return;
 const data = await paystack(`/charge/${encodeURIComponent(reference)}`);
 if (data.status === 'pending_bank_transfer') {
  const bank = bankDetails(data,reference);
  await pool.query(`UPDATE consumer_deposit_intents SET bank=$2,state='pending',expires_at=$3 WHERE reference=$1 AND state='creating'`,[reference,bank,data.account_expires_at]);
 }
}
let sweeping = false;
export async function reconcilePendingDeposits() {
 if (sweeping || !funding.PAYSTACK_SECRET_KEY) return; sweeping = true;
 try {
  const rows = await pool.query(`SELECT reference FROM consumer_deposit_intents WHERE state IN ('creating','pending') ORDER BY COALESCE(last_checked_at,created_at) LIMIT 30`);
  for (let i=0;i<rows.rows.length;i+=3) await Promise.all(rows.rows.slice(i,i+3).map(async row => { try { await recoverDeposit(row.reference); } catch { /* Keep reservation; next sweep retries read-only verification. */ } }));
 } finally { sweeping = false; }
}
