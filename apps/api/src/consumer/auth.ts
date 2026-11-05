import { SocketFiTokenVerifier } from './socketfiKeys.js';
import { funding } from './settings.js';
import { secureHash } from '../auth/security.js';
export type Identity = {
 subject: string;
 clientId: string;
 network: 'PUBLIC' | 'TESTNET';
 wallet: string;
 authMethod: 'passkey' | 'device';
 projectUsername?: string;
 issuedAt?: number;
 tokenId?: string;
};
const verifier = new SocketFiTokenVerifier({apiUrl:funding.SOCKETFI_API_URL,clientId:funding.SOCKETFI_CLIENT_ID,clientSecret:funding.SOCKETFI_CLIENT_SECRET}, (...args) => fetch(...args));

export function accessTokenIdentifier(token: string, claim: unknown): string {
 return typeof claim === 'string' && claim.length >= 16 && claim.length <= 200
  ? claim
  : secureHash(`consumer-access-token:v1:${token}`);
}

export async function consumerIdentity(authorization: string | undefined): Promise<Identity> {
 if (!authorization?.startsWith('Bearer ')) throw new Error('Sign in again to access your deposit account.');
 const token = authorization.slice(7);
 const { payload } = await verifier.verify(token);
 const network = payload.network;
 const wallet = payload.activeWallet;
 const nativeProjectToken = payload.type === 'access' && payload.clientId === funding.SOCKETFI_CLIENT_ID;
 const evmToken = payload.type === 'socketfi_auth' && payload.aud === 'socketfi-api';
 const authMethods = payload.authMethods as Record<string, unknown> | undefined;
 const authMethod = authMethods?.evm === true && authMethods?.passkey !== true ? 'device' : authMethods?.passkey === true ? 'passkey' : null;
 if ((!nativeProjectToken && !evmToken) || !payload.sub || !authMethod || (network !== 'TESTNET' && network !== 'PUBLIC') || typeof wallet !== 'string' || !/^C[A-Z2-7]{55}$/.test(wallet) || !payload.wallet || (payload.wallet as Record<string, unknown>)[network] !== wallet || !Number.isSafeInteger(payload.iat)) throw new Error('Invalid smart-account session.');
 const projectUsername = typeof payload.projectUsername === 'string' ? payload.projectUsername.trim().toLowerCase() : undefined;
 // SocketFi's long-lived account tokens predate the optional JWT `jti`
 // claim. Use the verified `jti` when present and an opaque, keyed
 // fingerprint otherwise for session audit. Sensitive actions additionally
 // require their own owner signature. Never persist the bearer token.
 const tokenId = accessTokenIdentifier(token, payload.jti);
 return { subject: payload.sub, clientId: funding.SOCKETFI_CLIENT_ID, network, wallet, authMethod, issuedAt: payload.iat as number, tokenId, ...(projectUsername ? { projectUsername } : {}) };
}
