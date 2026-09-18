import assert from 'node:assert/strict';
import test from 'node:test';
import { StrKey, Networks, TransactionBuilder, scValToNative, nativeToScVal } from '@stellar/stellar-sdk';
import { orchestratorOfframpQuote, orchestratorOnrampQuote, poolPosition, stellarBalance, usdcContracts } from './stellarBalance.js';
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

test('reads pool position and redeemable amount through separate Soroban simulations',async()=>{
 const pool='CAHXUOFBIST7KJ25GU44KSPXUZXDO3NBAHXUPK5UEXTV6PNT3HG2P6K3';
 const methods:string[]=[];
 const request:typeof fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));const tx=TransactionBuilder.fromXDR(body.params.transaction,Networks.TESTNET);
  assert.equal(tx.operations.length,1);const op=tx.operations[0];assert.equal(op.type,'invokeHostFunction');
  if(op.type!=='invokeHostFunction')throw new Error('Unexpected operation');
  const invocation=op.func.invokeContract();const method=invocation.functionName().toString();methods.push(method);
  assert.equal(StrKey.encodeContract(Buffer.from(invocation.contractAddress().contractId() as unknown as Uint8Array)),pool);
  assert.equal(scValToNative(invocation.args()[0]),identity.wallet);
  const value=method==='get_position'?nativeToScVal({claimant:identity.wallet,contributed:50_000_000n,units:50_000_000n}):nativeToScVal(30_000_000n,{type:'i128'});
  return Response.json({jsonrpc:'2.0',id:body.id,result:{latestLedger:123,results:[{xdr:value.toXDR('base64')}]}});
 };
 const value=await poolPosition(identity,pool,request);
 assert.deepEqual(new Set(methods),new Set(['get_position','get_redeemable']));
 assert.equal(value.contributedAtomic,'50000000');assert.equal(value.unitsAtomic,'50000000');assert.equal(value.redeemableAtomic,'30000000');
});

test('reads the canonical on-ramp rate and quote from the orchestrator',async()=>{
 const orchestrator='CB433YRZDVSLFYGRDPNZC4RLC2OCFDSEW2ILTUAEZ42D2TDXHGTXAP5L';
 const request: typeof fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));const tx=TransactionBuilder.fromXDR(body.params.transaction,Networks.TESTNET);const op=tx.operations[0];
  assert.equal(op.type,'invokeHostFunction');if(op.type!=='invokeHostFunction')throw new Error('Unexpected operation');
  const invocation=op.func.invokeContract();
  assert.equal(StrKey.encodeContract(Buffer.from(invocation.contractAddress().contractId() as unknown as Uint8Array)),orchestrator);
  assert.equal(invocation.functionName().toString(),'quote_onramp');assert.equal(scValToNative(invocation.args()[0]),1_000_000n);
  const value=nativeToScVal({fiat_amount:1_000_000n,usdc_amount:69_930_069n,fiat_per_usdc:143_000n,rate_version:4n,valid_until_ledger:500});
  return Response.json({jsonrpc:'2.0',id:'ramp-quote',result:{latestLedger:450,results:[{xdr:value.toXDR('base64')}]}});
 };
 const quote=await orchestratorOnrampQuote({network:'TESTNET'},orchestrator,1_000_000n,request);
 assert.deepEqual(quote,{fiatAmount:1_000_000n,usdcAmount:69_930_069n,fiatPerUsdc:143_000n,rateVersion:4n,validUntilLedger:500,latestLedger:450,contractId:orchestrator});
});

test('rejects expired or inconsistent contract rate responses',async()=>{
 const orchestrator='CB433YRZDVSLFYGRDPNZC4RLC2OCFDSEW2ILTUAEZ42D2TDXHGTXAP5L';
 const request: typeof fetch=async()=>Response.json({jsonrpc:'2.0',id:'ramp-quote',result:{latestLedger:501,results:[{xdr:nativeToScVal({fiat_amount:1_000_000n,usdc_amount:69_930_069n,fiat_per_usdc:143_000n,rate_version:4n,valid_until_ledger:500}).toXDR('base64')}]}});
 await assert.rejects(orchestratorOnrampQuote({network:'TESTNET'},orchestrator,1_000_000n,request));
});

test('reads the directional off-ramp quote without recalculating it in the API',async()=>{
 const orchestrator='CB433YRZDVSLFYGRDPNZC4RLC2OCFDSEW2ILTUAEZ42D2TDXHGTXAP5L';
 const request: typeof fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));const tx=TransactionBuilder.fromXDR(body.params.transaction,Networks.TESTNET);const op=tx.operations[0];
  assert.equal(op.type,'invokeHostFunction');if(op.type!=='invokeHostFunction')throw new Error('Unexpected operation');
  const invocation=op.func.invokeContract();assert.equal(invocation.functionName().toString(),'quote_offramp');assert.equal(scValToNative(invocation.args()[0]),10_000_000n);
  return Response.json({jsonrpc:'2.0',id:'ramp-quote',result:{latestLedger:450,results:[{xdr:nativeToScVal({fiat_amount:140_000n,usdc_amount:10_000_000n,fiat_per_usdc:140_000n,rate_version:4n,valid_until_ledger:500}).toXDR('base64')}]}});
 };
 const quote=await orchestratorOfframpQuote({network:'TESTNET'},orchestrator,10_000_000n,request);
 assert.equal(quote.fiatAmount,140_000n);assert.equal(quote.fiatPerUsdc,140_000n);
});
