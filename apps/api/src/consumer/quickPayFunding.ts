import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import type { Identity } from './auth.js';
import { accountFor, FundingError, getDeposit, transaction } from './service.js';
import { kobo, limits, rollingAllowance, transactionLimits, type FiatTier } from './money.js';
import { protocolContracts } from './protocol.js';
import { orchestratorOfframpQuote, orchestratorOnrampQuote } from './stellarBalance.js';
import { createRampTransaction } from '../ramp/service.js';
import { rampProvider } from '../ramp/soroban.js';
import { orchestratorRequest } from '../ramp/protocol.js';
import { config } from '../config.js';
import { vfdDepositAccountProvider } from './providers/vfdDepositAccount.js';
import type { VfdTierUpgradeInput } from './providers/vfdDepositAccount.js';
import { VfdError } from './providers/vfdClient.js';
import { vfdPayoutProvider } from './providers/vfdProvider.js';
import { requireTier3Documents } from './tier3Documents.js';
import { funding } from './settings.js';
import { quickPayBalance } from './quickPay.js';

const amountSchema = z.string().regex(/^(0|[1-9]\d{0,30})(\.\d{1,7})?$/);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const atomic = (value: string) => {
  const parsed = amountSchema.safeParse(value);
  if (!parsed.success) throw new FundingError('Enter a valid USDC amount with at most seven decimals.');
  const [whole, fraction = ''] = parsed.data.split('.');
  const result = BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, '0'));
  if (result <= 0n) throw new FundingError('Enter a positive USDC amount.');
  return result;
};

async function allowance(db: Pick<PoolClient, 'query'>, account: { id: string; tier: FiatTier }) {
  const used = await db.query(`SELECT amount_kobo,effective_at FROM consumer_quick_pay_ledger_entries
    WHERE account_id=$1 AND direction='CREDIT' AND kind IN ('BANK_DEPOSIT','SMART_CONVERSION')
      AND effective_at > NOW()-INTERVAL '24 hours'`, [account.id]);
  const entries=used.rows.map((row: any) => ({ amount: BigInt(row.amount_kobo), at: new Date(row.effective_at).getTime() }));
  const held = await db.query(`SELECT COALESCE(SUM(r.fiat_amount_minor),0)::TEXT AS total,
      MIN(i.expires_at) FILTER (WHERE i.state='quoted') AS quote_expires_at
    FROM ramp_transactions r
    JOIN consumer_offramp_intents i ON i.ramp_transaction_id=r.id
    WHERE r.consumer_account_id=$1 AND r.direction='OFF_RAMP' AND r.metadata->>'source'='quick_pay_conversion'
      AND r.state IN ('CREATED','POLICY_CHECK','PENDING_APPROVAL','APPROVED','PROCESSING')
      AND i.state NOT IN ('expired','cancelled','failed','rejected','refunded')
      AND (i.state<>'quoted' OR i.expires_at>NOW())`, [account.id]);
  return {...availableQuickPayAllowance(account.tier,entries,BigInt(held.rows[0].total),Date.now()),reservationExpiresAt:held.rows[0].quote_expires_at?new Date(held.rows[0].quote_expires_at).toISOString():null};
}

export function availableQuickPayAllowance(tier:FiatTier,entries:{amount:bigint;at:number}[],reserved:bigint,now:number){
  const rolling=rollingAllowance(tier,entries,now);
  const remaining=BigInt(rolling.remainingKobo)>reserved?BigInt(rolling.remainingKobo)-reserved:0n;
  return{...rolling,reservedKobo:reserved.toString(),availableKobo:remaining.toString()};
}

export function availableQuickPayOutboundAllowance(tier:FiatTier,entries:{amount:bigint;at:number}[],now:number){
 return rollingAllowance(tier,entries,now);
}

async function outboundAllowance(db:Pick<PoolClient,'query'>,account:{id:string;tier:FiatTier}){
 const used=await db.query(`SELECT amount_kobo,effective_at FROM consumer_quick_pay_ledger_entries
   WHERE account_id=$1 AND direction='DEBIT' AND kind='SMART_CONVERSION'
     AND effective_at > NOW()-INTERVAL '24 hours'`,[account.id]);
 return availableQuickPayOutboundAllowance(account.tier,used.rows.map((row:any)=>({amount:BigInt(row.amount_kobo),at:new Date(row.effective_at).getTime()})),Date.now());
}

export async function quickPayDepositAccount(identity: Identity) {
  const account = await accountFor(identity);
  const result = await (await import('../db/pool.js')).pool.query(`SELECT provider,bank_name AS "bankName",account_number AS "accountNumber",account_name AS "accountName",status
    FROM consumer_quick_pay_deposit_accounts WHERE account_id=$1`, [account.id]);
  const assigned = result.rows[0];
  if (!assigned || assigned.status !== 'ACTIVE') return { available: false, status: assigned?.status?.toLowerCase() ?? 'not_assigned', provider:'VFD', tier:account.tier, canProvision:vfdDepositAccountProvider.configured, requirements:['nin_or_bvn','dateOfBirth'] };
  return { available: true, tier:account.tier, ...assigned };
}

