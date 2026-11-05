import assert from 'node:assert/strict';
import test from 'node:test';
import {Address,Networks,nativeToScVal,xdr} from '@stellar/stellar-sdk';
import {currentOwner} from './approvals.js';
const wallet='CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA';
const identity={subject:'fixture',clientId:'oynk',wallet,network:'TESTNET' as const,authMethod:'device' as const};
function entry(){
 const data=new xdr.ContractDataEntry({ext:new xdr.ExtensionPoint(0),contract:new Address(wallet).toScAddress(),key:xdr.ScVal.scvLedgerKeyContractInstance(),durability:xdr.ContractDataDurability.persistent(),val:xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({executable:xdr.ContractExecutable.contractExecutableWasm(Buffer.alloc(32)),storage:[['EvmSigner',Buffer.alloc(20,7)],['RpidHash',Buffer.alloc(32,8)],['Paused',true]].map(([name,value])=>new xdr.ScMapEntry({key:xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(String(name))]),val:nativeToScVal(value)}))}))});
 return xdr.LedgerEntryData.contractData(data).toXDR('base64');
}
test('owner verification reads the exact contract storage and rejects a wrong RPC network or ledger key',async()=>{
 let wrongNetwork=false,wrongKey=false;
 const request=(async(_url,init)=>{const body=JSON.parse(String(init?.body));return Response.json({jsonrpc:'2.0',id:body.id,result:body.method==='getNetwork'?{passphrase:wrongNetwork?Networks.PUBLIC:Networks.TESTNET}:{entries:[{key:wrongKey?'different-key':body.params.keys[0],xdr:entry()}]}});}) as typeof fetch;
 const owner=await currentOwner(identity,request);
 assert.equal(owner.evm,`0x${'07'.repeat(20)}`);assert.equal(owner.paused,true);assert.deepEqual(owner.rpIdHash,Buffer.alloc(32,8));
 wrongNetwork=true;await assert.rejects(()=>currentOwner(identity,request),/could not be checked/);
 wrongNetwork=false;wrongKey=true;await assert.rejects(()=>currentOwner(identity,request),/could not be checked/);
});
