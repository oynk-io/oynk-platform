import assert from 'node:assert/strict';
import test from 'node:test';

process.env.VFD_CONSUMER_KEY='sandbox-consumer-key';
process.env.VFD_CONSUMER_SECRET='sandbox-consumer-secret';
process.env.VFD_ENVIRONMENT='TEST';

const response=(body:unknown)=>Response.json(body);

test('existing VFD sandbox identity recovers its account after an ambiguous timeout',async()=>{
 const {clearVfdTokenForTests}=await import('./vfdClient.js');
 const {vfdDepositAccountProvider}=await import('./vfdDepositAccount.js');
 clearVfdTokenForTests();const original=globalThis.fetch;
 globalThis.fetch=(async input=>{
  const url=String(input);
  if(url.includes('/baasauth/token'))return response({status:'00',data:{access_token:'0123456789abcdef0123456789abcdef',expires_in:3600}});
  if(url.includes('/client/tiers/individual'))return response({status:'01',message:'Client Account Exists',data:{accountNo:'1001708398'}});
  if(url.includes('/account/enquiry?accountNumber=1001708398'))return response({status:'00',data:{accountNo:'1001708398',accountBalance:'0.000000',client:'Oynk Technologies-Golden Rice Tim',accountId:'8398',clientId:'golden'}});
  throw new Error(`Unexpected request: ${url}`);
 }) as typeof fetch;
 try{assert.deepEqual(await vfdDepositAccountProvider.createIndividual({identityType:'nin',identityNumber:'11380234201',dateOfBirth:'1994-04-05'}),{
  accountNumber:'1001708398',accountName:'Oynk Technologies-Golden Rice Tim',bankName:'VFD Microfinance Bank',firstName:null,middleName:null,lastName:null,providerTier:1,providerCustomerReference:'golden',providerAccountReference:'8398',
 });}finally{globalThis.fetch=original;clearVfdTokenForTests();}
});

test('retries VFD status 99 once and recovers the existing account',async()=>{
 const {clearVfdTokenForTests}=await import('./vfdClient.js');
 const {vfdDepositAccountProvider}=await import('./vfdDepositAccount.js');
 clearVfdTokenForTests();const original=globalThis.fetch;let creationCalls=0;
 globalThis.fetch=(async input=>{
  const url=String(input);
  if(url.includes('/baasauth/token'))return response({status:'00',data:{access_token:'0123456789abcdef0123456789abcdef',expires_in:3600}});
  if(url.includes('/client/tiers/individual')){
   creationCalls++;
   return creationCalls===1
    ?response({status:'99',message:'Account creation failed. Please push another account creation request.'})
    :response({status:'01',message:'Client Account Exists',data:{accountNo:'1001708398',accountName:'Test Customer',currentTier:'1'}});
  }
  throw new Error(`Unexpected request: ${url}`);
 }) as typeof fetch;
 try{
  const created=await vfdDepositAccountProvider.createIndividual({identityType:'nin',identityNumber:'11380234201',dateOfBirth:'1994-04-05'});
  assert.equal(created.accountNumber,'1001708398');
  assert.equal(created.accountName,'Test Customer');
  assert.equal(creationCalls,2);
 }finally{globalThis.fetch=original;clearVfdTokenForTests();}
});

test('VFD tier upgrades implement both documented Tier 2 paths and Tier 2 to Tier 3',async()=>{
 const {clearVfdTokenForTests}=await import('./vfdClient.js');
 const {vfdDepositAccountProvider}=await import('./vfdDepositAccount.js');
 clearVfdTokenForTests();const original=globalThis.fetch;const bodies:Record<string,unknown>[]=[];
 globalThis.fetch=(async(input,init)=>{
  const url=String(input);
  if(url.includes('/baasauth/token'))return response({status:'00',data:{access_token:'0123456789abcdef0123456789abcdef',expires_in:3600}});
  if(url.includes('/client/update')){const body=JSON.parse(String(init?.body));bodies.push(body);return response({status:'00',data:{currentTier:'address' in body?'3':'2'}});}
  throw new Error(`Unexpected request: ${url}`);
 }) as typeof fetch;
 try{
  assert.equal((await vfdDepositAccountProvider.upgradeIndividual({accountNumber:'1001708398',targetTier:2,identityType:'bvn',identityNumber:'22222222252'})).providerTier,2);
  assert.equal((await vfdDepositAccountProvider.upgradeIndividual({accountNumber:'1001708399',targetTier:2,identityType:'nin',identityNumber:'01947597293'})).providerTier,2);
  assert.equal((await vfdDepositAccountProvider.upgradeIndividual({accountNumber:'1001708398',targetTier:3,address:'1 Marina Road, Lagos, Lagos'})).providerTier,3);
  assert.deepEqual(bodies,[{accountNo:'1001708398',bvn:'22222222252'},{accountNo:'1001708399',nin:'01947597293'},{accountNo:'1001708398',address:'1 Marina Road, Lagos, Lagos'}]);
 }finally{globalThis.fetch=original;clearVfdTokenForTests();}
});

test('VFD tier upgrade does not advance when currentTier is missing or wrong',async()=>{
 const {clearVfdTokenForTests}=await import('./vfdClient.js');
 const {vfdDepositAccountProvider}=await import('./vfdDepositAccount.js');
 const original=globalThis.fetch;
 for(const data of [{},{currentTier:'1'}]){
  clearVfdTokenForTests();
  globalThis.fetch=(async input=>{
   const url=String(input);
   if(url.includes('/baasauth/token'))return response({status:'00',data:{access_token:'0123456789abcdef0123456789abcdef',expires_in:3600}});
   if(url.includes('/client/update'))return response({status:'00',data});
   throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  await assert.rejects(()=>vfdDepositAccountProvider.upgradeIndividual({accountNumber:'1001708398',targetTier:2,identityType:'bvn',identityNumber:'22222222252'}),/unexpected account tier/i);
 }
 globalThis.fetch=original;clearVfdTokenForTests();
});

test('VFD receives its documented BVN date format while the app keeps ISO dates',async()=>{
 const {clearVfdTokenForTests}=await import('./vfdClient.js');
 const {vfdDepositAccountProvider}=await import('./vfdDepositAccount.js');
 clearVfdTokenForTests();const original=globalThis.fetch;let creationUrl='';
 globalThis.fetch=(async input=>{
  const url=String(input);
  if(url.includes('/baasauth/token'))return response({status:'00',data:{access_token:'0123456789abcdef0123456789abcdef',expires_in:3600}});
  if(url.includes('/client/tiers/individual')){creationUrl=url;return response({status:'00',data:{accountNo:'1001708399',accountName:'Test Customer',currentTier:'1'}});}
  throw new Error(`Unexpected request: ${url}`);
 }) as typeof fetch;
 try{
  await vfdDepositAccountProvider.createIndividual({identityType:'bvn',identityNumber:'22222222252',dateOfBirth:'1994-04-05'});
  const url=new URL(creationUrl);assert.equal(url.searchParams.get('bvn'),'22222222252');assert.equal(url.searchParams.get('dateOfBirth'),'05-Apr-1994');
 }finally{globalThis.fetch=original;clearVfdTokenForTests();}
});