const identityType=z.enum(['nin','bvn']);
const accountInput=z.object({identityType,identityNumber:z.string().regex(/^\d{11}$/),dateOfBirth:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-([012]\d|3[01])$/),consent:z.literal(true)});
const upgradeInput=z.discriminatedUnion('targetTier',[
 z.object({targetTier:z.literal(2),identityNumber:z.string().regex(/^\d{11}$/),consent:z.literal(true)}),
 z.object({targetTier:z.literal(3),addressLine:z.string().trim().min(5).max(240),city:z.string().trim().min(2).max(100),state:z.string().trim().min(2).max(100),consent:z.literal(true)}),
]);
export function verifiedLegalName(provider:{accountName:string;firstName:string|null;middleName:string|null;lastName:string|null}){
 const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const prefixes=[funding.VFD_MERCHANT_NAME,funding.VFD_WALLET_PREFIX].filter(Boolean).map(escape).join('|');
 const clean=(value:string|null)=>String(value??'').trim().replace(prefixes?new RegExp(`^(?:${prefixes})[-:\\s]+`,'i'):/^$/,'').trim();
 const explicit={firstName:clean(provider.firstName),middleName:clean(provider.middleName),lastName:clean(provider.lastName)};
 if(explicit.firstName&&explicit.lastName)return{...explicit,fullName:[explicit.firstName,explicit.middleName,explicit.lastName].filter(Boolean).join(' ')};
 const fullName=clean(provider.accountName);const parts=fullName.split(/\s+/).filter(Boolean);
 if(parts.length<2)throw new FundingError('The banking partner returned incomplete identity details.',409);
 return{firstName:parts[0],middleName:parts.slice(1,-1).join(' '),lastName:parts.at(-1)!,fullName};
}
const fingerprint=(value:string)=>createHmac('sha256',config.AUTH_TOKEN_PEPPER).update(value).digest('hex');
const safeVfdMessage=(value:string)=>value.replace(/\b\d{10,11}\b/g,'[redacted]').slice(0,180);
export const tierUpgradeReviewPending=(targetTier:2|3,error:unknown)=>targetTier===3&&error instanceof VfdError&&/(?:pending|under review|in review|awaiting approval|awaiting verification)/i.test(error.message);
type FiatVerification={provider_tier:number;initial_identity_type:'NIN'|'BVN'|null;nin_fingerprint:string|null;bvn_fingerprint:string|null};

export function tierUpgradeRequirement(accountTier:FiatTier,targetTier:2|3,verification:FiatVerification):{missing:'nin'|'bvn'|undefined}{
 if(targetTier!==accountTier+1)throw new FundingError('Complete the current account level before continuing.',409);
 if(verification.provider_tier!==accountTier)throw new FundingError('Your bank verification level needs review before you continue.',409);
 if(targetTier===2){
  if(accountTier!==1||!verification.initial_identity_type)throw new FundingError('Your Tier 1 verification needs review.',409);
  const initial=verification.initial_identity_type.toLowerCase() as 'nin'|'bvn';
  const missing=initial==='nin'?'bvn':'nin';
  const initialPresent=initial==='nin'?verification.nin_fingerprint:verification.bvn_fingerprint;
  const missingPresent=missing==='nin'?verification.nin_fingerprint:verification.bvn_fingerprint;
  if(!initialPresent||missingPresent)throw new FundingError('Your Tier 1 verification needs review.',409);
  return{missing};
 }
 if(accountTier!==2||!verification.nin_fingerprint||!verification.bvn_fingerprint)throw new FundingError('Complete Tier 2 before adding your address.',409);
 return{missing:undefined};
}

