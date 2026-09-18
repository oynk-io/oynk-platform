import { Account, Contract, Networks, StrKey, TransactionBuilder, nativeToScVal, xdr, scValToNative } from '@stellar/stellar-sdk';
import type { Identity } from './auth.js';

export const usdcContracts = {
 TESTNET: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
 PUBLIC: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
} as const;
// Public, unsigned simulation source. No account lookup, funding or key is needed.
const readSource = 'GAIQAXDNABV3GZUP4DLYJG5IMOCG236HIBNOPZF7IZXP6CL7POSKJFES';
export async function stellarBalance(identity: Pick<Identity,'wallet'|'network'>, request: typeof fetch = fetch) {
 if (!StrKey.isValidContract(identity.wallet) || !(identity.network in usdcContracts)) throw new Error('Invalid smart account');
 const endpoint = identity.network === 'TESTNET'
  ? process.env.STELLAR_TESTNET_RPC_URL || 'https://soroban-testnet.stellar.org'
  : process.env.STELLAR_PUBLIC_RPC_URL;
 if (!endpoint) throw new Error('Stellar RPC is not configured');
 const url = new URL(endpoint);
 if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid Stellar RPC');
 const passphrase = Networks[identity.network];
 const contract = usdcContracts[identity.network];
 const tx = new TransactionBuilder(new Account(readSource,'0'), {fee:'100',networkPassphrase:passphrase})
  .addOperation(new Contract(contract).call('balance',nativeToScVal(identity.wallet,{type:'address'}))).setTimeout(60).build();
 const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),12000);
 const call = async (method: string, params: object = {}) => {
  const response = await request(url.toString(), {method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:controller.signal,
   body:JSON.stringify({jsonrpc:'2.0',id:method,method,params})});
  if (!response.ok) throw new Error('Stellar RPC unavailable');
  const body = await response.json();
  if (body.jsonrpc !== '2.0' || body.id !== method || body.error || !body.result) throw new Error('Invalid Stellar RPC response');
  return body.result;
 };
 try {
  const [network,result] = await Promise.all([call('getNetwork'),call('simulateTransaction',{transaction:tx.toXDR()})]);
  if (network.passphrase !== passphrase) throw new Error('Stellar network mismatch');
  if (result.error || !Number.isSafeInteger(result.latestLedger) || result.latestLedger<=0 || !Array.isArray(result.results) || result.results.length!==1) throw new Error('Balance simulation unavailable');
  const encoded = result.results[0]?.xdr;
  if (typeof encoded!=='string' || encoded.length>128) throw new Error('Invalid USDC balance');
  const value = xdr.ScVal.fromXDR(encoded,'base64');
  if (value.switch().name!=='scvI128') throw new Error('Invalid USDC balance type');
  const atomic = scValToNative(value);
  if (typeof atomic!=='bigint' || atomic<0n) throw new Error('Invalid USDC balance');
  return {success:true,walletAddress:identity.wallet,network:identity.network,fetchedAt:new Date().toISOString(),latestLedger:result.latestLedger,
   tokens:[{contract,decimals:7,atomicBalance:atomic.toString(),balanceStatus:'fresh'}]};
 } finally {clearTimeout(timer);controller.abort();}
}

