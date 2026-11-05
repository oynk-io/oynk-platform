import { VfdError, vfdConfigured, vfdEnvironment, vfdRequest } from './vfdClient.js';
import { vfdAccount } from './vfdProvider.js';

export type VfdTierUpgradeInput={accountNumber:string;targetTier:2|3;identityType?:'nin'|'bvn';identityNumber?:string;address?:string};

export function vfdTierUpgradeBody(input:VfdTierUpgradeInput){
 const body:Record<string,string>={accountNo:input.accountNumber};
 if(input.targetTier===2){
  if(!input.identityType||!input.identityNumber)throw new Error('Missing identity upgrade details.');
  body[input.identityType]=input.identityNumber;
 }else{
  if(!input.address)throw new Error('Missing address.');
  body.address=input.address;
 }
 return body;
}

export const vfdDepositAccountProvider={
 id:'VFD',environment:vfdEnvironment,configured:vfdConfigured,
 async createIndividual(input:{identityType:'nin'|'bvn';identityNumber:string;dateOfBirth:string}){
  const dateOfBirth=input.identityType==='bvn'?bvnDate(input.dateOfBirth):input.dateOfBirth;
  const query=new URLSearchParams({[input.identityType]:input.identityNumber,dateOfBirth});
  // Status 01 means this sandbox identity already has a VFD account. Treat it
  // as recovery after an ambiguous timeout rather than creating another one.
  // VFD's sandbox identity lookup regularly takes longer than the default
  // request budget. Status 01 makes a retry recover the already-created
  // account, so allow the provider enough time to return a definitive result.
  const startedAt=Date.now();
  const create=()=>vfdRequest(`/client/tiers/individual?${query}`,{
   method:'POST',body:{},acceptedStatuses:['00','01'],
   timeoutMs:Math.min(55_000,Math.max(5_000,65_000-(Date.now()-startedAt))),
  });
  let response:Awaited<ReturnType<typeof vfdRequest>>;
  try{response=await create();}
  catch(error){
   // VFD status 99 explicitly asks for another creation request. A successful
   // first request is recovered by their status 01 response on the retry.
   // Do not retry an ambiguous network timeout or a definitive identity error.
   if(!(error instanceof VfdError&&error.code==='VFD_99'))throw error;
   response=await create();
  }
  const data=response.data as Record<string,unknown>|undefined;
  const accountNumber=data?.accountNo;
  if(typeof accountNumber!=='string'||!/^\d{10}$/.test(accountNumber))throw new Error('VFD returned incomplete account details.');
  let accountName=typeof data?.accountName==='string'&&data.accountName.trim()?data.accountName.trim():[data?.firstname,data?.middlename,data?.lastname].filter(value=>typeof value==='string'&&value.trim()).join(' ').trim();
  let recovered:Awaited<ReturnType<typeof vfdAccount>>|null=null;
  if(!accountName){recovered=await vfdAccount(accountNumber);accountName=recovered.accountName;}
  if(!accountName)throw new Error('VFD returned incomplete account details.');
  return{accountNumber,accountName,bankName:'VFD Microfinance Bank',firstName:typeof data?.firstname==='string'?data.firstname:null,middleName:typeof data?.middlename==='string'?data.middlename:null,lastName:typeof data?.lastname==='string'?data.lastname:null,providerTier:Number(data?.currentTier??1),providerCustomerReference:typeof data?.clientId==='string'?data.clientId:typeof recovered?.raw.clientId==='string'?recovered.raw.clientId:null,providerAccountReference:typeof data?.accountId==='string'?data.accountId:typeof recovered?.raw.accountId==='string'?recovered.raw.accountId:accountNumber};
 },
 async upgradeIndividual(input:VfdTierUpgradeInput){
  const body=vfdTierUpgradeBody(input);
  const response=await vfdRequest('/client/update',{method:'POST',body});
  const data=response.data as Record<string,unknown>|undefined;
  // A status 00 without the documented currentTier is not enough to advance
  // Oynk's local limits. Fail closed until VFD confirms the resulting tier.
  const providerTier=Number(data?.currentTier);
  if(providerTier!==input.targetTier)throw new Error('VFD returned an unexpected account tier.');
  return{providerTier,firstName:typeof data?.firstname==='string'?data.firstname:null,middleName:typeof data?.middlename==='string'?data.middlename:null,lastName:typeof data?.lastname==='string'?data.lastname:null};
 }
};

function bvnDate(value:string){
 const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!match)throw new Error('Invalid date of birth.');
 const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(match[2])-1];
 if(!month)throw new Error('Invalid date of birth.');
 return`${match[3]}-${month}-${match[1]}`;
}