async function finalizeQuickPayTierUpgrade(identity:Identity,attemptId:string){
 await transaction(async db=>{
  const account=await accountFor(identity,db,true);
  const attempt=(await db.query(`SELECT * FROM consumer_fiat_tier_upgrades WHERE id=$1 AND account_id=$2 FOR UPDATE`,[attemptId,account.id])).rows[0];
  if(!attempt)throw new FundingError('The account upgrade could not be found.',404);
  if(attempt.status==='COMPLETED')return;
  if(attempt.status!=='PROVIDER_CONFIRMED'||Number(attempt.provider_tier)!==Number(attempt.target_tier))throw new FundingError('The bank has not confirmed this account upgrade yet.',409);
  const targetTier=Number(attempt.target_tier) as 2|3;
  if(account.tier===targetTier){
   await db.query(`UPDATE consumer_fiat_tier_upgrades SET status='COMPLETED',completed_at=COALESCE(completed_at,NOW()),updated_at=NOW() WHERE id=$1`,[attempt.id]);
   return;
  }
  if(account.tier!==targetTier-1)throw new FundingError('Your account level changed while this upgrade was processing.',409);
  const verification=(await db.query('SELECT * FROM consumer_fiat_verifications WHERE account_id=$1 FOR UPDATE',[account.id])).rows[0] as FiatVerification|undefined;
  if(!verification)throw new FundingError('Your Tier 1 verification needs review.',409);
  const requirement=tierUpgradeRequirement(account.tier,targetTier,verification);
  const metadata=attempt.request_metadata&&typeof attempt.request_metadata==='object'?attempt.request_metadata as Record<string,unknown>:{};
  if(targetTier===2&&requirement.missing){
   const changed=await db.query(`UPDATE consumer_fiat_verifications SET provider_tier=2,
    nin_fingerprint=CASE WHEN $2='nin' THEN $3 ELSE nin_fingerprint END,
    bvn_fingerprint=CASE WHEN $2='bvn' THEN $3 ELSE bvn_fingerprint END,
    verified_at=NOW(),updated_at=NOW()
    WHERE account_id=$1 AND provider_tier=1`,[account.id,requirement.missing,attempt.request_fingerprint]);
   if(changed.rowCount!==1)throw new FundingError('Your verification record changed while the upgrade was processing.',409);
  }else{
   const addressLine=String(metadata.addressLine??''),city=String(metadata.city??''),state=String(metadata.state??'');
   if(!addressLine||!city||!state)throw new FundingError('The confirmed address upgrade is missing its local details.',409);
   const changed=await db.query('UPDATE consumer_fiat_verifications SET provider_tier=3,verified_at=NOW(),updated_at=NOW() WHERE account_id=$1 AND provider_tier=2',[account.id]);
   if(changed.rowCount!==1)throw new FundingError('Your verification record changed while the upgrade was processing.',409);
   await db.query(`UPDATE consumer_accounts SET profile=COALESCE(profile,'{}'::jsonb)||jsonb_build_object('addressLine',$2::text,'city',$3::text,'state',$4::text,'country','NG') WHERE id=$1`,[account.id,addressLine,city,state]);
  }
  const advanced=await db.query('UPDATE consumer_accounts SET tier=$2 WHERE id=$1 AND tier=$3',[account.id,targetTier,targetTier-1]);
  if(advanced.rowCount!==1)throw new FundingError('Your account level changed while the upgrade was processing.',409);
  await db.query(`INSERT INTO consumer_fiat_verification_events(id,account_id,event_type,provider_tier,identity_type,metadata)
   VALUES($1,$2,$3,$4,$5,$6)`,[randomUUID(),account.id,targetTier===2?'TIER_2_ACTIVATED':'TIER_3_ACTIVATED',targetTier,requirement.missing?.toUpperCase()??null,{upgradeAttemptId:attempt.id}]);
  await db.query(`UPDATE consumer_fiat_tier_upgrades SET status='COMPLETED',completed_at=NOW(),updated_at=NOW() WHERE id=$1`,[attempt.id]);
 });
}
export async function provisionQuickPayDepositAccount(identity:Identity,raw:unknown){
 const parsed=accountInput.safeParse(raw);if(!parsed.success)throw new FundingError('Choose NIN or BVN, enter its 11 digits and your matching date of birth.');
 if(!vfdDepositAccountProvider.configured)throw new FundingError('Oynk Pay bank accounts are being configured.',503);
 if((vfdDepositAccountProvider.environment==='live')!==(identity.network==='PUBLIC'))throw new FundingError('The bank-account environment does not match this Oynk account.',409);
 const account=await accountFor(identity);
 if(account.tier>0)return quickPayDepositAccount(identity);
 const identityFingerprint=fingerprint(`${parsed.data.identityType}:${parsed.data.identityNumber}`);
 const inserted=await pool.query(`INSERT INTO consumer_quick_pay_deposit_accounts(account_id,provider,status,metadata)
  VALUES($1,'VFD','PROVISIONING',$2) ON CONFLICT(account_id) DO NOTHING RETURNING account_id`,[account.id,{identityFingerprint,identityType:parsed.data.identityType,consentAt:new Date().toISOString()}]);
 if(!inserted.rowCount){
  const existing=(await pool.query(`SELECT status,metadata->>'identityFingerprint' AS fingerprint FROM consumer_quick_pay_deposit_accounts WHERE account_id=$1`,[account.id])).rows[0];
  if(existing?.status==='ACTIVE')return quickPayDepositAccount(identity);
  if(existing?.fingerprint&&existing.fingerprint!==identityFingerprint)throw new FundingError('This Oynk Pay account is already being set up with different identity details.',409);
  const claimed=await pool.query(`UPDATE consumer_quick_pay_deposit_accounts SET status='PROVISIONING',updated_at=NOW()
    WHERE account_id=$1 AND (status IN ('PENDING','PENDING_REVIEW') OR (status='PROVISIONING' AND updated_at<NOW()-INTERVAL '2 minutes')) RETURNING account_id`,[account.id]);
  if(!claimed.rowCount)return quickPayDepositAccount(identity);
 }
 try{
  const created=await vfdDepositAccountProvider.createIndividual(parsed.data);
  if(created.providerTier!==1)throw new FundingError('The banking partner returned an unexpected account level.',409);
  const legalName=verifiedLegalName(created);
  await transaction(async db=>{
   await db.query(`UPDATE consumer_quick_pay_deposit_accounts SET bank_name=$2,account_number=$3,account_name=$4,provider_customer_reference=$5,provider_account_reference=$6,status='ACTIVE',updated_at=NOW() WHERE account_id=$1 AND status='PROVISIONING'`,[account.id,created.bankName,created.accountNumber,created.accountName,created.providerCustomerReference,created.providerAccountReference]);
   await db.query(`INSERT INTO consumer_fiat_verifications(account_id,provider_tier,initial_identity_type,nin_fingerprint,bvn_fingerprint,date_of_birth_fingerprint,legal_name_fingerprint,verified_at)
    VALUES($1,1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT(account_id) DO UPDATE SET provider_tier=1,initial_identity_type=EXCLUDED.initial_identity_type,nin_fingerprint=EXCLUDED.nin_fingerprint,bvn_fingerprint=EXCLUDED.bvn_fingerprint,date_of_birth_fingerprint=EXCLUDED.date_of_birth_fingerprint,legal_name_fingerprint=EXCLUDED.legal_name_fingerprint,verified_at=NOW(),updated_at=NOW()`,[account.id,parsed.data.identityType.toUpperCase(),parsed.data.identityType==='nin'?fingerprint(parsed.data.identityNumber):null,parsed.data.identityType==='bvn'?fingerprint(parsed.data.identityNumber):null,fingerprint(parsed.data.dateOfBirth),fingerprint(legalName.fullName)]);
   await db.query(`UPDATE consumer_accounts SET tier=1,fiat_onboarding_skipped_at=NULL,profile=COALESCE(profile,'{}'::jsonb)||jsonb_build_object('firstName',$2::text,'middleName',$3::text,'lastName',$4::text,'country','NG') WHERE id=$1`,[account.id,legalName.firstName,legalName.middleName,legalName.lastName]);
   await db.query(`INSERT INTO consumer_fiat_verification_events(id,account_id,event_type,provider_tier,identity_type) VALUES($1,$2,'TIER_1_ACTIVATED',1,$3)`,[randomUUID(),account.id,parsed.data.identityType.toUpperCase()]);
  });
 return quickPayDepositAccount(identity);
 }catch(error){
  if(error instanceof FundingError)throw error;
  const providerCreationFailed=error instanceof VfdError&&error.code==='VFD_99';
  const databaseError=error&&typeof error==='object'?error as {code?:string;constraint?:string}:null;
  const providerAccountAlreadyMapped=databaseError?.code==='23505'&&databaseError.constraint==='consumer_quick_pay_deposit_accounts_account_number_key';
  if((error instanceof VfdError&&(error.kind!=='unavailable'||providerCreationFailed))||providerAccountAlreadyMapped)await pool.query(`DELETE FROM consumer_quick_pay_deposit_accounts WHERE account_id=$1 AND status='PROVISIONING'`,[account.id]);
  else await pool.query(`UPDATE consumer_quick_pay_deposit_accounts SET status='PENDING',updated_at=NOW() WHERE account_id=$1 AND status='PROVISIONING'`,[account.id]);
  if(error instanceof VfdError)console.warn('[vfd/account-provisioning]',{code:error.code,kind:error.kind,message:safeVfdMessage(error.message)});
  else console.warn('[vfd/account-persistence]',{code:databaseError?.code??'UNEXPECTED',constraint:databaseError?.constraint??null});
  const providerMessage=error instanceof VfdError?error.message.toLowerCase():'';
  const message=providerAccountAlreadyMapped
   ?'This VFD test identity is already linked to another Oynk test account. Use a different VFD test NIN or BVN.'
   :providerCreationFailed
   ?'We could not set up your bank account with this option. Try the other ID option, or try again later.'
   :error instanceof VfdError&&error.kind==='rejected'
   ?providerMessage.includes('date of birth')||providerMessage.includes('dob')
    ?'That date of birth does not match the selected NIN or BVN.'
    :providerMessage.includes('linked to any phone')
     ?'That BVN is not linked to a phone number. Try your NIN or contact your bank.'
     :providerMessage.includes('invalid nin')||providerMessage.includes('invalid bvn')
      ?`That ${parsed.data.identityType.toUpperCase()} could not be verified. Check the number and try again.`
      :'VFD could not verify those details. Check them and try again.'
   :error instanceof VfdError&&error.kind==='configuration'
    ?'Bank account setup is temporarily unavailable while the provider enables this service.'
   :error instanceof VfdError&&error.code==='VFD_NETWORK'
    ?'VFD did not respond in time. Your details were not rejected. Wait a moment, then try again to recover the same account.'
    :'We could not confirm your account yet. Please check again shortly.';
  throw new FundingError(message,providerAccountAlreadyMapped?409:error instanceof VfdError&&(error.kind==='rejected'||providerCreationFailed)?422:503);
 }
}

