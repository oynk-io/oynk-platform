import express from 'express';
import { consumerIdentity } from './auth.js';
import { stellarBalance } from './stellarBalance.js';
import { validSignature } from './paystack.js';
import { accountFor, createQuote, fundingStatus, FundingError, getDeposit, reconcile, recoverDeposit, saveProfile, startDeposit } from './service.js';
import { PhoneAuthError, linkVerifiedPhone, startPhoneChallenge, verifyPhoneChallenge } from './phoneAuth.js';
export const consumerRouter = express.Router();
consumerRouter.use((_req,res,next) => { res.setHeader('Cache-Control','no-store'); next(); });
consumerRouter.post('/auth/phone/start', async (req,res,next) => { try { res.json(await startPhoneChallenge(req.body?.phone, req.ip)); } catch (e) { next(e); } });
consumerRouter.post('/auth/phone/verify', async (req,res,next) => { try { const result = await verifyPhoneChallenge(req.body?.challengeId, req.body?.code); if (!result) throw new PhoneAuthError('That code is incorrect or expired.', 401); res.json({ verified: true, ...result }); } catch (e) { next(e); } });
consumerRouter.use(async (req,res,next) => {
 try { res.locals.identity = await consumerIdentity(req.headers.authorization); next(); }
 catch { res.status(401).json({message:'Sign in again to access your account.'}); }
});
consumerRouter.post('/auth/phone/link', async (req,res,next) => { try { res.json(await linkVerifiedPhone(res.locals.identity, req.body?.challengeId)); } catch (e) { next(e); } });
consumerRouter.get('/profile', async (_req,res,next) => { try { const a = await accountFor(res.locals.identity); res.json({profile:a.profile,tier:a.tier}); } catch(e) { next(e); } });
consumerRouter.get('/balance', async (_req,res) => {
 try { res.json(await stellarBalance(res.locals.identity)); }
 catch { res.status(503).json({message:'Your USDC balance could not be refreshed. Please try again.'}); }
});
consumerRouter.post('/profile', async (req,res,next) => { try { res.json(await saveProfile(res.locals.identity,req.body)); } catch(e) { next(e); } });
consumerRouter.get('/funding',async (_req,res,next) => { try { res.json(await fundingStatus(res.locals.identity)); } catch(e) { next(e); } });
consumerRouter.post('/quotes',async (req,res,next) => { try { res.json(await createQuote(res.locals.identity,req.body?.amount)); } catch(e) { next(e); } });
consumerRouter.post('/deposits',async (req,res,next) => {
 try { if (typeof req.body?.reference !== 'string' || !/^oynk-[0-9a-f-]{36}$/.test(req.body.reference)) throw new FundingError('Invalid deposit reference.'); res.json(await startDeposit(res.locals.identity,req.body.reference,req.body.consent)); } catch(e) { next(e); }
});
consumerRouter.get('/deposits/:reference',async (req,res,next) => {
 try {
  const reference = String(req.params.reference);
  await getDeposit(res.locals.identity,reference); // Authorize ownership before calling Paystack.
  try { await recoverDeposit(reference); } catch { /* Return durable pending state; no false failure or release. */ }
  res.json(await getDeposit(res.locals.identity,reference));
 } catch(e) { next(e); }
});
consumerRouter.use((err: unknown,_req:express.Request,res:express.Response,_next:express.NextFunction) => {
 if (err instanceof PhoneAuthError) { res.status(err.status).json({message:err.message}); return; }
 if (err instanceof FundingError) { res.status(err.status).json({message:err.message}); return; }
 // Never echo provider payloads, SQL errors, tokens or personal data.
 res.status(503).json({message:'The deposit service could not finish this request. Refresh to check its status before trying again.'});
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
