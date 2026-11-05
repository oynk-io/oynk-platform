import { createHash } from 'node:crypto';
import { funding } from '../settings.js';
import type { BankTransferInstructions, FiatPayoutProvider, FiatRampProvider, VerifiedFiatReceipt } from './types.js';
import { VfdError, vfdConfigured, vfdEnvironment, vfdRequest } from './vfdClient.js';

type Json=Record<string,unknown>;
const asObject=(value:unknown):Json=>value&&typeof value==='object'&&!Array.isArray(value)?value as Json:{};
const naira=(minor:string)=>{const value=BigInt(minor);return `${value/100n}.${(value%100n).toString().padStart(2,'0')}`;};
const kobo=(major:unknown)=>{
 const match=String(major??'').match(/^(\d+)(?:\.(\d+))?$/);if(!match)throw new VfdError('unavailable','VFD_INVALID_AMOUNT');
 const fraction=match[2]??'';if(/[1-9]/.test(fraction.slice(2)))throw new VfdError('unavailable','VFD_INVALID_AMOUNT');
 const value=BigInt(match[1])*100n+BigInt(fraction.slice(0,2).padEnd(2,'0')||'0');if(value>BigInt(Number.MAX_SAFE_INTEGER))throw new VfdError('unavailable','VFD_AMOUNT_TOO_LARGE');return Number(value);
};
const expiryMinutes=(expiresAt:string)=>String(Math.max(1,Math.min(4320,Math.ceil((Date.parse(expiresAt)-Date.now())/60000))));
const accountNumber=(data:Json)=>String(data.accountNumber??data.accountNo??data.merchantAccountNo??'');

export async function vfdAccount(account?:string){
 const suffix=account?`?accountNumber=${encodeURIComponent(account)}`:'';
 const data=asObject((await vfdRequest(`/account/enquiry${suffix}`)).data);
 const number=String(data.accountNo??'');
 if(!/^\d{10}$/.test(number)||(account&&number!==account))throw new VfdError('configuration','VFD_ACCOUNT_UNAVAILABLE');
 const balance=data.accountBalance??data.availableBalance??data.balance;
 if(balance===undefined||balance===null)throw new VfdError('unavailable','VFD_BALANCE_UNAVAILABLE');
 return{accountNumber:number,accountName:String(data.client??funding.VFD_MERCHANT_NAME),balanceMinor:kobo(balance),raw:data};
}

async function virtualAccounts(){
 const response=await vfdRequest('/sub-accounts?entity=virtual&page=0&size=100');const data=asObject(response.data);return Array.isArray(data.content)?data.content.map(asObject):[];
}
async function recover(reference:string,expiresAt=new Date(Date.now()+30*60000).toISOString()):Promise<BankTransferInstructions|null>{
 const found=(await virtualAccounts()).find(item=>item.reference===reference);const number=found?accountNumber(found):'';if(!/^\d{10}$/.test(number))return null;
 return{accountNumber:number,accountName:funding.VFD_MERCHANT_NAME,bankName:'VFD Microfinance Bank',expiresAt};
}

export const vfdRampProvider:FiatRampProvider={id:'VFD',environment:vfdEnvironment,configured:vfdConfigured,
 collectionFeeMinor(gross){const calculated=(gross*BigInt(funding.VFD_COLLECTION_FEE_BPS)+9999n)/10000n+BigInt(funding.VFD_COLLECTION_FEE_FLAT_KOBO);const cap=funding.VFD_COLLECTION_FEE_CAP_KOBO;return cap===undefined?calculated:(calculated>BigInt(cap)?BigInt(cap):calculated);},
 async createBankTransfer(input){
  const body={amount:naira(input.amountMinor),merchantName:funding.VFD_MERCHANT_NAME,merchantId:input.accountId,reference:input.reference,validityTime:expiryMinutes(input.expiresAt),amountValidation:'A0'};
  try{
   const response=await vfdRequest('/virtualaccount',{method:'POST',body});const number=accountNumber(response);if(!/^\d{10}$/.test(number)||response.reference!==input.reference)throw new VfdError('unavailable','VFD_INVALID_VIRTUAL_ACCOUNT');
   return{accountNumber:number,accountName:funding.VFD_MERCHANT_NAME,bankName:'VFD Microfinance Bank',expiresAt:input.expiresAt};
  }catch(error){
   if(error instanceof VfdError&&error.code==='VFD_98'){const existing=await recover(input.reference,input.expiresAt);if(existing)return existing;}
   throw error;
  }
 },
 recoverBankTransfer:reference=>recover(reference),
 // Settled VFD inflows are finalized from the authenticated inward-credit
 // webhook. Polling cannot safely infer settlement from virtual-account state.
 async verify(reference){return{reference,providerReference:'',currency:'NGN',amountMinor:0,feeMinor:0,paidAt:new Date(0).toISOString(),status:'pending',channel:'bank_transfer'} as VerifiedFiatReceipt;},
};