export async function upgradeQuickPayTier(identity:Identity,raw:unknown){
 const parsed=upgradeInput.safeParse(raw);if(!parsed.success)throw new FundingError('Enter the required verification details and confirm your consent.');
 if(parsed.data.targetTier===3&&!config.CONSUMER_TIER3_ENABLED)throw new FundingError('Tier 3 upgrades are not available in this release.',404);
 if(!vfdDepositAccountProvider.configured)throw new FundingError('Oynk Pay verification is being configured.',503);
 if((vfdDepositAccountProvider.environment==='live')!==(identity.network==='PUBLIC'))throw new FundingError('The bank-account environment does not match this Oynk account.',409);
 const claim=await transaction(async db=>{
  const account=await accountFor(identity,db,true);
  const deposit=(await db.query(`SELECT account_number,status FROM consumer_quick_pay_deposit_accounts WHERE account_id=$1 AND provider='VFD' FOR UPDATE`,[account.id])).rows[0];
  if(!deposit||deposit.status!=='ACTIVE'||!deposit.account_number)throw new FundingError('Activate Tier 1 before upgrading your account.',409);
  const verification=(await db.query('SELECT * FROM consumer_fiat_verifications WHERE account_id=$1 FOR UPDATE',[account.id])).rows[0] as FiatVerification|undefined;
  if(!verification)throw new FundingError('Your Tier 1 verification needs review.',409);
  const requirement=tierUpgradeRequirement(account.tier,parsed.data.targetTier,verification);
  if(parsed.data.targetTier===3)await requireTier3Documents(account.id,db);
  const requestMetadata=parsed.data.targetTier===2
   ?{}
   :{addressLine:parsed.data.addressLine,city:parsed.data.city,state:parsed.data.state};
  const requestFingerprint=parsed.data.targetTier===2
   ?fingerprint(parsed.data.identityNumber)
   :fingerprint(JSON.stringify(requestMetadata));
  const existing=(await db.query(`SELECT * FROM consumer_fiat_tier_upgrades WHERE account_id=$1 AND target_tier=$2 FOR UPDATE`,[account.id,parsed.data.targetTier])).rows[0];
  if(existing){
   if(existing.request_fingerprint!==requestFingerprint)throw new FundingError('This account upgrade was started with different details. Contact Oynk support if you need to change them.',409);
   if(existing.status==='COMPLETED')return{done:true,attemptId:existing.id} as const;
   if(existing.status==='PROVIDER_CONFIRMED')return{confirmed:true,attemptId:existing.id} as const;
   if(existing.status==='PROCESSING')throw new FundingError('Your account upgrade is already being processed. Check again shortly.',409);
   if(existing.status==='PENDING_REVIEW')throw new FundingError('Your Tier 3 request is under review. Tier 2 remains active until our banking partner confirms the upgrade.',409);
   if(existing.status==='UNKNOWN')throw new FundingError('We could not confirm the result of this upgrade. Contact Oynk support before trying again.',409);
   await db.query(`UPDATE consumer_fiat_tier_upgrades SET status='PROCESSING',provider_error_code=NULL,request_metadata=$2,updated_at=NOW() WHERE id=$1`,[existing.id,requestMetadata]);
   return{attemptId:existing.id,accountNumber:deposit.account_number,missing:requirement.missing} as const;
  }
  const attemptId=randomUUID();
  await db.query(`INSERT INTO consumer_fiat_tier_upgrades(id,account_id,target_tier,identity_type,request_fingerprint,request_metadata,status)
   VALUES($1,$2,$3,$4,$5,$6,'PROCESSING')`,[attemptId,account.id,parsed.data.targetTier,requirement.missing?.toUpperCase()??null,requestFingerprint,requestMetadata]);
  return{attemptId,accountNumber:deposit.account_number,missing:requirement.missing} as const;
 });
 if('done' in claim)return quickPayDepositAccount(identity);
 if('confirmed' in claim){await finalizeQuickPayTierUpgrade(identity,claim.attemptId);return quickPayDepositAccount(identity);}
 const input:VfdTierUpgradeInput=parsed.data.targetTier===2
  ?{accountNumber:claim.accountNumber,targetTier:2 as const,identityType:claim.missing!,identityNumber:parsed.data.identityNumber}
  :{accountNumber:claim.accountNumber,targetTier:3 as const,address:[parsed.data.addressLine,parsed.data.city,parsed.data.state].join(', ')};
 let upgraded;
 try{upgraded=await vfdDepositAccountProvider.upgradeIndividual(input);}catch(error){
  const ambiguous=!(error instanceof VfdError)||error.kind==='unavailable';
  const pendingReview=tierUpgradeReviewPending(parsed.data.targetTier,error);
  await pool.query(`UPDATE consumer_fiat_tier_upgrades SET status=$2,provider_error_code=$3,updated_at=NOW() WHERE id=$1 AND status='PROCESSING'`,[claim.attemptId,pendingReview?'PENDING_REVIEW':ambiguous?'UNKNOWN':'FAILED',error instanceof VfdError?error.code:'UNEXPECTED_RESPONSE']);
  if(error instanceof VfdError){
   console.warn('[vfd/tier-upgrade]',{code:error.code,kind:error.kind,message:safeVfdMessage(error.message)});
   if(pendingReview)throw new FundingError('Your Tier 3 request is under review. Tier 2 remains active until our banking partner confirms the upgrade.',409);
   const upgradeNotEnabled=error.kind==='configuration'&&/unauthorized to use|contact admin/i.test(error.message);
   const identityMismatch=error.kind==='rejected'&&/(?:bvn\s+and\s+nin|nin\s+and\s+bvn).*name.*mismatch/i.test(error.message);
   throw new FundingError(
    upgradeNotEnabled&&vfdDepositAccountProvider.environment==='test'
     ?'VFD has not enabled account upgrades for this sandbox application. Contact VFD support.'
     :identityMismatch
      ?'This NIN does not match the BVN used for your Oynk Pay account. Use the matching VFD identity pair.'
     :error.kind==='rejected'
      ?'The banking partner could not verify those details. Check them and try again.'
      :'Verification is temporarily unavailable.',
    error.kind==='rejected'?422:503,
   );
  }
  throw new FundingError('We could not confirm the result of this upgrade. Contact Oynk support before trying again.',503);
 }
 if(upgraded.providerTier!==parsed.data.targetTier)throw new FundingError('The account upgrade could not be confirmed.',409);
 await pool.query(`UPDATE consumer_fiat_tier_upgrades SET status='PROVIDER_CONFIRMED',provider_tier=$2,provider_confirmed_at=NOW(),updated_at=NOW() WHERE id=$1 AND status='PROCESSING'`,[claim.attemptId,upgraded.providerTier]);
 await finalizeQuickPayTierUpgrade(identity,claim.attemptId);
 return quickPayDepositAccount(identity);
}

