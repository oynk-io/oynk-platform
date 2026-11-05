import { funding } from '../settings.js';

type Json = Record<string, unknown>;
let cached: { token: string; expiresAt: number; key: string } | null = null;

export class VfdError extends Error {
  constructor(readonly kind: 'rejected'|'configuration'|'unavailable', readonly code: string, message = 'VFD could not complete the request.') { super(message); }
}

export const vfdEnvironment = funding.VFD_ENVIRONMENT === 'LIVE' ? 'live' : 'test';
export const vfdConfigured = Boolean(funding.VFD_CONSUMER_KEY && funding.VFD_CONSUMER_SECRET);
const origin = () => funding.VFD_ENVIRONMENT === 'LIVE' ? 'https://api-apps.vfdbank.systems' : 'https://api-devapps.vfdbank.systems';
const authUrl = () => `${origin()}/vfd-tech/baas-portal/v1.1/baasauth/token`;
const walletUrl = () => `${origin()}/vtech-wallet/api/v2/wallet2`;
const kycUrl = () => `${origin()}/vtech-kyc/api/v2/kyc`;

async function json(response: Response): Promise<Json> {
  const raw = await response.text();
  if (raw.length > 1_000_000) throw new VfdError('unavailable','VFD_RESPONSE_TOO_LARGE');
  try { const value=JSON.parse(raw); if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value; }
  catch { throw new VfdError('unavailable','VFD_INVALID_RESPONSE'); }
}

async function accessToken(request: typeof fetch): Promise<string> {
  if (!vfdConfigured) throw new VfdError('unavailable','VFD_NOT_CONFIGURED','Oynk Pay bank accounts are being configured.');
  const key=`${funding.VFD_ENVIRONMENT}:${funding.VFD_CONSUMER_KEY}`;
  if(cached&&cached.key===key&&cached.expiresAt>Date.now()+30_000)return cached.token;
  let response:Response;
  try { response=await request(authUrl(),{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({consumerKey:funding.VFD_CONSUMER_KEY,consumerSecret:funding.VFD_CONSUMER_SECRET,validityTime:'60'}),signal:AbortSignal.timeout(12_000)}); }
  catch { throw new VfdError('unavailable','VFD_AUTH_NETWORK'); }
  const body=await json(response);const data=body.data as Json|undefined;const token=data?.access_token;
  if(!response.ok||body.status!=='00'||typeof token!=='string'||token.length<16)throw new VfdError(response.status>=500?'unavailable':'rejected','VFD_AUTH_REJECTED');
  const seconds=typeof data?.expires_in==='number'&&Number.isFinite(data.expires_in)?Math.min(data.expires_in,3600):3600;
  cached={token,expiresAt:Date.now()+Math.max(60,seconds)*1000,key};return token;
}

export async function vfdRequest(path:string, init:{method?:'GET'|'POST';body?:Json;acceptedStatuses?:string[];timeoutMs?:number}={}, request:typeof fetch=fetch):Promise<Json>{
  return requestAt(walletUrl(),path,init,request);
}

export async function vfdKycRequest(path:string, init:{method?:'GET'|'POST';body?:Json;acceptedStatuses?:string[];timeoutMs?:number}={}, request:typeof fetch=fetch):Promise<Json>{
  return requestAt(kycUrl(),path,init,request);
}

async function requestAt(baseUrl:string,path:string,init:{method?:'GET'|'POST';body?:Json;acceptedStatuses?:string[];timeoutMs?:number},request:typeof fetch):Promise<Json>{
  if(!path.startsWith('/')||path.includes('://'))throw new Error('Invalid VFD path');
  for(let attempt=0;attempt<2;attempt++){
    const token=await accessToken(request);let response:Response;
    try { response=await request(`${baseUrl}${path}`,{method:init.method??'GET',redirect:'error',headers:{AccessToken:token,'Content-Type':'application/json'},body:init.body?JSON.stringify(init.body):undefined,signal:AbortSignal.timeout(init.timeoutMs??15_000)}); }
    catch { throw new VfdError('unavailable','VFD_NETWORK'); }
    const body=await json(response);const status=String(body.status??'');
    // Some VFD business-status responses (notably the documented `01` account
    // recovery response) can arrive with a non-2xx HTTP status. Callers opt in
    // to those statuses explicitly and still validate the returned payload.
    if((init.acceptedStatuses??['00']).includes(status))return body;
    const message=typeof body.message==='string'?body.message:'';
    const stale=response.status===401||/invalid\s+(?:wallet\s+)?token/i.test(message);
    if(stale&&attempt===0){cached=null;continue;}
    const configuration=response.status===401||response.status===403||status==='119'||status==='929';
    throw new VfdError(configuration?'configuration':response.status>=500||status==='500'?'unavailable':'rejected',`VFD_${status||response.status}`,message||undefined);
  }
  throw new VfdError('configuration','VFD_AUTH_REJECTED');
}

export function clearVfdTokenForTests(){cached=null;}
