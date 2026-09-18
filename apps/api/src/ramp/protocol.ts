import { Account, Address, Contract, Networks, TransactionBuilder, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { createHash, randomUUID } from 'node:crypto';
import { protocolContracts } from '../consumer/protocol.js';
import { poolStats, stellarBalance, usdcContracts } from '../consumer/stellarBalance.js';
import { submitRampInvocation } from './soroban.js';

type Network='TESTNET'|'PUBLIC';
const source='GAIQAXDNABV3GZUP4DLYJG5IMOCG236HIBNOPZF7IZXP6CL7POSKJFES';
function endpoint(network:Network){return network==='TESTNET'?process.env.STELLAR_TESTNET_RPC_URL||'https://soroban-testnet.stellar.org':process.env.STELLAR_PUBLIC_RPC_URL!;}
function passphrase(network:Network){return network==='TESTNET'?Networks.TESTNET:Networks.PUBLIC;}

async function simulate(network:Network,contractId:string,method:string,args:xdr.ScVal[]=[]){
 const tx=new TransactionBuilder(new Account(source,'0'),{fee:'100',networkPassphrase:passphrase(network)}).addOperation(new Contract(contractId).call(method,...args)).setTimeout(60).build();
 const response=await fetch(endpoint(network),{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(10_000),body:JSON.stringify({jsonrpc:'2.0',id:`control-${method}`,method:'simulateTransaction',params:{transaction:tx.toXDR()}})});
 const body=await response.json() as any;const result=body?.result;const encoded=result?.results?.[0]?.xdr;
 if(!response.ok||body?.error||result?.error||typeof encoded!=='string'||!Number.isSafeInteger(result.latestLedger))throw new Error(`${method} unavailable`);
 return{value:scValToNative(xdr.ScVal.fromXDR(encoded,'base64')),latestLedger:result.latestLedger as number};
}

function jsonSafe(value:unknown):unknown{
 if(typeof value==='bigint')return value.toString();
 if(Buffer.isBuffer(value)||value instanceof Uint8Array)return Buffer.from(value).toString('hex');
 if(Array.isArray(value))return value.map(jsonSafe);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,jsonSafe(item)]));
 return value;
}

function bytes32(value:string):xdr.ScVal{
 if(!/^[0-9a-f]{64}$/i.test(value))throw new Error('A 32-byte hexadecimal request identifier is required.');
 return xdr.ScVal.scvBytes(Buffer.from(value,'hex'));
}

export async function providerSettlement(network:Network,requestId:string){
 const contracts=protocolContracts(network);
 const result=await simulate(network,contracts.orchestrator,'get_provider_settlement',[bytes32(requestId)]);
 return{network,latestLedger:result.latestLedger,requestId:requestId.toLowerCase(),settlement:jsonSafe(result.value)};
}

export async function settlementFill(network:Network,requestId:string,fillId:string){
 const contracts=protocolContracts(network);
 const result=await simulate(network,contracts.orchestrator,'get_settlement_fill',[bytes32(requestId),bytes32(fillId)]);
 return{network,latestLedger:result.latestLedger,requestId:requestId.toLowerCase(),fillId:fillId.toLowerCase(),fill:jsonSafe(result.value)};
}

export async function corridorRate(network:Network,sourceCurrency:number,destinationCurrency:number){
 const contracts=protocolContracts(network);
 const result=await simulate(network,contracts.orchestrator,'get_corridor_rate',[nativeToScVal(sourceCurrency,{type:'u32'}),nativeToScVal(destinationCurrency,{type:'u32'})]);
 return{network,latestLedger:result.latestLedger,sourceCurrency,destinationCurrency,rate:jsonSafe(result.value)};
}

export async function registeredProvider(network:Network,operator:string){
 const contracts=protocolContracts(network);
 const result=await simulate(network,contracts.providerRegistry,'get_provider',[new Address(operator).toScVal()]);
 return{network,latestLedger:result.latestLedger,operator,provider:jsonSafe(result.value)};
}

export async function orchestratorRequest(network:Network,requestId:string,orchestrator=protocolContracts(network).orchestrator){
 if(!/^C[A-Z2-7]{55}$/.test(orchestrator))throw new Error('Invalid Orchestrator contract.');
 const result=await simulate(network,orchestrator,'get_request',[bytes32(requestId)]);
 return{network,latestLedger:result.latestLedger,requestId:requestId.toLowerCase(),request:jsonSafe(result.value) as Record<string,unknown>|null};
}