export async function quickPayLimits(identity: Identity) {
  const account = await accountFor(identity);
  return { tier: account.tier, transactionLimitKobo:String(transactionLimits[account.tier]), ...(await allowance((await import('../db/pool.js')).pool, account)) };
}

export async function createQuickPayConversionQuote(identity: Identity, raw: unknown) {
  const parsed = z.object({ amount: amountSchema }).safeParse(raw);
  if (!parsed.success) throw new FundingError('Enter a valid USDC amount.');
  const usdcAmount = atomic(parsed.data.amount);
  const contracts = protocolContracts(identity.network);
  const quote = await orchestratorOfframpQuote(identity, contracts.orchestrator, usdcAmount);
  const owner=await accountFor(identity);
  const assigned=(await pool.query(`SELECT account_number,account_name FROM consumer_quick_pay_deposit_accounts WHERE account_id=$1 AND provider='VFD' AND status='ACTIVE'`,[owner.id])).rows[0];
  if(!assigned)throw new FundingError('Set up your Oynk Pay account before converting USDC.',409);
  const resolved=await vfdPayoutProvider.resolveDestination({accountNumber:assigned.account_number,bankCode:'999999'});
  const destinationToken=(await vfdPayoutProvider.createDestination({name:resolved.accountName,accountNumber:resolved.accountNumber,bankCode:resolved.bankCode,currency:'NGN'})).destinationToken;
  return transaction(async db => {
    const account = await accountFor(identity, db, true);
    if(account.tier===0)throw new FundingError('Activate Oynk Pay before converting to naira.',409);
    const available = await allowance(db, account);
    if(quote.fiatAmount>transactionLimits[account.tier])throw new FundingError('This amount is above your per-transaction limit.',409);
    if (quote.fiatAmount > BigInt(available.availableKobo)) throw new FundingError('This conversion exceeds your remaining 24-hour limit.');
    const reference = `oynk-pay-convert-${randomUUID()}`;
    const requestId = hash(reference);
    const providerReference = hash(`OYNK_PAY:${reference}`);
    const deadlineLedger = Math.min(quote.validUntilLedger, quote.latestLedger + 17_280);
    const ramp = await createRampTransaction(db, {
      reference, idempotencyKey: `quick-pay-conversion:${reference}`, direction: 'OFF_RAMP',
      consumerAccountId: account.id, subjectReference: account.subject, walletAddress: account.wallet,
      network: account.network, fiatCurrency: 'NGN', fiatAmountMinor: quote.fiatAmount,
      usdcAmountAtomic: quote.usdcAmount, provider: 'VFD', destinationFingerprint: hash(`quick-pay:${account.id}`),
      metadata: { source: 'quick_pay_conversion', requestId, providerAddress: rampProvider(identity.network), rateContract: contracts.orchestrator, rateVersion: quote.rateVersion.toString(), rateValidUntilLedger: quote.validUntilLedger },
      actor: { type: 'CONSUMER', reference: account.id },
    });
    const destination = { type: 'VFD_DEDICATED', accountId: account.id, accountNumber:assigned.account_number, destinationToken };
    const expiresAt=new Date(Date.now()+5*60_000).toISOString();
    const availableAfter=BigInt(available.availableKobo)>quote.fiatAmount?BigInt(available.availableKobo)-quote.fiatAmount:0n;
    const limitsAfterReservation={...available,reservedKobo:String(BigInt(available.reservedKobo)+quote.fiatAmount),availableKobo:String(availableAfter),reservationExpiresAt:expiresAt};
    const result = { reference, requestId, providerReference, providerAddress: rampProvider(identity.network), orchestrator: contracts.orchestrator, usdcAmountAtomic: quote.usdcAmount.toString(), fiatAmountMinor: quote.fiatAmount.toString(), rateKoboPerUsdc: quote.fiatPerUsdc.toString(), rateVersion: quote.rateVersion.toString(), deadlineLedger, expiresAt, approvalState: ramp.approval_state, state: ramp.state, limits: limitsAfterReservation };
    await db.query(`UPDATE ramp_transactions SET orchestrator_request_id=$2,onchain_state='NOT_CREATED',destination=$3 WHERE id=$1`, [ramp.id, requestId, destination]);
    await db.query(`INSERT INTO consumer_offramp_intents(reference,account_id,ramp_transaction_id,quote,destination,expires_at) VALUES($1,$2,$3,$4,$5,$6)`, [reference, account.id, ramp.id, result, destination, expiresAt]);
    return result;
  });
}

