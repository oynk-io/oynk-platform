import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

process.env.VFD_CONSUMER_KEY='sandbox-consumer-key';
process.env.VFD_CONSUMER_SECRET='sandbox-consumer-secret';
process.env.VFD_ENVIRONMENT='TEST';
process.env.VFD_WALLET_PREFIX='oynk';
process.env.VFD_MERCHANT_NAME='Oynk Technologies';
process.env.VFD_PAYOUT_ACCOUNT_NUMBER='1001708257';

const response=(body:unknown)=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});

test('VFD collection creates an exact-amount temporary account in naira',async()=>{
 const {clearVfdTokenForTests}=await import('./vfdClient.js');
 const {vfdRampProvider}=await import('./vfdProvider.js');
 clearVfdTokenForTests();const calls:Array<{url:string;body:any}>=[];
 const original=globalThis.fetch;
 globalThis.fetch=(async(input,init)=>{const url=String(input);const body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({url,body});
  if(url.includes('/baasauth/token'))return response({status:'00',data:{access_token:'0123456789abcdef0123456789abcdef',expires_in:3600}});
  return response({status:'00',message:'Successful',accountNumber:'4600070017',reference:'oynk-123'});
 }) as typeof fetch;
 try{
  const value=await vfdRampProvider.createBankTransfer({reference:'oynk-123',amountMinor:'10150',email:'',accountId:'account-1',expiresAt:new Date(Date.now()+30*60000).toISOString()});
  assert.equal(value.accountNumber,'4600070017');
  assert.deepEqual(calls[1].body,{amount:'101.50',merchantName:'Oynk Technologies',merchantId:'account-1',reference:'oynk-123',validityTime:'30',amountValidation:'A0'});
 }finally{globalThis.fetch=original;clearVfdTokenForTests();}
});

test('VFD payout resolves the corporate sender and submits a signed transfer',async()=>{
 const {clearVfdTokenForTests}=await import('./vfdClient.js');
 const {vfdPayoutProvider,vfdProviderInternals}=await import('./vfdProvider.js');
 clearVfdTokenForTests();const calls:Array<{url:string;body:any}>=[];const original=globalThis.fetch;
 globalThis.fetch=(async(input,init)=>{const url=String(input);const body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({url,body});
  if(url.includes('/baasauth/token'))return response({status:'00',data:{access_token:'0123456789abcdef0123456789abcdef',expires_in:3600}});
  if(url.includes('/account/enquiry'))return response({status:'00',data:{accountNo:'1001708257',accountId:'170825',client:'Oynk Technologies',clientId:'7001'}});
  if(url.includes('/transfer/recipient'))return response({status:'00',data:{name:'Test Recipient',account:{number:'1111111103',id:'recipient-session'},status:'active',currency:'NGN'}});
  return response({status:'00',data:{txnId:'oynk-payout-1',sessionId:'session-1'}});
 }) as typeof fetch;
 try{
  const destination=vfdProviderInternals.encodeDestination({accountName:'Test Recipient',accountNumber:'1111111103',bankCode:'000002'});
  const value=await vfdPayoutProvider.createPayout({reference:'oynk-payout-1',amountMinor:'10000',currency:'NGN',destinationToken:destination,idempotencyKey:'key-1'});
  assert.deepEqual(value,{providerReference:'oynk-payout-1',status:'success'});
  assert.ok(calls.some(call=>call.url.endsWith('/account/enquiry')));
  assert.ok(!calls.some(call=>call.url.includes('/account/enquiry?accountNumber=')));
  const transfer=calls.find(call=>call.url.endsWith('/transfer'))?.body;
  assert.equal(transfer.amount,'100.00');assert.equal(transfer.transferType,'inter');assert.equal(transfer.toSession,'recipient-session');
  assert.equal(transfer.signature,createHash('sha512').update('10017082571111111103').digest('hex'));
 }finally{globalThis.fetch=original;clearVfdTokenForTests();}
});

test('VFD payout rejects a pool account that differs from the configured Oynk account',async()=>{
 const {clearVfdTokenForTests}=await import('./vfdClient.js');
 const {vfdPayoutProvider,vfdProviderInternals}=await import('./vfdProvider.js');
 clearVfdTokenForTests();const original=globalThis.fetch;
 globalThis.fetch=(async input=>{
  const url=String(input);
  if(url.includes('/baasauth/token'))return response({status:'00',data:{access_token:'0123456789abcdef0123456789abcdef',expires_in:3600}});
  if(url.endsWith('/account/enquiry'))return response({status:'00',data:{accountNo:'1001708999'}});
  throw new Error(`Unexpected request: ${url}`);
 }) as typeof fetch;
 try{
  const destination=vfdProviderInternals.encodeDestination({accountName:'Test Recipient',accountNumber:'1111111103',bankCode:'000002'});
  await assert.rejects(
   vfdPayoutProvider.createPayout({reference:'oynk-payout-2',amountMinor:'10000',currency:'NGN',destinationToken:destination,idempotencyKey:'key-2'}),
   (error:any)=>error?.code==='VFD_PAYOUT_ACCOUNT_MISMATCH',
  );
 }finally{globalThis.fetch=original;clearVfdTokenForTests();}
});

