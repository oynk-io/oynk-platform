import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { OrganizationSummary, OrganizationType, OtpChallengeResponse, OtpPurpose, SessionResponse } from "@oynk/shared";

import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { sendEmail } from "../email/emailService.js";
import { otpEmail } from "../email/templates.js";
import { generateOtp, hashPassword, normalizeEmail, randomToken, safeEqualHash, secureHash, verifyPassword } from "./security.js";

type UserRow = { id: string; email: string; password_hash: string; first_name: string; last_name: string; status: "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "DISABLED" };
type ChallengeRow = { id: string; user_id: string | null; destination: string; purpose: OtpPurpose; code_hash: string; attempts: number; max_attempts: number; expires_at: Date; consumed_at: Date | null; invalidated_at: Date | null };
type MembershipRow = { organization_id: string; legal_name: string; type: OrganizationType; status: OrganizationSummary["status"]; platform_mode: OrganizationSummary["platformMode"]; role_name: string; permission_name: string | null };

const DUMMY_PASSWORD_HASH = await hashPassword("Not-A-Real-Password-12345");

function destinationHint(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

async function audit(client: PoolClient, input: { actorUserId?: string | null; organizationId?: string | null; action: string; resourceType: string; resourceId?: string | null; result: "SUCCESS" | "FAILURE" | "DENIED"; requestId?: string; ip?: string; metadata?: Record<string, unknown> }): Promise<void> {
  await client.query(`INSERT INTO audit_logs(id,actor_user_id,organization_id,action,resource_type,resource_id,result,request_id,ip_address,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [randomUUID(), input.actorUserId ?? null, input.organizationId ?? null, input.action, input.resourceType, input.resourceId ?? null, input.result, input.requestId ?? null, input.ip ?? null, input.metadata ?? {}]);
}

export async function issueOtp(input: { user: Pick<UserRow,"id"|"email"|"first_name">; purpose: OtpPurpose; ip?: string }): Promise<OtpChallengeResponse> {
  const code = generateOtp();
  const id = randomUUID();
  const now = new Date();
  const ttl = input.purpose === "PASSWORD_RESET" ? config.AUTH_PASSWORD_RESET_TTL_MINUTES : config.AUTH_OTP_TTL_MINUTES;
  const expiresAt = new Date(now.getTime() + ttl * 60_000);
  const resendAt = new Date(now.getTime() + config.AUTH_OTP_RESEND_COOLDOWN_SECONDS * 1_000);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE otp_challenges SET invalidated_at=NOW() WHERE destination=$1 AND purpose=$2 AND consumed_at IS NULL AND invalidated_at IS NULL`, [input.user.email, input.purpose]);
    await client.query(`INSERT INTO otp_challenges(id,user_id,destination,purpose,code_hash,max_attempts,expires_at,resend_available_at,request_ip) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, input.user.id, input.user.email, input.purpose, secureHash(`${id}:${input.purpose}:${code}`), config.AUTH_OTP_MAX_ATTEMPTS, expiresAt, resendAt, input.ip ?? null]);
    await audit(client, { actorUserId: input.user.id, action: "OTP_ISSUED", resourceType: "OTP_CHALLENGE", resourceId: id, result: "SUCCESS", ip: input.ip, metadata: { purpose: input.purpose } });
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  const purposeCopy = input.purpose === "SIGN_IN" ? "sign in" : input.purpose === "PASSWORD_RESET" ? "reset your password" : "verify your email";
  const template=otpEmail({ firstName: input.user.first_name, code, purpose: purposeCopy, expiresMinutes: ttl });
  if(input.purpose==="PASSWORD_RESET"){
    const resetUrl=`${config.CONSOLE_SITE_URL}/reset-password?challenge=${encodeURIComponent(id)}`;
    template.text+=`\n\nContinue at: ${resetUrl}`;
    template.html=template.html.replace("</body>",`<p style="text-align:center"><a href="${resetUrl}">Continue password reset</a></p></body>`);
  }
  await sendEmail({ to: input.user.email, ...template });
  return { challengeId: id, purpose: input.purpose, expiresAt: expiresAt.toISOString(), resendAvailableAt: resendAt.toISOString(), destinationHint: destinationHint(input.user.email), ...(config.APP_ENV === "development" && config.EMAIL_PROVIDER === "development" ? { developmentCode: code } : {}) };
}

export async function register(input: { email: string; password: string; firstName: string; lastName: string; phone: string; legalName: string; tradingName?: string; registrationCountry: string; operatingCountry: string; type: Exclude<OrganizationType,"INTERNAL">; ip?: string; requestId?: string }): Promise<OtpChallengeResponse> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();
  const organizationId = randomUUID();
  const role = input.type === "BUSINESS" ? "BUSINESS_OWNER" : "PARTNER_OWNER";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO users(id,email,password_hash,first_name,last_name,phone,status) VALUES($1,$2,$3,$4,$5,$6,'PENDING_VERIFICATION')`, [userId,email,passwordHash,input.firstName.trim(),input.lastName.trim(),input.phone.trim()]);
    await client.query(`INSERT INTO organizations(id,type,status,platform_mode,legal_name,trading_name,registration_country,primary_operating_country) VALUES($1,$2,'EMAIL_VERIFICATION_REQUIRED',$3,$4,$5,$6,$7)`, [organizationId,input.type,config.PLATFORM_MODE,input.legalName.trim(),input.tradingName?.trim() || null,input.registrationCountry,input.operatingCountry]);
    await client.query(`INSERT INTO organization_memberships(id,user_id,organization_id,role_name,status) VALUES($1,$2,$3,$4,'ACTIVE')`, [randomUUID(),userId,organizationId,role]);
    await audit(client,{actorUserId:userId,organizationId,action:"SIGN_UP",resourceType:"ORGANIZATION",resourceId:organizationId,result:"SUCCESS",requestId:input.requestId,ip:input.ip,metadata:{type:input.type}});
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  return issueOtp({ user: { id:userId,email,first_name:input.firstName.trim() }, purpose:"EMAIL_VERIFICATION", ip:input.ip });
}

export async function beginLogin(emailInput: string, password: string, ip?: string): Promise<OtpChallengeResponse | null> {
  const email = normalizeEmail(emailInput);
  const result = await pool.query<UserRow>(`SELECT id,email,password_hash,first_name,last_name,status FROM users WHERE LOWER(email)=LOWER($1)`,[email]);
  const user = result.rows[0];
  const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || !valid || user.status !== "ACTIVE") {
    await pool.query(`INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,result,ip_address,metadata) VALUES($1,$2,'LOGIN_FAILED','USER',$2,'FAILURE',$3,$4)`,[randomUUID(),user?.id??null,ip??null,{reason:user?.status!=="ACTIVE"?"ACCOUNT_STATE":"INVALID_CREDENTIALS"}]);
    return null;
  }
  return issueOtp({ user, purpose:"SIGN_IN", ip });
}

export async function beginPasswordReset(emailInput: string, ip?: string): Promise<OtpChallengeResponse | null> {
  const result = await pool.query<UserRow>(`SELECT id,email,password_hash,first_name,last_name,status FROM users WHERE LOWER(email)=LOWER($1)`,[normalizeEmail(emailInput)]);
  const user = result.rows[0];
  if (!user || user.status === "DISABLED") return null;
  return issueOtp({user,purpose:"PASSWORD_RESET",ip});
}

async function consumeChallenge(client: PoolClient, challengeId: string, purpose: OtpPurpose, code: string): Promise<ChallengeRow | null> {
  const result = await client.query<ChallengeRow>(`SELECT * FROM otp_challenges WHERE id=$1 FOR UPDATE`,[challengeId]);
  const challenge = result.rows[0];
  if (!challenge || challenge.purpose !== purpose || challenge.consumed_at || challenge.invalidated_at || challenge.expires_at.getTime() <= Date.now() || challenge.attempts >= challenge.max_attempts) return null;
  const valid = safeEqualHash(`${challenge.id}:${challenge.purpose}:${code}`,challenge.code_hash);
  if (!valid) { await client.query(`UPDATE otp_challenges SET attempts=attempts+1 WHERE id=$1`,[challenge.id]); return null; }
  await client.query(`UPDATE otp_challenges SET consumed_at=NOW() WHERE id=$1`,[challenge.id]);
  return challenge;
}

export async function verifyEmailOtp(challengeId: string, code: string, context: {ip?:string;requestId?:string}): Promise<boolean> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const challenge=await consumeChallenge(client,challengeId,"EMAIL_VERIFICATION",code); if(!challenge?.user_id){await client.query("COMMIT");return false;}
    await client.query(`UPDATE users SET status='ACTIVE',email_verified_at=NOW(),updated_at=NOW() WHERE id=$1`,[challenge.user_id]);
    await client.query(`UPDATE organizations SET status='COMPLIANCE_INCOMPLETE',updated_at=NOW() WHERE id IN (SELECT organization_id FROM organization_memberships WHERE user_id=$1)`,[challenge.user_id]);
    await audit(client,{actorUserId:challenge.user_id,action:"EMAIL_VERIFIED",resourceType:"USER",resourceId:challenge.user_id,result:"SUCCESS",...context}); await client.query("COMMIT"); return true;
  } catch(error){await client.query("ROLLBACK");throw error;} finally{client.release();}
}