/** Quote a dedicated-account Oynk Pay -> Oynk Smart conversion. VFD moves the
 * NGN into Oynk's settlement account before the orchestrator releases USDC. */
export async function createQuickPayToSmartQuote(identity:Identity,raw:unknown){
 const parsed=z.object({amount:z.string()}).safeParse(raw);if(!parsed.success)throw new FundingError('Enter a valid naira amount.');
 let fiatAmount:bigint;try{fiatAmount=kobo(parsed.data.amount);}catch{throw new FundingError('Enter a valid naira amount with at most two decimals.');}
 if(fiatAmount<5_000n||fiatAmount>limits[3])throw new FundingError('Enter at least ₦50 within your account limit.');
 const contracts=protocolContracts(identity.network);let quote;
 try{quote=await orchestratorOnrampQuote(identity,contracts.orchestrator,fiatAmount);}catch{throw new FundingError('The current Oynk conversion rate is unavailable. Please try again shortly.',503);}
 await quickPayBalance(identity);
 const owner=await accountFor(identity);
 if(owner.tier===0)throw new FundingError('Activate Oynk Pay before converting naira.',409);
 if(fiatAmount>transactionLimits[owner.tier])throw new FundingError('This amount is above your per-transaction limit.',409);
 const assigned=(await pool.query(`SELECT account_number FROM consumer_quick_pay_deposit_accounts WHERE account_id=$1 AND provider='VFD' AND status='ACTIVE'`,[owner.id])).rows[0];
 if(!assigned)throw new FundingError('Set up your Oynk Pay account before converting naira.',409);
 if(!funding.VFD_PAYOUT_ACCOUNT_NUMBER)throw new FundingError('Oynk conversion settlement is being configured.',503);
 const settlement=await vfdPayoutProvider.resolveDestination({accountNumber:funding.VFD_PAYOUT_ACCOUNT_NUMBER,bankCode:'999999'});
 const destinationToken=(await vfdPayoutProvider.createDestination({name:settlement.accountName,accountNumber:settlement.accountNumber,bankCode:settlement.bankCode,currency:'NGN'})).destinationToken;
 return transaction(async db=>{
  const account=await accountFor(identity,db,true);
  const wallet=await db.query(`SELECT COALESCE(balance_kobo,0)::TEXT AS balance FROM consumer_quick_pay_accounts WHERE account_id=$1 FOR UPDATE`,[account.id]);
  const balance=BigInt(wallet.rows[0]?.balance??'0');if(balance<fiatAmount)throw new FundingError('This amount exceeds your available Oynk Pay balance.');
  const available=await outboundAllowance(db,account);if(fiatAmount>BigInt(available.remainingKobo))throw new FundingError('This conversion exceeds your remaining 24-hour limit.');
  const reference=`oynk-pay-to-smart-${randomUUID()}`;const requestId=hash(reference);const providerReference=hash(`VFD:${reference}`);const deadlineLedger=Math.min(quote.validUntilLedger,quote.latestLedger+17_280);
  const ramp=await createRampTransaction(db,{reference,idempotencyKey:`quick-pay-to-smart:${reference}`,direction:'ON_RAMP',consumerAccountId:account.id,subjectReference:account.subject,walletAddress:account.wallet,network:account.network,fiatCurrency:'NGN',fiatAmountMinor:fiatAmount,usdcAmountAtomic:quote.usdcAmount,feeFiatMinor:0n,provider:'VFD',metadata:{source:'quick_pay_to_smart',requestId,quoteProviderReference:providerReference,sourceAccountNumber:assigned.account_number,settlementAccountNumber:funding.VFD_PAYOUT_ACCOUNT_NUMBER,destinationToken,providerAddress:rampProvider(identity.network),rateContract:contracts.orchestrator,rateVersion:quote.rateVersion.toString(),rateValidUntilLedger:quote.validUntilLedger},actor:{type:'CONSUMER',reference:account.id}});
  const result={reference,requestId,providerReference,providerAddress:rampProvider(identity.network),orchestrator:contracts.orchestrator,usdcAmountAtomic:quote.usdcAmount.toString(),minUsdcAmountAtomic:quote.usdcAmount.toString(),fiatAmountMinor:fiatAmount.toString(),rateKoboPerUsdc:quote.fiatPerUsdc.toString(),rateVersion:quote.rateVersion.toString(),deadlineLedger,approvalState:ramp.approval_state,state:ramp.state,limits:available};
  await db.query(`UPDATE ramp_transactions SET orchestrator_request_id=$2,onchain_state='NOT_CREATED' WHERE id=$1`,[ramp.id,requestId]);
  await db.query(`INSERT INTO consumer_deposit_intents(reference,account_id,amount_kobo,quote,expires_at,ramp_transaction_id) VALUES($1,$2,$3,$4,NOW()+INTERVAL '5 minutes',$5)`,[reference,account.id,fiatAmount.toString(),{...result,depositKobo:fiatAmount.toString(),feeKobo:'0',totalKobo:fiatAmount.toString(),estimatedUsdcAtomic:quote.usdcAmount.toString()},ramp.id]);
  return result;
 });
}

