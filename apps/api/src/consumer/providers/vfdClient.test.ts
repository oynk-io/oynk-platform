import assert from 'node:assert/strict';
import test from 'node:test';

process.env.VFD_CONSUMER_KEY='sandbox-consumer-key';
process.env.VFD_CONSUMER_SECRET='sandbox-consumer-secret';
process.env.VFD_ENVIRONMENT='TEST';

test('VFD exchanges server credentials and sends only the access token to wallet APIs',async()=>{
 const{clearVfdTokenForTests,vfdRequest}=await import('./vfdClient.js');clearVfdTokenForTests();let calls=0;
 const request=async(input:string|URL|Request,init?:RequestInit)=>{
  calls++;const url=String(input);
  if(url.includes('/baasauth/token')){
   const body=JSON.parse(String(init?.body));assert.equal(body.consumerKey,'sandbox-consumer-key');assert.equal(body.consumerSecret,'sandbox-consumer-secret');
   return Response.json({status:'00',message:'Successful',data:{access_token:'sandbox-access-token-value',expires_in:3600}});
  }
  assert.ok(url.endsWith('/vtech-wallet/api/v2/wallet2/account/enquiry'));assert.equal(new Headers(init?.headers).get('AccessToken'),'sandbox-access-token-value');
  assert.equal(new Headers(init?.headers).has('Authorization'),false);return Response.json({status:'00',message:'Successful',data:{accountNo:'1000000000'}});
 };
 const value=await vfdRequest('/account/enquiry',{},request as typeof fetch);assert.equal((value.data as any).accountNo,'1000000000');assert.equal(calls,2);
});

test('VFD classifies a provider validation response as a definitive rejection',async()=>{
 const{clearVfdTokenForTests,VfdError,vfdRequest}=await import('./vfdClient.js');clearVfdTokenForTests();
 const request=async(input:string|URL|Request)=>String(input).includes('/baasauth/token')
  ?Response.json({status:'00',data:{access_token:'sandbox-access-token-value',expires_in:3600}})
  :Response.json({status:'102',message:'Invalid NIN'});
 await assert.rejects(()=>vfdRequest('/client/tiers/individual?nin=00000000000',{method:'POST',body:{}},request as typeof fetch),error=>error instanceof VfdError&&error.kind==='rejected'&&error.code==='VFD_102');
});

test('VFD classifies denied wallet access as provider configuration',async()=>{
 const{clearVfdTokenForTests,VfdError,vfdRequest}=await import('./vfdClient.js');clearVfdTokenForTests();
 const request=async(input:string|URL|Request)=>String(input).includes('/baasauth/token')
  ?Response.json({status:'00',data:{access_token:'sandbox-access-token-value',expires_in:3600}})
  :Response.json({status:'929',message:'Access Denied'},{status:403});
 await assert.rejects(()=>vfdRequest('/client/tiers/individual?nin=23230042941',{method:'POST',body:{}},request as typeof fetch),error=>error instanceof VfdError&&error.kind==='configuration'&&error.code==='VFD_929');
});

test('VFD refreshes a stale wallet token once and retries the original request',async()=>{
 const{clearVfdTokenForTests,vfdRequest}=await import('./vfdClient.js');clearVfdTokenForTests();let authCalls=0,walletCalls=0;
 const request=async(input:string|URL|Request,init?:RequestInit)=>{
  if(String(input).includes('/baasauth/token')){authCalls++;return Response.json({status:'00',data:{access_token:`sandbox-access-token-${authCalls}`,expires_in:3600}});}
  walletCalls++;const token=new Headers(init?.headers).get('AccessToken');
  if(token==='sandbox-access-token-1')return Response.json({status:'01',message:'Invalid wallet token'});
  assert.equal(token,'sandbox-access-token-2');return Response.json({status:'00',data:{accountNo:'1001708305'}});
 };
 const value=await vfdRequest('/account/enquiry?accountNumber=1001708305',{},request as typeof fetch);
 assert.equal((value.data as any).accountNo,'1001708305');assert.equal(authCalls,2);assert.equal(walletCalls,2);
});
