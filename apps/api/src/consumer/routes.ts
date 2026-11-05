import express from 'express';
import { pool } from '../db/pool.js';
import { randomBytes } from 'node:crypto';
import { accountSecurityChallenge, approveAccountSecurity, requestLostDevice, accountSecurityStatus } from './accountSecurity.js';
import { createChainIntent, confirmChainIntent } from './chainActivity.js';
import { readPoolView } from './poolView.js';
import { consumerIdentity } from './auth.js';
import { stellarBalance, poolPosition, poolStats } from './stellarBalance.js';
import { protocolContracts } from './protocol.js';
import { validSignature } from './paystack.js';
import { createQuote, fundingStatus, FundingError, getDeposit, profileStatus, reconcile, recoverDeposit, saveProfile, startDeposit } from './service.js';
import { cancelOfframpQuote, confirmOfframpFunding, createOfframpQuote, getOfframp, payoutBanks, resolvePayoutDestination } from './offramp.js';
import { consumerActivity, consumerActivityDetail } from './activity.js';
import { protocolOverview } from '../ramp/protocol.js';
import { PhoneAuthError, consumePhoneRate, linkVerifiedPhone, startPhoneChallenge, verifyPhoneChallenge } from './phoneAuth.js';
import { bindReferral, ReferralError, referralSummary, resolveReferral } from './referrals.js';
import { checkHandleAvailability, handleForIdentity, HandleError, reserveHandle, resolveHandle } from './handles.js';
import { activeGoal, GoalError, saveGoal } from './goals.js';
import { configureOfflineAllowance, createOfflineConfigurationChallenge, quickPayBalance } from './quickPay.js';
import { confirmQuickPayToSmart, createQuickPayConversionQuote, createQuickPayToSmartQuote, provisionQuickPayDepositAccount, quickPayDepositAccount, quickPayLimits, quickPayToSmartStatus, upgradeQuickPayTier } from './quickPayFunding.js';
import { tier3DocumentStatus, uploadTier3Document } from './tier3Documents.js';
import { config } from '../config.js';
export const consumerRouter = express.Router();
const unavailable=(enabled:boolean,handler:express.RequestHandler):express.RequestHandler=>(req,res,next)=>{
 if(!enabled){res.status(404).json({message:'This feature is not available in this release.'});return;}
 return handler(req,res,next);
};
consumerRouter.use((_req,res,next) => { res.setHeader('Cache-Control','no-store'); next(); });
consumerRouter.post('/diagnostics',async(req,res,next)=>{try{
 await consumePhoneRate(req.ip??'unknown','DIAGNOSTIC',100);
 const code=req.body?.code,status=req.body?.status,id=req.body?.requestId;
 if(!['APP_RENDER_FAILURE','HTTP_FAILURE','NETWORK_FAILURE'].includes(code)){res.sendStatus(400);return;}
 await pool.query('INSERT INTO mobile_diagnostics(code,http_status,request_id) VALUES($1,$2,$3)',[code,Number.isInteger(status)&&status>=100&&status<=599?status:null,typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id)?id:null]);
 await pool.query("DELETE FROM mobile_diagnostics WHERE created_at<NOW()-INTERVAL '30 days'");res.sendStatus(202);
}catch(e){next(e);}});
consumerRouter.post('/auth/recovery' ,async(req,res,next)=>{try{await consumePhoneRate(req.ip??'unknown','RECOVERY',10);res.status(202).json(await requestLostDevice(req.body));}catch(e){next(e);}});
consumerRouter.post('/auth/phone/start', async (req,res,next) => { try { res.json(await startPhoneChallenge(req.body?.phone, req.ip)); } catch (e) { next(e); } });
consumerRouter.post('/auth/phone/verify', async (req,res,next) => { try { await consumePhoneRate(req.ip??'unknown','VERIFY'); const result = await verifyPhoneChallenge(req.body?.challengeId, req.body?.code); if (!result) throw new PhoneAuthError('That code is incorrect or expired.', 401); res.json({ verified: true, ...result }); } catch (e) { next(e); } });
consumerRouter.post('/auth/handle/check', async (req,res,next) => { try { res.json(await checkHandleAvailability(req.body?.challengeId,req.body?.handle)); } catch(e) { next(e); } });
consumerRouter.post('/auth/handle/reserve', async (req,res,next) => { try { res.json(await reserveHandle(req.body?.challengeId,req.body?.handle)); } catch(e) { next(e); } });
consumerRouter.get('/referrals/resolve/:code', async (req,res,next) => { try { res.json(await resolveReferral(req.params.code)); } catch (e) { next(e); } });
consumerRouter.use(async (req,res,next) => {
 try { res.locals.identity = await consumerIdentity(req.headers.authorization); next(); }
 catch (error) { if (process.env.APP_ENV !== 'production') console.error('[consumer/auth] rejected session', error instanceof Error ? error.message : error); res.status(401).json({message:'Sign in again to access your account.'}); }
});
consumerRouter.post('/auth/phone/link', async (req,res,next) => { try { res.json(await linkVerifiedPhone(res.locals.identity, req.body?.challengeId, req.body?.handle)); } catch (e) { next(e); } });
consumerRouter.get('/handles/me', async (_req,res,next) => { try { res.json(await handleForIdentity(res.locals.identity)); } catch(e) { next(e); } });
consumerRouter.get('/handles/:handle', async (req,res,next) => { try { res.json(await resolveHandle(res.locals.identity, req.params.handle)); } catch(e) { next(e); } });
consumerRouter.get('/goals/active', async (_req,res,next) => { try { res.json(await activeGoal(res.locals.identity)); } catch(e) { next(e); } });
consumerRouter.post('/goals', async (req,res,next) => { try { res.json(await saveGoal(res.locals.identity,req.body)); } catch(e) { next(e); } });
consumerRouter.get('/security/salt',(_req,res)=>res.json({salt:randomBytes(32).toString('hex')}));
consumerRouter.get('/security',async(_req,res,next)=>{try{res.json(await accountSecurityStatus(res.locals.identity));}catch(e){next(e);}});
consumerRouter.post('/security/challenges',async(req,res,next)=>{try{res.json(await accountSecurityChallenge(res.locals.identity,req.body));}catch(e){next(e);}});
consumerRouter.post('/security/approve',async(req,res,next)=>{try{res.json(await approveAccountSecurity(res.locals.identity,req.body));}catch(e){next(e);}});
consumerRouter.get('/profile', async (_req,res,next) => { try { res.json(await profileStatus(res.locals.identity)); } catch(e) { next(e); } });
consumerRouter.get('/balance', async (_req,res) => {
 try { res.json(await stellarBalance(res.locals.identity)); }
 catch { res.status(503).json({message:'Your USDC balance could not be refreshed. Please try again.'}); }
});
consumerRouter.get('/quick-pay', async (_req,res,next) => {
 try { res.json(await quickPayBalance(res.locals.identity)); } catch (e) { next(e); }
});
consumerRouter.post('/quick-pay/offline', unavailable(config.CONSUMER_OFFLINE_PAY_ENABLED, async (req,res,next) => {
 try { res.json(await configureOfflineAllowance(res.locals.identity, req.body)); } catch (e) { next(e); }
}));
consumerRouter.post('/quick-pay/offline/challenges', unavailable(config.CONSUMER_OFFLINE_PAY_ENABLED, async (req,res,next) => {
 try { res.status(201).json(await createOfflineConfigurationChallenge(res.locals.identity, req.body)); } catch (e) { next(e); }
}));
consumerRouter.get('/quick-pay/deposit-account', async (_req,res,next) => {
 try { res.json(await quickPayDepositAccount(res.locals.identity)); } catch (e) { next(e); }
});
consumerRouter.post('/quick-pay/deposit-account', async (req,res,next) => {
 try { res.json(await provisionQuickPayDepositAccount(res.locals.identity,req.body)); } catch (e) { next(e); }
});
consumerRouter.post('/quick-pay/tier',async(req,res,next)=>{try{res.json(await upgradeQuickPayTier(res.locals.identity,req.body));}catch(e){next(e);}});
consumerRouter.get('/quick-pay/tier-documents',unavailable(config.CONSUMER_TIER3_ENABLED,async(_req,res,next)=>{try{res.json(await tier3DocumentStatus(res.locals.identity));}catch(e){next(e);}}));
consumerRouter.post('/quick-pay/tier-documents',unavailable(config.CONSUMER_TIER3_ENABLED,async(req,res,next)=>{try{res.json(await uploadTier3Document(res.locals.identity,req.body));}catch(e){next(e);}}));
consumerRouter.get('/quick-pay/limits', async (_req,res,next) => {
 try { res.json(await quickPayLimits(res.locals.identity)); } catch (e) { next(e); }
});
consumerRouter.post('/quick-pay/conversions/quotes', async (req,res,next) => {
 try { res.json(await createQuickPayConversionQuote(res.locals.identity,req.body)); } catch (e) { next(e); }
});
consumerRouter.post('/quick-pay/conversions/:reference/funded',async(req,res,next)=>{try{res.json(await confirmOfframpFunding(res.locals.identity,String(req.params.reference),req.body));}catch(e){next(e);}});
consumerRouter.post('/quick-pay/conversions/:reference/cancel',async(req,res,next)=>{try{res.json(await cancelOfframpQuote(res.locals.identity,String(req.params.reference),'quick_pay_conversion'));}catch(e){next(e);}});
consumerRouter.get('/quick-pay/conversions/:reference',async(req,res,next)=>{try{res.json(await getOfframp(res.locals.identity,String(req.params.reference)));}catch(e){next(e);}});
consumerRouter.post('/quick-pay/to-smart',async(req,res,next)=>{try{res.json(await createQuickPayToSmartQuote(res.locals.identity,req.body));}catch(e){next(e);}});
consumerRouter.post('/quick-pay/to-smart/:reference',async(req,res,next)=>{try{res.json(await confirmQuickPayToSmart(res.locals.identity,String(req.params.reference),req.body));}catch(e){next(e);}});
consumerRouter.get('/quick-pay/to-smart/:reference',async(req,res,next)=>{try{res.json(await quickPayToSmartStatus(res.locals.identity,String(req.params.reference)));}catch(e){next(e);}});
consumerRouter.get('/pool', async (_req,res,next) => {
 try {
  const identity=res.locals.identity, contracts=protocolContracts(identity.network);
  res.json(await readPoolView(
   ()=>poolPosition(identity,contracts.pool),
   ()=>poolStats(identity,contracts.pool),
   async()=>{const overview=await protocolOverview(identity.network);return{vault:overview.vault,rebalancing:overview.rebalancing};},
  ));
 }
 catch (e) { next(e); }
});
consumerRouter.post('/transactions',async(req,res,next)=>{try{res.status(201).json(await createChainIntent(res.locals.identity,req.body));}catch(e){next(e);}});
consumerRouter.post('/transactions/:id/confirm',async(req,res,next)=>{try{res.json(await confirmChainIntent(res.locals.identity,String(req.params.id),req.body));}catch(e){next(e);}});
consumerRouter.get('/activity',async(_req,res,next)=>{try{res.json(await consumerActivity(res.locals.identity));}catch(e){next(e);}});
consumerRouter.get('/activity/:reference',async(req,res,next)=>{try{const reference=String(req.params.reference);if(reference.length>128)throw new FundingError('Invalid activity reference.');res.json(await consumerActivityDetail(res.locals.identity,reference));}catch(e){next(e);}});
consumerRouter.get('/referrals/me',async(_req,res,next)=>{try{res.json(await referralSummary(res.locals.identity));}catch(e){next(e);}});
consumerRouter.post('/referrals/attribution',async(req,res,next)=>{try{res.json(await bindReferral(res.locals.identity,req.body?.code));}catch(e){next(e);}});
consumerRouter.post('/profile', async (req,res,next) => { try { res.json(await saveProfile(res.locals.identity,req.body)); } catch(e) { next(e); } });
consumerRouter.get('/funding',async (_req,res,next) => { try { res.json(await fundingStatus(res.locals.identity)); } catch(e) { next(e); } });
consumerRouter.post('/quotes',async (req,res,next) => { try { res.json(await createQuote(res.locals.identity,req.body?.amount)); } catch(e) { next(e); } });
consumerRouter.post('/deposits',async (req,res,next) => {
 try { if (typeof req.body?.reference !== 'string' || !/^[A-Za-z0-9_-]{2,30}-[0-9a-f-]{36}$/.test(req.body.reference)) throw new FundingError('Invalid deposit reference.'); res.json(await startDeposit(res.locals.identity,req.body.reference,req.body.consent)); } catch(e) { next(e); }
});
consumerRouter.get('/deposits/:reference',async (req,res,next) => {
 try {
  const reference = String(req.params.reference);
  await getDeposit(res.locals.identity,reference); // Authorize ownership before provider recovery.
  try { await recoverDeposit(reference); } catch { /* Return durable pending state; no false failure or release. */ }
  res.json(await getDeposit(res.locals.identity,reference));
 } catch(e) { next(e); }
});
consumerRouter.get('/ramps/banks',async (_req,res,next)=>{try{res.json(await payoutBanks());}catch(e){next(e);}});
consumerRouter.post('/ramps/resolve-bank',async(req,res,next)=>{try{res.json(await resolvePayoutDestination(req.body));}catch(e){next(e);}});
consumerRouter.post('/offramps/quotes',async(req,res,next)=>{try{res.json(await createOfframpQuote(res.locals.identity,req.body));}catch(e){next(e);}});
consumerRouter.post('/offramps/:reference/funded',async(req,res,next)=>{try{res.json(await confirmOfframpFunding(res.locals.identity,String(req.params.reference),req.body));}catch(e){next(e);}});
consumerRouter.post('/offramps/:reference/cancel',async(req,res,next)=>{try{res.json(await cancelOfframpQuote(res.locals.identity,String(req.params.reference),'consumer_offramp'));}catch(e){next(e);}});
consumerRouter.get('/offramps/:reference',async(req,res,next)=>{try{res.json(await getOfframp(res.locals.identity,String(req.params.reference)));}catch(e){next(e);}});
consumerRouter.use((err: unknown,_req:express.Request,res:express.Response,_next:express.NextFunction) => {
 if (err instanceof PhoneAuthError) { res.status(err.status).json({message:err.message}); return; }
 if (err instanceof HandleError) { res.status(err.status).json({message:err.message}); return; }
 if (err instanceof GoalError) { res.status(err.status).json({message:err.message}); return; }
 if (err instanceof ReferralError) { res.status(err.status).json({message:err.message}); return; }
 if (err instanceof FundingError) { res.status(err.status).json({message:err.message}); return; }
 if (process.env.APP_ENV !== 'production') console.error('[consumer] request failed', err);
 // Never echo provider payloads, SQL errors, tokens or personal data.
 res.status(503).json({message:'Oynk could not finish this request. Refresh to check its status before trying again.'});
});

export const paystackWebhook = express.Router();
paystackWebhook.post('/',express.raw({type:'application/json',limit:'256kb'}),async (req,res) => {
 if (!Buffer.isBuffer(req.body) || !validSignature(req.body,req.get('x-paystack-signature'))) { res.sendStatus(401); return; }
 try {
  const event = JSON.parse(req.body.toString('utf8'));
  if (event.event === 'charge.success') {
   if (typeof event.data?.reference !== 'string' || event.data.reference.length > 128) { res.sendStatus(400); return; }
   if (!event.data.reference.startsWith('oynk-')) { res.sendStatus(200); return; }
   // Do not trust webhook amounts. Verify through Paystack's authenticated API.
   await reconcile(event.data.reference);
  }
  res.sendStatus(200);
 } catch { res.sendStatus(503); } // Paystack retries; receipt insert is idempotent.
});