function stateName(value:unknown):string{if(typeof value==='string')return value;if(value&&typeof value==='object'){const row=value as Record<string,unknown>;if(typeof row.tag==='string')return row.tag;if(typeof row.status==='string')return row.status;return JSON.stringify(value);}return'';}

/** Record the authenticated Soroban request. The worker moves NGN from the
 * dedicated VFD account before it confirms the on-ramp and releases USDC. */
export async function confirmQuickPayToSmart(identity:Identity,reference:string,raw:unknown){
 const parsed=z.object({createTxHash:z.string().regex(/^[a-f0-9]{64}$/i)}).safeParse(raw);if(!parsed.success)throw new FundingError('The Stellar transaction details are invalid.');
 const account=await accountFor(identity);const found=await pool.query(`SELECT i.*,r.orchestrator_request_id,r.metadata,r.provider_reference,r.provider_status FROM consumer_deposit_intents i JOIN ramp_transactions r ON r.id=i.ramp_transaction_id WHERE i.reference=$1 AND i.account_id=$2`,[reference,account.id]);const initial=found.rows[0];if(!initial||initial.metadata?.source!=='quick_pay_to_smart')throw new FundingError('Conversion request not found.',404);
 const orchestrator=typeof initial.metadata?.rateContract==='string'?initial.metadata.rateContract:protocolContracts(identity.network).orchestrator;const chain=await orchestratorRequest(identity.network,initial.orchestrator_request_id,orchestrator);
 if(!chain.request||String((chain.request as any).claimant)!==account.wallet||!stateName((chain.request as any).status).includes('AwaitingFiat'))throw new FundingError('The conversion approval is not confirmed on Stellar.',409);
 await transaction(async db=>{
  const locked=await accountFor(identity,db,true);const current=(await db.query(`SELECT i.*,r.metadata,r.provider_reference,r.provider_status FROM consumer_deposit_intents i JOIN ramp_transactions r ON r.id=i.ramp_transaction_id WHERE i.reference=$1 AND i.account_id=$2 FOR UPDATE OF i,r`,[reference,locked.id])).rows[0];
  if(!current||current.metadata?.source!=='quick_pay_to_smart')throw new FundingError('Conversion request not found.',404);if(['settling','received'].includes(current.state))return;if(current.state!=='quoted')throw new FundingError('This conversion can no longer be submitted.',409);if(new Date(current.expires_at).getTime()<=Date.now())throw new FundingError('This conversion quote expired. Request a fresh quote.',409);
  const available=await outboundAllowance(db,locked);const amount=BigInt(current.amount_kobo);if(amount>BigInt(available.remainingKobo))throw new FundingError('Your remaining 24-hour conversion limit changed. Request a fresh quote.',409);
  const balance=(await db.query(`SELECT COALESCE(balance_kobo,0)::TEXT AS balance FROM consumer_quick_pay_accounts WHERE account_id=$1 FOR UPDATE`,[locked.id])).rows[0]?.balance??'0';if(BigInt(balance)<amount)throw new FundingError('This amount exceeds your available Oynk Pay balance.',409);
  await db.query(`UPDATE consumer_deposit_intents SET state='settling' WHERE reference=$1`,[reference]);await db.query(`UPDATE ramp_transactions SET onchain_state='AWAITING_FIAT',stellar_transaction_hash=$2,metadata=metadata||$3::jsonb,updated_at=NOW() WHERE id=$1`,[current.ramp_transaction_id,parsed.data.createTxHash,JSON.stringify({createTxHash:parsed.data.createTxHash})]);
  await db.query(`UPDATE ramp_transactions SET state=CASE WHEN approval_state='PENDING' THEN 'PENDING_APPROVAL' ELSE 'APPROVED' END WHERE id=$1`,[current.ramp_transaction_id]);
 });
 return quickPayToSmartStatus(identity,reference);
}

export async function quickPayToSmartStatus(identity:Identity,reference:string){
 const account=await accountFor(identity);const found=await pool.query(`SELECT r.metadata FROM consumer_deposit_intents i JOIN ramp_transactions r ON r.id=i.ramp_transaction_id WHERE i.reference=$1 AND i.account_id=$2`,[reference,account.id]);if(found.rows[0]?.metadata?.source!=='quick_pay_to_smart')throw new FundingError('Conversion request not found.',404);return getDeposit(identity,reference);
}