export async function resetPassword(challengeId:string,code:string,password:string,context:{ip?:string;requestId?:string}):Promise<boolean>{
  const client=await pool.connect(); try{await client.query("BEGIN");const challenge=await consumeChallenge(client,challengeId,"PASSWORD_RESET",code);if(!challenge?.user_id){await client.query("COMMIT");return false;}const passwordHash=await hashPassword(password);await client.query(`UPDATE users SET password_hash=$1,password_changed_at=NOW(),updated_at=NOW() WHERE id=$2`,[passwordHash,challenge.user_id]);await client.query(`UPDATE sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL`,[challenge.user_id]);await audit(client,{actorUserId:challenge.user_id,action:"PASSWORD_RESET",resourceType:"USER",resourceId:challenge.user_id,result:"SUCCESS",...context});await client.query("COMMIT");return true;}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export async function createSessionFromOtp(challengeId:string,code:string,input:{ip?:string;userAgent?:string;requestId?:string}):Promise<{token:string;response:SessionResponse}|null>{
  const client=await pool.connect();try{await client.query("BEGIN");const challenge=await consumeChallenge(client,challengeId,"SIGN_IN",code);if(!challenge?.user_id){await client.query("COMMIT");return null;}const token=randomToken();const csrfToken=randomToken();const sessionId=randomUUID();const expiresAt=new Date(Date.now()+config.AUTH_SESSION_TTL_HOURS*3_600_000);await client.query(`INSERT INTO sessions(id,user_id,token_hash,csrf_token_hash,expires_at,created_ip,user_agent) VALUES($1,$2,$3,$4,$5,$6,$7)`,[sessionId,challenge.user_id,secureHash(token),secureHash(csrfToken),expiresAt,input.ip??null,input.userAgent?.slice(0,500)??null]);await audit(client,{actorUserId:challenge.user_id,action:"LOGIN",resourceType:"SESSION",resourceId:sessionId,result:"SUCCESS",requestId:input.requestId,ip:input.ip});await client.query("COMMIT");const base=await getSessionByToken(token);if(!base)throw new Error("Session was not readable after creation");return{token,response:{...base,csrfToken}};}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export async function resendOtp(challengeId:string,ip?:string):Promise<OtpChallengeResponse|null>{
  const result=await pool.query<ChallengeRow&{email:string;first_name:string;resend_available_at:Date}>(`SELECT c.*,u.email,u.first_name FROM otp_challenges c JOIN users u ON u.id=c.user_id WHERE c.id=$1`,[challengeId]);
  const challenge=result.rows[0];
  if(!challenge||challenge.consumed_at||challenge.invalidated_at||challenge.resend_available_at.getTime()>Date.now())return null;
  return issueOtp({user:{id:challenge.user_id!,email:challenge.email,first_name:challenge.first_name},purpose:challenge.purpose,ip});
}

async function organizationsForUser(userId:string):Promise<OrganizationSummary[]>{const result=await pool.query<MembershipRow>(`SELECT o.id organization_id,o.legal_name,o.type,o.status,o.platform_mode,m.role_name,rp.permission_name FROM organization_memberships m JOIN organizations o ON o.id=m.organization_id LEFT JOIN role_permissions rp ON rp.role_name=m.role_name WHERE m.user_id=$1 AND m.status='ACTIVE' ORDER BY o.created_at,rp.permission_name`,[userId]);const map=new Map<string,OrganizationSummary>();for(const row of result.rows){const existing=map.get(row.organization_id)??{id:row.organization_id,name:row.legal_name,type:row.type,status:row.status,platformMode:row.platform_mode,role:row.role_name,permissions:[]};if(row.permission_name)existing.permissions.push(row.permission_name);map.set(row.organization_id,existing);}return [...map.values()];}

export async function getSessionByToken(token:string):Promise<Omit<SessionResponse,"csrfToken">|null>{const result=await pool.query<{id:string;user_id:string;active_organization_id:string|null;expires_at:Date;email:string;first_name:string;last_name:string;status:UserRow["status"]}>(`SELECT s.id,s.user_id,s.active_organization_id,s.expires_at,u.email,u.first_name,u.last_name,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>NOW()`,[secureHash(token)]);const row=result.rows[0];if(!row||row.status!=="ACTIVE")return null;const organizations=await organizationsForUser(row.user_id);const organization=organizations.find((item)=>item.id===row.active_organization_id)??(organizations.length===1?organizations[0]??null:null);if(organization&&!row.active_organization_id)await pool.query(`UPDATE sessions SET active_organization_id=$1 WHERE id=$2`,[organization.id,row.id]);return{authenticated:true,user:{id:row.user_id,email:row.email,firstName:row.first_name,lastName:row.last_name,status:row.status},organization,organizations,expiresAt:row.expires_at.toISOString()};}

export async function sessionResponseWithFreshCsrf(token:string):Promise<SessionResponse|null>{const session=await getSessionByToken(token);if(!session)return null;const csrfToken=randomToken();await pool.query(`UPDATE sessions SET csrf_token_hash=$1,last_used_at=NOW() WHERE token_hash=$2 AND revoked_at IS NULL`,[secureHash(csrfToken),secureHash(token)]);return{...session,csrfToken};}

export async function selectOrganization(token:string,organizationId:string):Promise<boolean>{const result=await pool.query(`UPDATE sessions s SET active_organization_id=$1,last_used_at=NOW() WHERE s.token_hash=$2 AND s.revoked_at IS NULL AND s.expires_at>NOW() AND EXISTS(SELECT 1 FROM organization_memberships m WHERE m.user_id=s.user_id AND m.organization_id=$1 AND m.status='ACTIVE')`,[organizationId,secureHash(token)]);return(result.rowCount??0)>0;}
export async function revokeSession(token:string):Promise<void>{await pool.query(`UPDATE sessions SET revoked_at=NOW() WHERE token_hash=$1`,[secureHash(token)]);}
export async function verifyCsrf(token:string,csrfToken:string):Promise<boolean>{const result=await pool.query<{csrf_token_hash:string}>(`SELECT csrf_token_hash FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>NOW()`,[secureHash(token)]);return Boolean(result.rows[0]&&safeEqualHash(csrfToken,result.rows[0].csrf_token_hash));}