export async function protocolOverview(network:Network){
 const contracts=protocolContracts(network);const entries=Object.entries(contracts) as [keyof typeof contracts,string][];
 const balances=await Promise.all(entries.map(async([name,address])=>{try{const value=await stellarBalance({wallet:address,network});return[name,{status:'available',atomic:value.tokens[0].atomicBalance}] as const;}catch{return[name,{status:'unavailable',atomic:null}] as const;}}));
 const [statsResult,reservedResult,bufferResult,ratesResult,rebalanceResult]=await Promise.allSettled([poolStats({network},contracts.pool),simulate(network,contracts.vault,'get_reserved_total'),simulate(network,contracts.vault,'get_buffer_balance'),simulate(network,contracts.orchestrator,'get_rates'),simulate(network,contracts.orchestrator,'get_rebalance_policy')]);
 const latestLedgers:number[]=[];
 if(reservedResult.status==='fulfilled')latestLedgers.push(reservedResult.value.latestLedger);
 if(bufferResult.status==='fulfilled')latestLedgers.push(bufferResult.value.latestLedger);
 if(ratesResult.status==='fulfilled')latestLedgers.push(ratesResult.value.latestLedger);
 if(rebalanceResult.status==='fulfilled')latestLedgers.push(rebalanceResult.value.latestLedger);
 const rates=ratesResult.status==='fulfilled'&&ratesResult.value.value&&typeof ratesResult.value.value==='object'?ratesResult.value.value:null;
 const rebalance=rebalanceResult.status==='fulfilled'&&rebalanceResult.value.value&&typeof rebalanceResult.value.value==='object'?rebalanceResult.value.value:null;
 const vaultBalance=balances.find(([name])=>name==='vault')?.[1].atomic;
 const reservedAtomic=reservedResult.status==='fulfilled'&&typeof reservedResult.value.value==='bigint'?reservedResult.value.value.toString():null;
 const bufferAtomic=bufferResult.status==='fulfilled'&&typeof bufferResult.value.value==='bigint'?bufferResult.value.value.toString():null;
 const availableAtomic=vaultBalance!==null&&vaultBalance!==undefined&&reservedAtomic!==null?(BigInt(vaultBalance)-BigInt(reservedAtomic)).toString():null;
 const requiredUserAtomic=statsResult.status==='fulfilled'?(BigInt(statsResult.value.totalUnitsAtomic)-BigInt(statsResult.value.rwaDeployedAtomic)+BigInt(statsResult.value.pendingRedemptionsAtomic)).toString():null;
 // Expected liquidity is derived from real user claims plus actual Oynk-owned
 // buffer capital. The legacy fixed policy target is deliberately ignored.
 const targetAtomic=requiredUserAtomic!==null&&bufferAtomic!==null?(BigInt(requiredUserAtomic)+BigInt(bufferAtomic)).toString():null;
 const differenceAtomic=availableAtomic!==null&&targetAtomic!==null?(BigInt(availableAtomic)-BigInt(targetAtomic)).toString():null;
 const rateHealth=rates&&latestLedgers.length?Number((rates as any).valid_until_ledger)<=Math.max(...latestLedgers)?'expired':Number((rates as any).valid_until_ledger)-Math.max(...latestLedgers)<=17_280?'expiring':'active':'unavailable';
 return{
  network,asset:{symbol:'USDC',contract:usdcContracts[network],decimals:7},fetchedAt:new Date().toISOString(),latestLedger:latestLedgers.length?Math.max(...latestLedgers):null,
  contracts:Object.fromEntries(entries.map(([name,address])=>[name,{address,status:'configured',explorerUrl:`https://stellar.expert/explorer/${network==='TESTNET'?'testnet':'public'}/contract/${address}`} ])),
  balances:Object.fromEntries(balances),
  vault:{totalAtomic:vaultBalance??null,reservedAtomic,availableAtomic,bufferAtomic,userAvailableAtomic:availableAtomic!==null&&bufferAtomic!==null?(BigInt(availableAtomic)-BigInt(bufferAtomic)>0n?BigInt(availableAtomic)-BigInt(bufferAtomic):0n).toString():null,status:reservedResult.status==='fulfilled'&&bufferResult.status==='fulfilled'&&vaultBalance!==null?'available':'unavailable'},
  pool:statsResult.status==='fulfilled'?{status:'available',...statsResult.value}:{status:'unavailable',totalContributedAtomic:null,totalUnitsAtomic:null,depositorCount:null},
  rates:rates?{status:rateHealth,onrampFiatPerUsdc:String((rates as any).onramp_fiat_per_usdc),offrampFiatPerUsdc:String((rates as any).offramp_fiat_per_usdc),validUntilLedger:Number((rates as any).valid_until_ledger),updatedLedger:Number((rates as any).updated_ledger),version:String((rates as any).version)}:{status:'unavailable'},
  rebalancing:rebalance?{status:(rebalance as any).enabled?'enabled':'disabled',provider:String((rebalance as any).oynk_provider),targetAtomic,differenceAtomic,recommendation:differenceAtomic===null?'unavailable':BigInt(differenceAtomic)<0n?'add-liquidity':BigInt(differenceAtomic)>0n?'reduce-liquidity':'balanced'}:{status:'unconfigured',provider:null,targetAtomic:null,differenceAtomic:null,recommendation:'unavailable'},
 };
}