test('VFD status mapping keeps ambiguous responses in reconciliation',async()=>{
 const {vfdProviderInternals}=await import('./vfdProvider.js');
 assert.equal(vfdProviderInternals.payoutStatus('00'),'success');
 assert.equal(vfdProviderInternals.payoutStatus('26'),'success');
 assert.equal(vfdProviderInternals.payoutStatus('01'),'processing');
 assert.equal(vfdProviderInternals.payoutStatus('09'),'processing');
 assert.equal(vfdProviderInternals.payoutStatus('25'),'processing');
 assert.equal(vfdProviderInternals.payoutStatus('UNDOCUMENTED'),'processing');
 assert.equal(vfdProviderInternals.payoutStatus('99'),'failed');
});

test('VFD dedicated transfer explicitly enquires for the customer source account',async()=>{
 const {clearVfdTokenForTests}=await import('./vfdClient.js');const {vfdPayoutProvider,vfdProviderInternals}=await import('./vfdProvider.js');clearVfdTokenForTests();const original=globalThis.fetch;const calls:string[]=[];
 globalThis.fetch=(async(input,init)=>{const url=String(input);calls.push(url);
  if(url.includes('/baasauth/token'))return response({status:'00',data:{access_token:'0123456789abcdef0123456789abcdef',expires_in:3600}});
  if(url.includes('/account/enquiry?accountNumber=1001708305'))return response({status:'00',data:{accountNo:'1001708305',accountId:'8305',client:'Phil Bull',clientId:'71',availableBalance:'26720.000000'}});
  if(url.includes('/transfer/recipient'))return response({status:'00',data:{name:'Oynk Technologies',clientId:'7001',account:{number:'1001708257',id:'170825'}}});
  if(url.endsWith('/transfer'))return response({status:'00',data:{txnId:'dedicated-transfer-1'}});
  throw new Error(`Unexpected request: ${url} ${String(init?.body??'')}`);
 }) as typeof fetch;
 try{const destination=vfdProviderInternals.encodeDestination({accountName:'Oynk Technologies',accountNumber:'1001708257',bankCode:'999999'});const value=await vfdPayoutProvider.createPayout({reference:'collect-1',amountMinor:'1430000',currency:'NGN',destinationToken:destination,idempotencyKey:'collect-1',sourceAccountNumber:'1001708305'});assert.equal(value.status,'success');assert.ok(calls.some(url=>url.includes('/account/enquiry?accountNumber=1001708305')));}
 finally{globalThis.fetch=original;clearVfdTokenForTests();}
});

test('VFD account balance accepts provider precision when sub-kobo digits are zero',async()=>{
 const {vfdProviderInternals}=await import('./vfdProvider.js');assert.equal(vfdProviderInternals.kobo('1015000.000000'),101500000);
});

test('VFD account enquiry reads the dedicated accountBalance field',async()=>{
 const {clearVfdTokenForTests}=await import('./vfdClient.js');const {vfdAccount}=await import('./vfdProvider.js');clearVfdTokenForTests();const original=globalThis.fetch;
 globalThis.fetch=(async input=>String(input).includes('/baasauth/token')?response({status:'00',data:{access_token:'0123456789abcdef0123456789abcdef',expires_in:3600}}):response({status:'00',data:{accountNo:'1001708305',accountBalance:'41000.000000',client:'Test User'}})) as typeof fetch;
 try{const value=await vfdAccount('1001708305');assert.equal(value.balanceMinor,4_100_000);}
 finally{globalThis.fetch=original;clearVfdTokenForTests();}
});

test('VFD bank list accepts the live sandbox data.bank envelope',async()=>{
 const {clearVfdTokenForTests}=await import('./vfdClient.js');const {vfdPayoutProvider}=await import('./vfdProvider.js');clearVfdTokenForTests();const original=globalThis.fetch;
 globalThis.fetch=(async input=>String(input).includes('/baasauth/token')?response({status:'00',data:{access_token:'0123456789abcdef0123456789abcdef',expires_in:3600}}):response({status:'00',data:{bank:[{name:' VFD MICROFINANCE BANK ',code:'999999'},{name:'WEMA BANK',code:'000017'}]}})) as typeof fetch;
 try{assert.deepEqual(await vfdPayoutProvider.listBanks('NGN'),[{name:'VFD MICROFINANCE BANK',code:'999999'},{name:'WEMA BANK',code:'000017'}]);}finally{globalThis.fetch=original;clearVfdTokenForTests();}
});