export async function poolPosition(identity: Pick<Identity,'wallet'|'network'>, poolAddress: string, request: typeof fetch = fetch) {
 if (!StrKey.isValidContract(identity.wallet) || !StrKey.isValidContract(poolAddress) || !(identity.network in Networks)) throw new Error('Invalid smart account or pool');
 const endpoint = identity.network === 'TESTNET' ? process.env.STELLAR_TESTNET_RPC_URL || 'https://soroban-testnet.stellar.org' : process.env.STELLAR_PUBLIC_RPC_URL;
 if (!endpoint) throw new Error('Stellar RPC is not configured');
 const passphrase = Networks[identity.network];
 const readSource = 'GAIQAXDNABV3GZUP4DLYJG5IMOCG236HIBNOPZF7IZXP6CL7POSKJFES';
 const simulate=async(method:'get_position'|'get_redeemable')=>{
  const tx = new TransactionBuilder(new Account(readSource, '0'), { fee: '100', networkPassphrase: passphrase })
   .addOperation(new Contract(poolAddress).call(method, nativeToScVal(identity.wallet, { type: 'address' }))).setTimeout(60).build();
  const id=`pool-${method}`;
  const response = await request(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, redirect:'error', body:JSON.stringify({jsonrpc:'2.0',id,method:'simulateTransaction',params:{transaction:tx.toXDR()}}) });
  if (!response.ok) throw new Error('Stellar RPC unavailable');
  const body=await response.json();const encoded=body?.result?.results?.[0]?.xdr;
  if(body?.jsonrpc!=='2.0'||body?.id!==id||body?.error||body?.result?.error||typeof encoded!=='string')throw new Error('Pool position unavailable');
  return encoded as string;
 };
 // Soroban transactions support a single contract invocation. Read the two
 // views independently rather than assuming a second simulation result.
 const [encoded,redeemableEncoded]=await Promise.all([simulate('get_position'),simulate('get_redeemable')]);
 const redeemable=scValToNative(xdr.ScVal.fromXDR(redeemableEncoded,'base64'));
 if(typeof redeemable!=='bigint'||redeemable<0n)throw new Error('Invalid redeemable pool position');
 const value = scValToNative(xdr.ScVal.fromXDR(encoded, 'base64')) as null | Record<string, unknown>;
 if (value === null) return { success:true, walletAddress:identity.wallet, network:identity.network, contributedAtomic:'0', unitsAtomic:'0', redeemableAtomic:redeemable.toString() };
 if (typeof value !== 'object' || value.claimant !== identity.wallet || typeof value.contributed !== 'bigint' || typeof value.units !== 'bigint' || value.contributed < 0n || value.units < 0n) throw new Error('Invalid pool position');
 if(redeemable>value.units)throw new Error('Invalid redeemable pool position');
 return { success:true, walletAddress:identity.wallet, network:identity.network, contributedAtomic:value.contributed.toString(), unitsAtomic:value.units.toString(), redeemableAtomic:redeemable.toString(), fetchedAt:new Date().toISOString() };
}

export async function poolStats(identity: Pick<Identity,'network'>, poolAddress: string, request: typeof fetch = fetch) {
 const endpoint = identity.network === 'TESTNET' ? process.env.STELLAR_TESTNET_RPC_URL || 'https://soroban-testnet.stellar.org' : process.env.STELLAR_PUBLIC_RPC_URL;
 if (!endpoint || !StrKey.isValidContract(poolAddress)) throw new Error('Pool stats unavailable');
 const tx = new TransactionBuilder(new Account(readSource,'0'), { fee:'100', networkPassphrase:Networks[identity.network] }).addOperation(new Contract(poolAddress).call('get_stats')).setTimeout(60).build();
 const response = await request(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, redirect:'error', body:JSON.stringify({jsonrpc:'2.0',id:'pool-stats',method:'simulateTransaction',params:{transaction:tx.toXDR()}}) });
 if (!response.ok) throw new Error('Stellar RPC unavailable');
 const body = await response.json(); const encoded = body?.result?.results?.[0]?.xdr;
 if (body?.jsonrpc !== '2.0' || body?.error || typeof encoded !== 'string') throw new Error('Pool stats unavailable');
 const value = scValToNative(xdr.ScVal.fromXDR(encoded,'base64')) as Record<string, unknown>;
 if (!value || typeof value !== 'object' || typeof value.total_contributed !== 'bigint' || typeof value.total_units !== 'bigint' || typeof value.depositor_count !== 'number' || typeof value.pending_redemptions !== 'bigint' || typeof value.rwa_deployed !== 'bigint' || typeof value.max_rwa_utilization_bps !== 'number') throw new Error('Invalid pool stats');
 return { totalContributedAtomic:value.total_contributed.toString(), totalUnitsAtomic:value.total_units.toString(), depositorCount:value.depositor_count, pendingRedemptionsAtomic:value.pending_redemptions.toString(), rwaDeployedAtomic:value.rwa_deployed.toString(), maxRwaUtilizationBps:value.max_rwa_utilization_bps };
}

