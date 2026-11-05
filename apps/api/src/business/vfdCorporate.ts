import { VfdError, vfdRequest } from '../consumer/providers/vfdClient.js';

type Json=Record<string,unknown>;
const object=(value:unknown):Json=>value&&typeof value==='object'&&!Array.isArray(value)?value as Json:{};

export type CorporateAccountInput={
 registrationNumber:string;companyName:string;incorporationDate:string;bvn:string;nin:string;
 taxIdentificationNumber:string;address:string;state:string;businessType:'RC'|'BN';
};

export function vfdBusinessType(value:string):'RC'|'BN'{
 const normalized=value.trim().toUpperCase();
 if(normalized==='BN'||/SOLE|PROPRIET|PARTNER|BUSINESS\s*NAME|DBA/.test(normalized))return'BN';
 return'RC';
}

export function vfdRegistrationNumber(value:string){return value.trim().replace(/^(?:RC|BN)[\s-]*/i,'');}
export function shouldRetryCorporateCreation(error:unknown){return error instanceof VfdError&&error.code==='VFD_99';}
export function corporateRetryFailure(error:unknown){
 if(shouldRetryCorporateCreation(error))return new VfdError('configuration','VFD_CORPORATE_CREATION_UNAVAILABLE',(error as VfdError).message);
 return error;
}

export function vfdCorporateDate(value:string){
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!match)throw new VfdError('rejected','VFD_INVALID_INCORPORATION_DATE');
 const date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));
 if(date.getUTCFullYear()!==Number(match[1])||date.getUTCMonth()!==Number(match[2])-1||date.getUTCDate()!==Number(match[3]))throw new VfdError('rejected','VFD_INVALID_INCORPORATION_DATE');
 return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'long',year:'numeric',timeZone:'UTC'}).format(date);
}

export function vfdCorporatePayload(input:CorporateAccountInput){return{
 rcNumber:vfdRegistrationNumber(input.registrationNumber),companyName:input.companyName,incorporationDate:vfdCorporateDate(input.incorporationDate),
 bvn:input.bvn,nin:input.nin,tin:input.taxIdentificationNumber,address:input.address,businessType:input.businessType,state:input.state,
};}

export async function createVfdCorporateAccount(input:CorporateAccountInput,request:typeof fetch=fetch){
 const call=()=>vfdRequest('/client/tiers/corporate',{method:'POST',acceptedStatuses:['00','01'],timeoutMs:30_000,body:vfdCorporatePayload(input)},request);
 let response:Json;
 try{response=await call();}
 catch(error){
  if(!shouldRetryCorporateCreation(error))throw error;
  // VFD explicitly asks clients to submit another creation request for status 99.
  // Corporate duplicates return status 01 with the existing account, so this
  // single bounded retry also recovers a first request that completed late.
  try{response=await call();}catch(retryError){throw corporateRetryFailure(retryError);}
 }
 const data=object(response.data);const account=object(data.account);const accountNumber=String(data.accountNo??data.accountNumber??account.accountNo??account.accountNumber??account.number??'');
 const accountName=String(data.accountName??data.client??data.name??input.companyName).trim();
 if(!/^\d{10}$/.test(accountNumber)||!accountName)throw new VfdError('unavailable','VFD_INVALID_CORPORATE_ACCOUNT');
 return{accountNumber,accountName,customerReference:String(data.clientId??data.customerId??data.id??'')||null,recovered:String(response.status)==='01'};
}

export function publicCorporateVfdError(error:VfdError){
 const providerMessage=error.message.toLowerCase();
 if(/invalid\s+rc|invalid\s+incorporation\s*number/.test(providerMessage))return{
  code:'VFD_INVALID_RC',
  message:'VFD did not recognize this registration number. Review the RC number and legal business name, then try again.',
 };
 if(/invalid\s+nin/.test(providerMessage))return{
  code:'VFD_INVALID_NIN',
  message:'VFD could not verify the director’s NIN. Review it and try again.',
 };
 if(/invalid\s+bvn|bvn service/.test(providerMessage))return{
  code:'VFD_INVALID_BVN',
  message:'VFD could not verify the director’s BVN. Review it and try again.',
 };
 if(/company.*exist|client account exists/.test(providerMessage))return{
  code:'VFD_CORPORATE_ACCOUNT_EXISTS',
  message:'VFD already has an account for this business. Oynk needs to recover and link that account.',
 };
 return{
  code:error.code,
  message:'VFD could not verify these business details. Review them and try again.',
 };
}
