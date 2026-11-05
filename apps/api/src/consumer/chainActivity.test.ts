import assert from 'node:assert/strict';
import test from 'node:test';
import { Keypair, StrKey, nativeToScVal } from '@stellar/stellar-sdk';
import { serializeChainArgs, validateChainIntent } from './chainActivity.js';
import { usdcContracts } from './stellarBalance.js';
const wallet=StrKey.encodeContract(Buffer.alloc(32,1)),recipient=Keypair.random().publicKey(),pool=StrKey.encodeContract(Buffer.alloc(32,2));
const identity={wallet,network:'TESTNET' as const};
const encoded=(v:unknown,type:string)=>nativeToScVal(v,{type}).toXDR('base64');
test('tracking accepts only exact, positive wallet transfers and pool calls',()=>{
 const transfer={sessionReference:'session-1',contractId:usdcContracts.TESTNET,callFunction:{name:'transfer'},argsXdr:[encoded(wallet,'address'),encoded(recipient,'address'),encoded(10_000_000n,'i128')]};
 assert.equal(validateChainIntent(identity,transfer,pool).amountAtomic,'10000000');
 assert.throws(()=>validateChainIntent(identity,{...transfer,contractId:usdcContracts.PUBLIC},pool));
 assert.throws(()=>validateChainIntent(identity,{...transfer,argsXdr:[encoded(recipient,'address'),...transfer.argsXdr.slice(1)]},pool));
 assert.throws(()=>validateChainIntent(identity,{...transfer,argsXdr:[...transfer.argsXdr.slice(0,2),encoded(-1n,'i128')]},pool));
 for(const method of ['contribute','redeem'])assert.equal(validateChainIntent(identity,{sessionReference:'session-2',contractId:pool,callFunction:{name:method},argsXdr:[encoded(wallet,'address'),encoded(100n,'i128'),nativeToScVal(Buffer.alloc(32)).toXDR('base64')]},pool).kind,method==='contribute'?'CONTRIBUTE':'REDEEM');
});
test('chain arguments are stored as JSON rather than a PostgreSQL array literal',()=>{
 const args=['AAAA','BBBB'];
 assert.deepEqual(JSON.parse(serializeChainArgs(args)),args);
 assert.equal(serializeChainArgs(args),'["AAAA","BBBB"]');
});
