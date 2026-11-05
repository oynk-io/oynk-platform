import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { Wallet } from 'ethers';
import { approvalDigest, canonicalPayload, verifyOwnerProof } from './approvalProof.js';

const scope={clientId:'oynk',subject:'user',network:'TESTNET',wallet:'wallet-a'};
const digest=approvalDigest(scope,'nonce-a','OFFLINE_PAY_CONFIGURE','settings-a','2030-01-01T00:00:00.000Z');
test('EVM approval binds the action, owner, wallet, network, nonce, expiry and payload',async()=>{
 const owner=Wallet.createRandom(),attacker=Wallet.createRandom();
 const proof={kind:'evm',signature:await owner.signMessage(digest)};
 const key={evm:owner.address,passkey:null,rpIdHash:null,paused:false};
 assert.equal(verifyOwnerProof(digest,proof,key,'socket.fi',[]),true);
 for(const changed of [approvalDigest({...scope,network:'PUBLIC'},'nonce-a','OFFLINE_PAY_CONFIGURE','settings-a','2030-01-01T00:00:00.000Z'),approvalDigest({...scope,wallet:'wallet-b'},'nonce-a','OFFLINE_PAY_CONFIGURE','settings-a','2030-01-01T00:00:00.000Z'),approvalDigest(scope,'nonce-b','OFFLINE_PAY_CONFIGURE','settings-a','2030-01-01T00:00:00.000Z'),approvalDigest(scope,'nonce-a','MART_PAYMENT','settings-a','2030-01-01T00:00:00.000Z'),approvalDigest(scope,'nonce-a','OFFLINE_PAY_CONFIGURE','different-pin','2030-01-01T00:00:00.000Z'),approvalDigest(scope,'nonce-a','OFFLINE_PAY_CONFIGURE','settings-a','2031-01-01T00:00:00.000Z')])assert.equal(verifyOwnerProof(changed,proof,key,'socket.fi',[]),false);
 assert.equal(verifyOwnerProof(digest,proof,{...key,evm:attacker.address},'socket.fi',[]),false);
 assert.equal(verifyOwnerProof(digest,proof,{...key,paused:true},'socket.fi',[]),false);
 assert.equal(verifyOwnerProof(digest,{accessToken:'fresh-signin-token'},key,'socket.fi',[]),false);
});
test('passkey approval requires the current P-256 key, exact challenge, RP, allowed origin and verified user',()=>{
 const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=publicKey.export({format:'jwk'});
 const rpHash=createHash('sha256').update('socket.fi').digest();
 const owner={evm:null,passkey:Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x!,'base64url'),Buffer.from(jwk.y!,'base64url')]),rpIdHash:rpHash,paused:false};
 const proof=(origin='https://socket.fi',flags=5,challenge=digest.toString('base64url'))=>{
  const client=Buffer.from(JSON.stringify({type:'webauthn.get',challenge,origin,crossOrigin:false}));
  const auth=Buffer.concat([rpHash,Buffer.from([flags,0,0,0,1])]);
  const signature=sign('sha256',Buffer.concat([auth,createHash('sha256').update(client).digest()]),privateKey);
  return{kind:'passkey',assertion:{type:'public-key',response:{clientDataJSON:client.toString('base64url'),authenticatorData:auth.toString('base64url'),signature:signature.toString('base64url')}}};
 };
 assert.equal(verifyOwnerProof(digest,proof(),owner,'socket.fi',['https://socket.fi']),true);
 assert.equal(verifyOwnerProof(digest,proof('https://attacker.invalid'),owner,'socket.fi',['https://socket.fi']),false);
 assert.equal(verifyOwnerProof(digest,proof('https://socket.fi',1),owner,'socket.fi',['https://socket.fi']),false);
 assert.equal(verifyOwnerProof(digest,proof('https://socket.fi',5,'wrong-challenge'),owner,'socket.fi',['https://socket.fi']),false);
 assert.equal(verifyOwnerProof(digest,proof(),{...owner,rpIdHash:Buffer.alloc(32)},'socket.fi',['https://socket.fi']),false);
 assert.equal(verifyOwnerProof(digest,proof(),owner,'other.fi',['https://socket.fi']),false);
});
test('canonical approval payloads are stable but never collapse altered values',()=>{
 assert.equal(canonicalPayload({b:2,a:'1'}),canonicalPayload({a:'1',b:2}));
 assert.notEqual(canonicalPayload({limit:'1000',pin:'a'}),canonicalPayload({limit:'1000',pin:'b'}));
 assert.throws(()=>canonicalPayload({amount:1.5}));
});
