import { SocketFiTokenVerifier } from './socketfiKeys.js';
import { funding } from './settings.js';
export type Identity = {
 subject: string;
 clientId: string;
 network: 'PUBLIC' | 'TESTNET';
 wallet: string;
 authMethod: 'passkey' | 'device';
};
const verifier = new SocketFiTokenVerifier({apiUrl:funding.SOCKETFI_API_URL,clientId:funding.SOCKETFI_CLIENT_ID,clientSecret:funding.SOCKETFI_CLIENT_SECRET}, (...args) => fetch(...args));
export async function consumerIdentity(authorization: string | undefined): Promise<Identity> {
 if (!authorization?.startsWith('Bearer ')) throw new Error('Sign in again to access your deposit account.');
 const { payload } = await verifier.verify(authorization.slice(7));
 const network = payload.network;
 const wallet = payload.activeWallet;
 const nativeProjectToken = payload.type === 'access' && payload.clientId === funding.SOCKETFI_CLIENT_ID;
 const evmToken = payload.type === 'socketfi_auth' && payload.aud === 'socketfi-api';
 const authMethods = payload.authMethods as Record<string, unknown> | undefined;
 const authMethod = authMethods?.evm === true && authMethods?.passkey !== true ? 'device' : authMethods?.passkey === true ? 'passkey' : null;
 if ((!nativeProjectToken && !evmToken) || !payload.sub || !authMethod || (network !== 'TESTNET' && network !== 'PUBLIC') || typeof wallet !== 'string' || !/^C[A-Z2-7]{55}$/.test(wallet) || !payload.wallet || (payload.wallet as Record<string, unknown>)[network] !== wallet) throw new Error('Invalid smart-account session.');
 return { subject: payload.sub, clientId: funding.SOCKETFI_CLIENT_ID, network, wallet, authMethod };
}
