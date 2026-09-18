import { Account, Address, Contract, Keypair, Networks, TransactionBuilder, nativeToScVal, rpc, xdr } from '@stellar/stellar-sdk';
import { config } from '../config.js';

type Network='TESTNET'|'PUBLIC';
const passphrase=(network:Network)=>network==='TESTNET'?Networks.TESTNET:Networks.PUBLIC;
const endpoint=(network:Network)=>network==='TESTNET'?config.STELLAR_TESTNET_RPC_URL:config.STELLAR_PUBLIC_RPC_URL!;

export function rampProvider(network:Network):string{
 const value=network==='TESTNET'?config.OYNK_RAMP_PROVIDER_TESTNET:config.OYNK_RAMP_PROVIDER_PUBLIC;
 if(!/^G[A-Z2-7]{55}$/.test(value))throw new Error(`Oynk ${network} ramp provider is not configured.`);
 return value;
}

function signer(network:Network):Keypair{
 const secret=network==='TESTNET'?config.OYNK_RAMP_SIGNER_SECRET_TESTNET:config.OYNK_RAMP_SIGNER_SECRET_PUBLIC;
 if(!secret)throw new Error(`Oynk ${network} ramp signer is not configured.`);
 const key=Keypair.fromSecret(secret);
 if(key.publicKey()!==rampProvider(network))throw new Error(`Oynk ${network} ramp signer does not match the configured provider.`);
 return key;
}

export async function submitRampInvocation(network:Network,contractId:string,method:string,args:xdr.ScVal[]):Promise<string>{
 const key=signer(network);const server=new rpc.Server(endpoint(network),{allowHttp:false});
 const source=await server.getAccount(key.publicKey());
 const transaction=new TransactionBuilder(new Account(source.accountId(),source.sequenceNumber()),{fee:'1000000',networkPassphrase:passphrase(network)})
  .addOperation(new Contract(contractId).call(method,...args)).setTimeout(120).build();
 const prepared=await server.prepareTransaction(transaction);prepared.sign(key);
 const sent=await server.sendTransaction(prepared);
 if(sent.status==='ERROR')throw new Error(`Soroban rejected ${method}.`);
 const deadline=Date.now()+120_000;
 while(Date.now()<deadline){
  const result=await server.getTransaction(sent.hash);
  if(result.status===rpc.Api.GetTransactionStatus.SUCCESS)return sent.hash;
  if(result.status===rpc.Api.GetTransactionStatus.FAILED)throw new Error(`Soroban ${method} failed.`);
  await new Promise(resolve=>setTimeout(resolve,1500));
 }
 throw new Error(`Soroban ${method} confirmation timed out.`);
}

export function bytes32(value:string):xdr.ScVal{if(!/^[0-9a-f]{64}$/i.test(value))throw new Error('Invalid bytes32 value.');return xdr.ScVal.scvBytes(Buffer.from(value,'hex'));}
export function contractAddress(value:string):xdr.ScVal{return Address.fromString(value).toScVal();}
export function i128(value:string|bigint):xdr.ScVal{return nativeToScVal(BigInt(value),{type:'i128'});}
export function u64(value:string|bigint):xdr.ScVal{return nativeToScVal(BigInt(value),{type:'u64'});}
export function u32(value:number):xdr.ScVal{return nativeToScVal(value,{type:'u32'});}
