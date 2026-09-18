import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHmac, generateKeyPairSync, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';

test('funding database: identity, concurrency, exact amount, replay and reconciliation', {skip:!process.env.FUNDING_TEST_DATABASE_URL}, async () => {
 const url = new URL(process.env.FUNDING_TEST_DATABASE_URL!);
 if (url.hostname!=='127.0.0.1' || !['5433','55439'].includes(url.port) || url.pathname!=='/oynk_funding_test') throw new Error('Use only the isolated funding test database.');
 const schema = `funding_test_${randomUUID().replaceAll('-','')}`;
 url.searchParams.set('options',`-c search_path=${schema}`);
 process.env.DATABASE_URL=url.toString(); process.env.PAYSTACK_SECRET_KEY='sk_test_fixture_not_a_key';
 const keys=generateKeyPairSync('rsa',{modulusLength:2048});
 process.env.SOCKETFI_CLIENT_SECRET='fixture-client-secret';
 const {pool}=await import('../db/pool.js'); const service=await import('./service.js');
 const {consumerIdentity}=await import('./auth.js'); const {validSignature}=await import('./paystack.js');
 const originalFetch=globalThis.fetch;
 try {
  globalThis.fetch=async () => Response.json({alg:'RS256',issuer:'https://socket.fi',kid:'fixture-key',publicKey:keys.publicKey.export({type:'spki',format:'pem'}).toString()});
  await pool.query(`CREATE SCHEMA ${schema}`);
  await pool.query(await readFile(new URL('../db/migrations/002_identity_auth.sql',import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../db/migrations/007_consumer_funding.sql',import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../db/migrations/012_ramp_control.sql',import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../db/migrations/014_harden_ramp_audit.sql',import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../db/migrations/015_deposit_failures.sql',import.meta.url),'utf8'));
  const identity={subject:'fixture',clientId:'sf_client_live_u3zqxglr2dhozi7z5z73o3wchwkm',network:'TESTNET' as const,wallet:'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',authMethod:'passkey' as const};
  const token=await new SignJWT({type:'access',clientId:identity.clientId,network:identity.network,activeWallet:identity.wallet,wallet:{TESTNET:identity.wallet},authMethods:{passkey:true,evm:false}}).setProtectedHeader({alg:'RS256'}).setIssuer('https://socket.fi').setAudience(identity.clientId).setSubject(identity.subject).setIssuedAt().setExpirationTime('1h').sign(keys.privateKey);
  assert.deepEqual(await consumerIdentity(`Bearer ${token}`),identity);
  await assert.rejects(()=>consumerIdentity(`Bearer ${token.slice(0,-10)}abcdefghij`));
  const raw=Buffer.from('{"event":"charge.success"}'); const sig=createHmac('sha512','sk_test_fixture_not_a_key').update(raw).digest('hex');
  assert.equal(validSignature(raw,sig),true); assert.equal(validSignature(Buffer.from('{}'),sig),false);
  await service.saveProfile(identity,{firstName:'Ada',lastName:'Obi',email:'ada@example.invalid',phone:'+2348012345678',addressLine:'10 Test Street',city:'Lagos',state:'Lagos',country:'NG'});
  await assert.rejects(()=>service.accountFor({...identity,wallet:'C'+'A'.repeat(55)}));
  let posts=0; const paid=new Map<string,any>();
  globalThis.fetch=async (input,init) => {
   const path=new URL(String(input)).pathname;
   if (path==='/charge' && init?.method==='POST') { posts++; const body=JSON.parse(String(init.body)); return Response.json({status:true,data:{reference:body.reference,status:'pending_bank_transfer',account_number:'0123456789',account_name:'PAYSTACK CHECKOUT',bank:{name:'Test Bank'},account_expires_at:new Date(Date.now()+1800000).toISOString()}}); }
   if (path.startsWith('/transaction/verify/')) { const reference=path.split('/').at(-1)!; return Response.json({status:true,data:paid.get(reference)??{reference,domain:'test',status:'pending'}}); }
   throw new Error('Unexpected external call');
  };
  const q=await service.createQuote(identity,'10000');
  await Promise.all([service.startDeposit(identity,q.reference,true),service.startDeposit(identity,q.reference,true)]);
  assert.equal(posts,1);
  const status=await service.fundingStatus(identity); assert.equal(status.limits.reservedKobo,q.depositKobo);
  assert.equal(status.limits.remainingKobo,'5000000');
  assert.equal(status.limits.availableToRequestKobo,'4000000');
  const other=await service.createQuote(identity,'30000');
  const competing=await service.createQuote(identity,'30000');
  const results=await Promise.allSettled([service.startDeposit(identity,other.reference,true),service.startDeposit(identity,competing.reference,true)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  await assert.rejects(()=>service.getDeposit({...identity,subject:'other'},q.reference));
  paid.set(q.reference,{reference:q.reference,domain:'test',status:'success',id:1,amount:Number(q.totalKobo),fees:Number(q.feeKobo),paid_at:new Date().toISOString(),currency:'NGN',channel:'bank_transfer'});
  await Promise.all([service.reconcile(q.reference),service.reconcile(q.reference)]);
  assert.equal((await service.fundingStatus(identity)).receipts.length,1);
  assert.equal((await service.getDeposit(identity,q.reference)).state,'received');
  assert.equal((await service.fundingStatus(identity)).limits.remainingKobo,'4000000');
  // Wrong amount is recorded for review, never silently credited as the quoted value.
  const pending=(await service.fundingStatus(identity)).pending[0];
  paid.set(pending.reference,{...paid.get(q.reference),reference:pending.reference,id:2,amount:12345});
  await service.reconcile(pending.reference);
  assert.equal((await service.getDeposit(identity,pending.reference)).state,'review');
  assert.equal((await service.fundingStatus(identity)).limits.remainingKobo,'4000000');
  const secondIdentity={...identity,subject:'fixture-two',wallet:'CDTDCQ2Y6OASQVJGOFBA2EHP3AV7N6FFULJNEFGMORLYMNHECX7OO2W6'};
  await service.saveProfile(secondIdentity,{firstName:'Test',lastName:'Person',email:'second@example.invalid',phone:'+2348012345679',addressLine:'11 Test Street',city:'Lagos',state:'Lagos',country:'NG'});
  const full=await service.createQuote(secondIdentity,'50000');
  assert.ok(BigInt(full.totalKobo)>5000000n); // Fees may sit above the principal limit.
  await service.startDeposit(secondIdentity,full.reference,true);
  assert.equal((await service.fundingStatus(secondIdentity)).limits.remainingKobo,'5000000');
  await assert.rejects(()=>service.createQuote(secondIdentity,'50')); // Hidden reservation still prevents overbooking.
  paid.set(full.reference,{...paid.get(q.reference),reference:full.reference,id:3,amount:Number(full.totalKobo),fees:Number(full.feeKobo)});
  await service.reconcile(full.reference);
  assert.equal((await service.fundingStatus(secondIdentity)).limits.remainingKobo,'0');
  assert.equal((await service.fundingStatus(identity)).settlement,'not_available');
 } finally { globalThis.fetch=originalFetch; await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); }
});