export type ContractRampQuote = {
 fiatAmount: bigint;
 usdcAmount: bigint;
 fiatPerUsdc: bigint;
 rateVersion: bigint;
 validUntilLedger: number;
 latestLedger: number;
 contractId: string;
};

/** Read the canonical on-ramp quote from the Soroban orchestrator. The API may
 * display and persist this result, but it never calculates an independent FX
 * rate. Contract creation validates the same quote again. */
async function orchestratorRampQuote(identity: Pick<Identity,'network'>, orchestrator: string, direction: 'ON_RAMP'|'OFF_RAMP', amount: bigint, request: typeof fetch): Promise<ContractRampQuote> {
 if (amount <= 0n || !StrKey.isValidContract(orchestrator)) throw new Error('Invalid ramp quote request');
 const endpoint = identity.network === 'TESTNET' ? process.env.STELLAR_TESTNET_RPC_URL || 'https://soroban-testnet.stellar.org' : process.env.STELLAR_PUBLIC_RPC_URL;
 if (!endpoint) throw new Error('Stellar RPC is not configured');
 const passphrase = Networks[identity.network];
 const fn=direction==='ON_RAMP'?'quote_onramp':'quote_offramp';
 const tx = new TransactionBuilder(new Account(readSource,'0'), { fee:'100', networkPassphrase:passphrase })
  .addOperation(new Contract(orchestrator).call(fn, nativeToScVal(amount,{type:'i128'}))).setTimeout(60).build();
 const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),12000);
 try {
  const response = await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:controller.signal,body:JSON.stringify({jsonrpc:'2.0',id:'ramp-quote',method:'simulateTransaction',params:{transaction:tx.toXDR()}})});
  if(!response.ok)throw new Error('Stellar RPC unavailable');
  const body=await response.json();const simulation=body?.result;const encoded=simulation?.results?.[0]?.xdr;
  if(body?.jsonrpc!=='2.0'||body?.error||simulation?.error||!Number.isSafeInteger(simulation?.latestLedger)||typeof encoded!=='string')throw new Error('Contract ramp rate is unavailable');
  const value=scValToNative(xdr.ScVal.fromXDR(encoded,'base64')) as Record<string,unknown>;
  const expiry=typeof value?.valid_until_ledger==='number'?value.valid_until_ledger:typeof value?.valid_until_ledger==='bigint'&&value.valid_until_ledger<=BigInt(Number.MAX_SAFE_INTEGER)?Number(value.valid_until_ledger):null;
  if(!value||typeof value!=='object'||typeof value.fiat_amount!=='bigint'||typeof value.usdc_amount!=='bigint'||typeof value.fiat_per_usdc!=='bigint'||typeof value.rate_version!=='bigint'||expiry===null)throw new Error('Invalid contract ramp quote');
  if((direction==='ON_RAMP'?value.fiat_amount!==amount:value.usdc_amount!==amount)||value.fiat_amount<=0n||value.usdc_amount<=0n||value.fiat_per_usdc<=0n||value.rate_version<=0n||expiry<simulation.latestLedger)throw new Error('Expired or inconsistent contract ramp quote');
  return {fiatAmount:value.fiat_amount,usdcAmount:value.usdc_amount,fiatPerUsdc:value.fiat_per_usdc,rateVersion:value.rate_version,validUntilLedger:expiry,latestLedger:simulation.latestLedger,contractId:orchestrator};
 } finally {clearTimeout(timer);controller.abort();}
}

export function orchestratorOnrampQuote(identity: Pick<Identity,'network'>, orchestrator: string, fiatAmount: bigint, request: typeof fetch = fetch): Promise<ContractRampQuote> {
 return orchestratorRampQuote(identity,orchestrator,'ON_RAMP',fiatAmount,request);
}

export function orchestratorOfframpQuote(identity: Pick<Identity,'network'>, orchestrator: string, usdcAmount: bigint, request: typeof fetch = fetch): Promise<ContractRampQuote> {
 return orchestratorRampQuote(identity,orchestrator,'OFF_RAMP',usdcAmount,request);
}
