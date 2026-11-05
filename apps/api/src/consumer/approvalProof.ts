import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import { verifyMessage } from 'ethers';

export type ApprovalScope = { clientId: string; subject: string; network: string; wallet: string };
export type CurrentOwner = { evm: string | null; passkey: Buffer | null; rpIdHash: Buffer | null; paused: boolean };
export function canonicalPayload(value: unknown): string {
 if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
 if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
 if (Array.isArray(value)) return `[${value.map(canonicalPayload).join(',')}]`;
 if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalPayload((value as Record<string,unknown>)[key])}`).join(',')}}`;
 throw new Error('Invalid approval payload');
}
export function approvalDigest(scope: ApprovalScope, id: string, action: string, payloadHash: string, expiry: string): Buffer {
 return createHash('sha256').update(canonicalPayload({ domain:'oynk:primary-approval:v1', clientId:scope.clientId, subject:scope.subject, network:scope.network, wallet:scope.wallet, id, action, payloadHash, expiry })).digest();
}
function decoded(value: unknown, max: number): Buffer {
 if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > max * 2) throw new Error('Invalid assertion');
 const result = Buffer.from(value,'base64url');
 if (result.toString('base64url') !== value || !result.length || result.length > max) throw new Error('Invalid assertion');
 return result;
}
/** Checks a transaction-specific signature against the current on-chain owner. */
export function verifyOwnerProof(digest: Buffer, raw: unknown, owner: CurrentOwner, rpId: string, origins: string[]): boolean {
 try {
  if (owner.paused || !raw || typeof raw !== 'object') return false;
  const proof = raw as Record<string,unknown>;
  if (proof.kind === 'evm') {
   if (!owner.evm || typeof proof.signature !== 'string' || !/^0x[0-9a-f]{130}$/i.test(proof.signature)) return false;
   return verifyMessage(digest,proof.signature).toLowerCase() === owner.evm.toLowerCase();
  }
  if (proof.kind !== 'passkey' || !owner.passkey || owner.passkey.length !== 65 || owner.passkey[0] !== 4 || !owner.rpIdHash) return false;
  const assertion = proof.assertion as Record<string,unknown>;
  const response = assertion?.response as Record<string,unknown>;
  if (assertion?.type !== 'public-key' || !response) return false;
  const clientData = decoded(response.clientDataJSON,4096), auth = decoded(response.authenticatorData,4096), signature = decoded(response.signature,80);
  const client = JSON.parse(clientData.toString('utf8'));
  if (client.type !== 'webauthn.get' || client.challenge !== digest.toString('base64url') || client.crossOrigin === true || !origins.includes(client.origin)) return false;
  const rpHash = createHash('sha256').update(rpId).digest();
  if (auth.length < 37 || (auth[32]! & 5) !== 5 || !timingSafeEqual(auth.subarray(0,32),rpHash) || !timingSafeEqual(owner.rpIdHash,rpHash)) return false;
  const key = createPublicKey({key:{kty:'EC',crv:'P-256',x:owner.passkey.subarray(1,33).toString('base64url'),y:owner.passkey.subarray(33).toString('base64url')},format:'jwk'});
  return verify('sha256',Buffer.concat([auth,createHash('sha256').update(clientData).digest()]),key,signature);
 } catch { return false; }
}
