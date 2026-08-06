import type { AuthErrorResponse, OtpChallengeResponse, SessionResponse } from "@oynk/shared";

const API_URL=(import.meta.env.VITE_API_URL??"").replace(/\/$/,"");
let activeCsrfToken="";
export class ApiError extends Error { constructor(message:string,public readonly code:string,public readonly fieldErrors?:Record<string,string>){super(message);} }
async function request<T>(path:string,options:RequestInit={}):Promise<T>{const method=options.method??"GET";const response=await fetch(`${API_URL}${path}`,{...options,credentials:"include",headers:{"Content-Type":"application/json",...(method!=="GET"&&method!=="HEAD"&&activeCsrfToken?{"x-csrf-token":activeCsrfToken}:{}),...options.headers}});if(!response.ok){const payload=await response.json().catch(()=>({error:"The API request failed.",code:"REQUEST_FAILED"})) as AuthErrorResponse;throw new ApiError(payload.error,payload.code,payload.fieldErrors);}if(response.status===204){activeCsrfToken="";return undefined as T;}const payload=await response.json() as T;if(typeof payload==="object"&&payload!==null&&"csrfToken" in payload&&typeof payload.csrfToken==="string")activeCsrfToken=payload.csrfToken;return payload;}
export const api={
  session:()=>request<SessionResponse>("/api/auth/session"),
  login:(email:string,password:string)=>request<OtpChallengeResponse>("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})}),
  signup:(type:"business"|"partner",body:Record<string,unknown>)=>request<OtpChallengeResponse>(`/api/auth/signup/${type}`,{method:"POST",body:JSON.stringify(body)}),
  verifyEmail:(challengeId:string,code:string)=>request<{verified:true}>("/api/auth/verify-email",{method:"POST",body:JSON.stringify({challengeId,code})}),
  verifySignIn:(challengeId:string,code:string)=>request<SessionResponse>("/api/auth/verify-otp",{method:"POST",body:JSON.stringify({challengeId,code})}),
  resendOtp:(challengeId:string)=>request<OtpChallengeResponse>("/api/auth/otp/resend",{method:"POST",body:JSON.stringify({challengeId})}),
  forgotPassword:(email:string)=>request<{accepted:true;challenge?:OtpChallengeResponse}>("/api/auth/forgot-password",{method:"POST",body:JSON.stringify({email})}),
  resetPassword:(challengeId:string,code:string,password:string)=>request<{reset:true}>("/api/auth/reset-password",{method:"POST",body:JSON.stringify({challengeId,code,password})}),
  selectOrganization:(organizationId:string)=>request<SessionResponse>("/api/auth/session/organization",{method:"POST",body:JSON.stringify({organizationId})}),
  logout:()=>request<void>("/api/auth/logout",{method:"POST",body:"{}"}),
};
