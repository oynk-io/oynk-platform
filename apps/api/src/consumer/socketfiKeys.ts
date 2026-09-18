import { decodeProtectedHeader, errors, importSPKI, jwtVerify } from 'jose';

type Key = { imported: Awaited<ReturnType<typeof importSPKI>>; kid?: string; expiresAt: number; fetchedAt: number };
type Config = { apiUrl: string; clientId: string; clientSecret: string };

/** SocketFi server SDK protocol: authenticated key discovery, 24h cache,
 * shared in-flight fetch, and one verification retry after key rotation.
 * Never follow token-provided key URLs or forward project secrets on redirects.
 */
export class SocketFiTokenVerifier {
 private key?: Key;
 private inFlight?: Promise<Key>;
 private lastAttempt = -Infinity;
 constructor(private config: Config, private fetcher: typeof fetch = fetch, private now = Date.now) {}

 private async refresh(observed?: Key): Promise<Key> {
  if (this.inFlight) return this.inFlight;
  if (observed && this.key && this.key !== observed) return this.key;
  // Bound forged-token refresh traffic. Never use an expired key after a failure.
  if (this.now() - this.lastAttempt < 5000) {
   if (this.key && this.key.expiresAt > this.now()) return this.key;
   throw new Error('SocketFi signing key is temporarily unavailable.');
  }
  this.lastAttempt = this.now();
  this.inFlight = this.fetchKey();
  try { const key = await this.inFlight; this.key = key; return key; }
  finally { this.inFlight = undefined; }
 }

 private async fetchKey(): Promise<Key> {
  const origin = new URL(this.config.apiUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || !this.config.clientSecret) throw new Error('SocketFi server credentials are not configured.');
  const response = await this.fetcher(new URL('/.well-known/socketfi-public-key',origin), {
   method:'GET', redirect:'error', signal:AbortSignal.timeout(8000),
   headers:{'x-socketfi-client-id':this.config.clientId,'x-socketfi-client-secret':this.config.clientSecret},
  });
  if (!response.ok) throw new Error('SocketFi signing key could not be fetched.');
  const body = await response.json() as Record<string,unknown>;
  if (!body || body.alg !== 'RS256' || body.issuer !== 'https://socket.fi' || typeof body.publicKey !== 'string' || body.publicKey.length > 16384 || (body.kid !== undefined && (typeof body.kid !== 'string' || body.kid.length > 256))) throw new Error('Invalid SocketFi signing key response.');
  return { imported:await importSPKI(body.publicKey,'RS256'),kid:body.kid as string|undefined,fetchedAt:this.now(),expiresAt:this.now()+86400000 };
 }

 async verify(token: string) {
  const header = decodeProtectedHeader(token);
  if (header.alg !== 'RS256') throw new Error('Unsupported SocketFi token algorithm.');
  let key = this.key && this.key.expiresAt > this.now() ? this.key : await this.refresh();
  if (header.kid && key.kid && header.kid !== key.kid) key = await this.refresh(key);
  const verify = (key: Key) => jwtVerify(token,key.imported,{
   algorithms:['RS256'],issuer:'https://socket.fi',audience:[this.config.clientId,'socketfi-api'],
   requiredClaims:['sub','exp','iat'],maxTokenAge:'65m', currentDate:new Date(this.now()),
   // Permit bounded infrastructure clock drift without weakening expiry,
   // issuer, audience, algorithm, signature, or maximum-age validation.
   clockTolerance:30,
  });
  try { return await verify(key); }
  catch (error) {
   if (!(error instanceof errors.JWSSignatureVerificationFailed)) throw error;
   return verify(await this.refresh(key));
  }
 }
}
