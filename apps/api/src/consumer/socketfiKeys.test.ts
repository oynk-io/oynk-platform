import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { SignJWT } from 'jose';
import { SocketFiTokenVerifier } from './socketfiKeys.js';

test('SocketFi discovery uses client credentials and shares a 24-hour cached key',async()=>{
 const keys=generateKeyPairSync('rsa',{modulusLength:2048}); let now=Date.now(), calls=0;
 const verifier=new SocketFiTokenVerifier({apiUrl:'https://api.socket.fi',clientId:'fixture',clientSecret:'fixture-secret'},async(input,init)=>{
  calls++; assert.equal(String(input),'https://api.socket.fi/.well-known/socketfi-public-key');
  assert.deepEqual(init?.headers,{'x-socketfi-client-id':'fixture','x-socketfi-client-secret':'fixture-secret'});
  assert.equal(init?.redirect,'error');
  return Response.json({alg:'RS256',issuer:'https://socket.fi',kid:'key-1',publicKey:keys.publicKey.export({type:'spki',format:'pem'})});
 },()=>now);
 const token=()=>new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'key-1'}).setSubject('user').setIssuer('https://socket.fi').setAudience('fixture').setIssuedAt(Math.floor(now/1000)).setExpirationTime(Math.floor(now/1000)+3600).sign(keys.privateKey);
 const first=await token(); await Promise.all(Array.from({length:8},()=>verifier.verify(first))); assert.equal(calls,1);
 await verifier.verify(first); assert.equal(calls,1);
 now+=86400001; await verifier.verify(await token()); assert.equal(calls,2);
});

test('rotated signatures refresh once; forged tokens and unavailable keys fail closed',async()=>{
 const a=generateKeyPairSync('rsa',{modulusLength:2048}),b=generateKeyPairSync('rsa',{modulusLength:2048});
 let now=Date.now(),current=a,calls=0,fail=false;
 const verifier=new SocketFiTokenVerifier({apiUrl:'https://api.socket.fi',clientId:'fixture',clientSecret:'fixture-secret'},async()=>{
  calls++;if(fail)return new Response('',{status:503});
  return Response.json({alg:'RS256',issuer:'https://socket.fi',kid:'key-1',publicKey:current.publicKey.export({type:'spki',format:'pem'})});
 },()=>now);
 const token=(keys:typeof a)=>new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'key-1'}).setSubject('user').setIssuer('https://socket.fi').setAudience('fixture').setIssuedAt(Math.floor(now/1000)).setExpirationTime(Math.floor(now/1000)+3600).sign(keys.privateKey);
 await verifier.verify(await token(a));current=b;now+=6000;
 await verifier.verify(await token(b));assert.equal(calls,2);
 const forged=await token(a);await Promise.all(Array.from({length:5},()=>assert.rejects(()=>verifier.verify(forged))));assert.equal(calls,2);
 now+=86400001;fail=true;await assert.rejects(()=>verifier.verify(forged));assert.equal(calls,3);
 await assert.rejects(()=>verifier.verify(forged));assert.equal(calls,3);
});

test('accepts small issuer clock drift and rejects tokens issued too far in the future',async()=>{
 const keys=generateKeyPairSync('rsa',{modulusLength:2048});const now=Date.now();
 const verifier=new SocketFiTokenVerifier({apiUrl:'https://api.socket.fi',clientId:'fixture',clientSecret:'secret'},async()=>Response.json({alg:'RS256',issuer:'https://socket.fi',kid:'key-1',publicKey:keys.publicKey.export({type:'spki',format:'pem'})}),()=>now);
 const token=(offsetSeconds:number)=>new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'key-1'}).setSubject('user').setIssuer('https://socket.fi').setAudience('fixture').setIssuedAt(Math.floor(now/1000)+offsetSeconds).setExpirationTime(Math.floor(now/1000)+3600).sign(keys.privateKey);
 await verifier.verify(await token(20));
 const tooFarInFuture=await token(31);
 await assert.rejects(()=>verifier.verify(tooFarInFuture));
});

test('key discovery rejects redirects, wrong metadata and unsafe origins',async()=>{
 for(const body of [{alg:'HS256',issuer:'https://socket.fi',publicKey:'bad'},{alg:'RS256',issuer:'https://other.invalid',publicKey:'bad'}]) {
  const verifier=new SocketFiTokenVerifier({apiUrl:'https://api.socket.fi',clientId:'fixture',clientSecret:'secret'},async()=>Response.json(body));
  await assert.rejects(()=>verifier.verify('eyJhbGciOiJSUzI1NiJ9.e30.AA'));
 }
 let calls=0;
 const verifier=new SocketFiTokenVerifier({apiUrl:'http://other.invalid',clientId:'fixture',clientSecret:'secret'},async()=>{calls++;throw Error();});
 await assert.rejects(()=>verifier.verify('eyJhbGciOiJSUzI1NiJ9.e30.AA'));assert.equal(calls,0);
});
