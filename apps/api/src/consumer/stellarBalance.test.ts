import assert from 'node:assert/strict';
import test from 'node:test';
import { StrKey, Networks, TransactionBuilder, scValToNative, nativeToScVal } from '@stellar/stellar-sdk';
import { stellarBalance, usdcContracts } from './stellarBalance.js';
const identity = {wallet:'CDTDCQ2Y6OASQVJGOFBA2EHP3AV7N6FFULJNEFGMORLYMNHECX7OO2W6',network:'TESTNET' as const};
function fixture(overrides: Record<string,unknown> = {}, passphrase = Networks.TESTNET): typeof fetch {
 return async (_url,init) => {
  const body = JSON.parse(String(init?.body));
  assert.equal(init?.redirect,'error');
  assert.ok(['getNetwork','simulateTransaction'].includes(body.method));
  if(body.method==='getNetwork') return Response.json({jsonrpc:'2.0',id:body.id,result:{passphrase}});
  const tx = TransactionBuilder.fromXDR(body.params.transaction,Networks.TESTNET);
  assert.equal(tx.signatures.length,0);
  assert.equal(tx.operations.length,1);
  const op=tx.operations[0];assert.equal(op.type,'invokeHostFunction');
  if(op.type!=='invokeHostFunction') throw new Error('Unexpected operation');
  const invocation=op.func.invokeContract();
  assert.equal(StrKey.encodeContract(Buffer.from(invocation.contractAddress().contractId() as unknown as Uint8Array)),usdcContracts.TESTNET);
  assert.equal(invocation.functionName().toString(),'balance');
  assert.equal(scValToNative(invocation.args()[0]),identity.wallet);
  return Response.json({jsonrpc:'2.0',id:body.id,result:{latestLedger:123,results:[{xdr:nativeToScVal(200000000n,{type:'i128'}).toXDR('base64')}],...overrides}});
 };
}
test('reads exact USDC from an unsigned smart-account simulation', async()=>{
 const value=await stellarBalance(identity,fixture());
 assert.equal(value.tokens[0].atomicBalance,'200000000');assert.equal(value.walletAddress,identity.wallet);
 assert.equal(value.tokens[0].contract,usdcContracts.TESTNET);
});
test('RPC failures, wrong networks and malformed values never become zero balances',async()=>{
 for(const override of [{error:'unavailable'},{results:[]},{results:[{xdr:'invalid'}]},{results:[{xdr:nativeToScVal(-1n,{type:'i128'}).toXDR('base64')}]},{results:[{xdr:nativeToScVal('20').toXDR('base64')}]},{latestLedger:0}]) await assert.rejects(stellarBalance(identity,fixture(override)));
 await assert.rejects(stellarBalance(identity,fixture({},Networks.PUBLIC)));
 await assert.rejects(stellarBalance({...identity,wallet:'invalid'},fixture()));
});