type Destination={accountName:string;accountNumber:string;bankCode:string};
const encodeDestination=(value:Destination)=>Buffer.from(JSON.stringify(value)).toString('base64url');
const decodeDestination=(value:string):Destination=>{try{const parsed=JSON.parse(Buffer.from(value,'base64url').toString('utf8')) as Destination;if(!parsed.accountName||!/^\d{10}$/.test(parsed.accountNumber)||!parsed.bankCode)throw new Error();return parsed;}catch{throw new VfdError('rejected','VFD_INVALID_DESTINATION');}};
const VFD_TRANSFER_RESPONSE_CODES=['00','01','02','03','05','06','07','08','09','12','13','14','15','16','17','18','21','25','26','30','34','35','51','57','58','61','63','65','68','69','70','71','81','91','92','94','96','97','98','99','500'];
const VFD_FAILED_TRANSFER_CODES=new Set(['03','05','06','07','08','12','13','14','15','16','17','18','21','30','34','35','51','57','58','61','63','65','68','69','70','71','81','91','92','97','99']);
// VFD explicitly classifies 09, 25, 94, 96, and 500 as pending. Treat
// undocumented values as processing too: only a documented final failure may
// release escrow back to the customer.
const payoutStatus=(value:unknown):'pending'|'processing'|'success'|'failed'=>{const status=String(value??'');if(status==='00'||status==='26')return'success';if(VFD_FAILED_TRANSFER_CODES.has(status)||status==='null')return'failed';return'processing';};

export const vfdPayoutProvider:FiatPayoutProvider={id:'VFD',environment:vfdEnvironment,configured:vfdConfigured,
 async listBanks(){const response=await vfdRequest('/bank');const data=asObject(response.data);const values=Array.isArray(response.data)?response.data:Array.isArray(data.bank)?data.bank:Array.isArray(data.content)?data.content:[];const unique=new Map<string,{name:string;code:string}>();for(const value of values){const item=asObject(value),name=String(item.name??item.bankName??'').trim(),code=String(item.code??item.bankCode??'').trim();if(name&&code&&!unique.has(code))unique.set(code,{name,code});}return[...unique.values()].sort((a,b)=>a.name.localeCompare(b.name));},
 async resolveDestination(input){const transferType=input.bankCode==='999999'?'intra':'inter';const query=new URLSearchParams({accountNo:input.accountNumber,bank:input.bankCode,transfer_type:transferType});const response=await vfdRequest(`/transfer/recipient?${query}`);const data=asObject(response.data);const account=asObject(data.account);const number=String(account.number??input.accountNumber);const name=String(data.name??'').trim();if(number!==input.accountNumber||!name)throw new VfdError('rejected','VFD_ACCOUNT_NOT_FOUND');return{accountName:name,accountNumber:number,bankCode:input.bankCode};},
 async createDestination(input){return{destinationToken:encodeDestination({accountName:input.name,accountNumber:input.accountNumber,bankCode:input.bankCode})};},
 async createPayout(input){
  const destination=decodeDestination(input.destinationToken);
  const requestedSource=input.sourceAccountNumber;
  const senderQuery=requestedSource?`?accountNumber=${encodeURIComponent(requestedSource)}`:'';
  const sender=asObject((await vfdRequest(`/account/enquiry${senderQuery}`)).data);const fromAccount=String(sender.accountNo??'');if(!/^\d{10}$/.test(fromAccount))throw new VfdError('configuration','VFD_PAYOUT_ACCOUNT_UNAVAILABLE');
  if(requestedSource&&fromAccount!==requestedSource)throw new VfdError('configuration','VFD_SOURCE_ACCOUNT_MISMATCH');
  if(!requestedSource&&funding.VFD_PAYOUT_ACCOUNT_NUMBER&&fromAccount!==funding.VFD_PAYOUT_ACCOUNT_NUMBER)throw new VfdError('configuration','VFD_PAYOUT_ACCOUNT_MISMATCH');
  const transferType=destination.bankCode==='999999'?'intra':'inter';const query=new URLSearchParams({accountNo:destination.accountNumber,bank:destination.bankCode,transfer_type:transferType});const recipient=asObject((await vfdRequest(`/transfer/recipient?${query}`)).data);const target=asObject(recipient.account);
  const signature=createHash('sha512').update(`${fromAccount}${destination.accountNumber}`).digest('hex');
  const body={fromAccount,uniqueSenderAccountId:'',fromClientId:String(sender.clientId??''),fromClient:String(sender.client??''),fromSavingsId:String(sender.accountId??''),fromBvn:String(sender.bvn??''),toClientId:transferType==='intra'?String(recipient.clientId??''):'',toClient:destination.accountName,toSavingsId:transferType==='intra'?String(target.id??''):'',toSession:transferType==='inter'?String(target.id??''):'',toBvn:String(recipient.bvn??''),toAccount:destination.accountNumber,toBank:destination.bankCode,signature,amount:naira(input.amountMinor),remark:requestedSource?'Oynk Pay conversion':'Oynk settlement',transferType,reference:input.reference};
  const response=await vfdRequest('/transfer',{method:'POST',body,acceptedStatuses:VFD_TRANSFER_RESPONSE_CODES,timeoutMs:30_000});const data=asObject(response.data);const providerReference=String(data.txnId??input.reference);
  // VFD requires a TSQ before a non-success transfer response is treated as
  // final. The worker polls with the same provider reference.
  const responseStatus=String(response.status??'');
  return{providerReference,status:responseStatus==='00'||responseStatus==='26'?'success':'processing'};
 },
 async verifyPayout(providerReference){const response=await vfdRequest(`/transactions?reference=${encodeURIComponent(providerReference)}`);const data=asObject(response.data);return{providerReference:String(data.TxnId??providerReference),status:payoutStatus(data.transactionStatus),paidAt:typeof data.transactionDate==='string'?data.transactionDate:undefined};},
};

export const vfdProviderInternals={naira,kobo,encodeDestination,decodeDestination,payoutStatus};
