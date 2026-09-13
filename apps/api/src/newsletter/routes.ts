import { Router, urlencoded } from 'express';
import { pool } from '../db/pool.js';
import { createNewsletterService, signupSchema } from './service.js';

export const newsletterService = createNewsletterService(pool);
export const newsletterRouter = Router();
newsletterRouter.post('/subscribe', async (request, response) => {
  const parsed = signupSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({error:'Enter a valid email and agree to receive Oynk updates.'}); return; }
  try {
    if (!await newsletterService.allowRequest(request.ip ?? 'unknown')) {
      response.set('Retry-After','3600').status(429).json({error:'Too many requests. Please try again later.'}); return;
    }
    if (!parsed.data.website) await newsletterService.subscribe(parsed.data.email);
    // Same response for existing subscriptions to avoid disclosing the subscriber list.
    response.status(202).json({message:'Thanks for joining. New subscribers will receive a confirmation email shortly.'});
  } catch {
    response.status(503).json({error:'We couldn’t save your signup. Please try again shortly.'});
  }
});
const tokenPattern = /^[a-f0-9]{64}$/;
newsletterRouter.get('/unsubscribe', (request, response) => {
  response.set('Cache-Control','no-store').set('Referrer-Policy','no-referrer');
  const token = request.query.token;
  if (typeof token !== 'string' || !tokenPattern.test(token)) { response.status(400).send('Invalid unsubscribe link.'); return; }
  // Email scanners may follow GET links; only an explicit POST changes the subscription.
  response.type('html').send(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oynk newsletter</title></head><body><main><h1>Unsubscribe from Oynk updates?</h1><p>You can join again whenever you’re ready.</p><form method="post" action="/api/newsletter/unsubscribe"><input type="hidden" name="token" value="${token}"><button type="submit">Unsubscribe</button></form></main></body></html>`);
});

newsletterRouter.post('/unsubscribe', urlencoded({extended:false,limit:'2kb'}), async (request,response) => {
  response.set('Cache-Control','no-store');
  const token=request.body?.token;
  if(typeof token!=='string'||!tokenPattern.test(token)){response.status(400).send('Invalid unsubscribe link.');return;}
  try {await newsletterService.unsubscribe(token);response.type('html').send('<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed — Oynk</title></head><body><main><h1>You’re unsubscribed.</h1><p>You will no longer receive the Oynk newsletter.</p></main></body></html>');}
  catch {response.status(503).send('Unable to unsubscribe right now. Please try again shortly.');}
});