const symbol=(value:string)=>xdr.ScVal.scvSymbol(value);
const enumValue=(value:string)=>xdr.ScVal.scvVec([symbol(value)]);
function struct(fields:Record<string,xdr.ScVal>):xdr.ScVal{
 const entries=Object.entries(fields).sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>new xdr.ScMapEntry({key:symbol(key),val:value}));
 return xdr.ScVal.scvMap(entries);
}
const hash32=(value:string)=>createHash('sha256').update(value).digest('hex');

/** Open the contract-authoritative order that moves available Vault liquidity
 * toward live Pool obligations plus the actual admin-funded buffer. The
 * manager signer only automates order creation; providers still fill the order
 * through the normal settlement and attestation flow. */
export async function createVaultRebalanceOrder(network:Network,requestedAmount?:bigint,requestedMinimum?:bigint){
 const overview=await protocolOverview(network);
 if(overview.rebalancing.status!=='enabled'||overview.rebalancing.differenceAtomic===null)throw new Error('Vault rebalancing is not configured.');
 const difference=BigInt(overview.rebalancing.differenceAtomic);
 if(difference===0n)throw new Error('The Vault is already at its liquidity target.');
 const required=difference<0n?-difference:difference;
 const amount=requestedAmount??required;
 if(amount<=0n||amount>required)throw new Error('Rebalance amount exceeds the current liquidity requirement.');
 const minimum=requestedMinimum??(amount<10_000_000n?amount:10_000_000n);
 if(minimum<=0n||minimum>amount)throw new Error('Minimum fill must be greater than zero and no more than the order amount.');
 const sourceCurrency=difference<0n?566:0;const destinationCurrency=difference<0n?0:566;
 const corridor=await corridorRate(network,sourceCurrency,destinationCurrency);
 const rate=corridor.rate as Record<string,unknown>;
 const version=BigInt(String(rate.version??''));const validUntil=Number(rate.valid_until_ledger);
 if(version<=0n||!Number.isSafeInteger(validUntil)||validUntil<=corridor.latestLedger)throw new Error('The required NGN corridor rate is unavailable or expired.');
 const deadline=Math.min(validUntil,corridor.latestLedger+17_280);
 const nonce=randomUUID();const requestId=hash32(`oynk-rebalance:${network}:${nonce}`);const sourceReference=hash32(`oynk-rebalance-source:${network}:${nonce}`);
 const params=struct({
  deadline_ledger:nativeToScVal(deadline,{type:'u32'}),expected_rate_version:nativeToScVal(version,{type:'u64'}),fiat_currency:nativeToScVal(566,{type:'u32'}),id:xdr.ScVal.scvBytes(Buffer.from(requestId,'hex')),
  kind:enumValue(difference<0n?'FiatToCrypto':'CryptoToFiat'),minimum_fill_usdc:nativeToScVal(minimum,{type:'i128'}),partial_fill_enabled:xdr.ScVal.scvBool(minimum<amount),rail:enumValue('P2P'),source_reference:xdr.ScVal.scvBytes(Buffer.from(sourceReference,'hex')),target_usdc_amount:nativeToScVal(amount,{type:'i128'}),
 });
 const transactionHash=await submitRampInvocation(network,protocolContracts(network).orchestrator,'create_vault_liquidity_order',[params]);
 return{network,requestId,transactionHash,direction:difference<0n?'ADD_LIQUIDITY':'REDUCE_LIQUIDITY',amountAtomic:amount.toString(),minimumFillAtomic:minimum.toString(),deadlineLedger:deadline,rateVersion:version.toString(),state:'OPEN'};
}
