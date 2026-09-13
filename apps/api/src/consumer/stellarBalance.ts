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
