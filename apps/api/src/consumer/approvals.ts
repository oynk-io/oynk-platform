import { randomUUID } from 'node:crypto';
import { Address, Networks, StrKey, scValToNative, xdr } from '@stellar/stellar-sdk';
import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';
import { accountFor, FundingError } from './service.js';
import { secureHash } from '../auth/security.js';
import type { Identity } from './auth.js';
import { approvalDigest, canonicalPayload, verifyOwnerProof, type CurrentOwner } from './approvalProof.js';

const rpId = process.env.SOCKETFI_RP_ID || 'socket.fi';
const origins = [ `https://${rpId}`, ...(process.env.OYNK_APPROVAL_PASSKEY_ORIGINS || '').split(',').map(v=>v.trim()).filter(Boolean) ];
export async function currentOwner(identity: Identity, request: typeof fetch = fetch): Promise<CurrentOwner> {
 if (!StrKey.isValidContract(identity.wallet)) throw new FundingError('Your account could not be checked.',503);
 const endpoint = identity.network === 'TESTNET' ? process.env.STELLAR_TESTNET_RPC_URL || 'https://soroban-testnet.stellar.org' : process.env.STELLAR_PUBLIC_RPC_URL;
 if (!endpoint || new URL(endpoint).protocol !== 'https:') throw new FundingError('Account approval is unavailable.',503);
 const key = xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:new Address(identity.wallet).toScAddress(),key:xdr.ScVal.scvLedgerKeyContractInstance(),durability:xdr.ContractDataDurability.persistent()})).toXDR('base64');
 const call = async (method:string, params:object={}) => {
  const response = await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(12_000),body:JSON.stringify({jsonrpc:'2.0',id:method,method,params})});
  const value = await response.json();
  if (!response.ok || value.id !== method || value.error || !value.result) throw new FundingError('Your account approval could not be checked. Please try again.',503);
  return value.result;
 };
 const [network,ledger] = await Promise.all([call('getNetwork'),call('getLedgerEntries',{keys:[key]})]);
 if (network.passphrase !== Networks[identity.network] || ledger.entries?.length !== 1) throw new FundingError('Your account could not be checked.',503);
 const entry = ledger.entries[0];
 if (entry.key !== key || typeof entry.xdr !== 'string') throw new FundingError('Your account could not be checked.',503);
 const storage = xdr.LedgerEntryData.fromXDR(entry.xdr,'base64').contractData().val().instance().storage() || [];
 const values: Record<string,unknown> = {};
 for (const pair of storage) { const name = scValToNative(pair.key()); if (Array.isArray(name) && typeof name[0] === 'string') values[name[0]] = scValToNative(pair.val()); }
 const bytes = (v:unknown):Buffer|null => v instanceof Uint8Array ? Buffer.from(v) : null;
 const evm = bytes(values.EvmSigner);
 return { evm:evm?.length===20?`0x${evm.toString('hex')}`:null, passkey:bytes(values.Passkey), rpIdHash:bytes(values.RpidHash ?? values.RPID), paused:values.Paused===true };
}
export async function createActionChallenge(identity: Identity, action: string, payload: unknown, db?: PoolClient) {
 const account = await accountFor(identity,db);
 const id = randomUUID(), expiry = new Date(Date.now()+5*60_000).toISOString();
 const hash = secureHash(canonicalPayload(payload));
 await (db || pool).query(`INSERT INTO consumer_primary_auth_challenges(id,account_id,action,payload_hash,initial_token_jti,required_auth_method,minimum_token_iat,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,account.id,action,hash,identity.tokenId || 'signature-required',identity.authMethod,Math.floor(Date.now()/1000),expiry]);
 const digest = approvalDigest(identity,id,action,hash,expiry);
 return { challengeId:id, expiresAt:expiry, authentication:identity.authMethod, payloadHex:digest.toString('hex'), challenge:digest.toString('base64url'), rpId };
}
export async function consumeActionApproval(db: PoolClient, identity: Identity, action: string, payload: unknown, raw: unknown, readOwner: (identity: Identity) => Promise<CurrentOwner> = currentOwner) {
 const input = raw && typeof raw === 'object' ? raw as Record<string,unknown> : {};
 if (typeof input.challengeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.challengeId)) throw new FundingError('Approve this action again.',409);
 const account = await accountFor(identity,db);
 const row = (await db.query(`SELECT * FROM consumer_primary_auth_challenges WHERE id=$1 AND account_id=$2 FOR UPDATE`,[input.challengeId,account.id])).rows[0];
 if (!row || row.consumed_at || row.action !== action || new Date(row.expires_at).getTime() <= Date.now() || row.payload_hash !== secureHash(canonicalPayload(payload))) throw new FundingError('Your approval expired or the details changed. Please approve again.',409);
 const digest = approvalDigest(identity,row.id,action,row.payload_hash,new Date(row.expires_at).toISOString());
 if (!verifyOwnerProof(digest,input.proof,await readOwner(identity),rpId,origins)) throw new FundingError('We could not verify your account approval. Please try again.',403);
 await db.query('UPDATE consumer_primary_auth_challenges SET consumed_at=NOW() WHERE id=$1',[row.id]);
 return row.id as string;
}
