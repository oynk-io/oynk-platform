export type BankTransferInstructions={accountNumber:string;accountName:string;bankName:string;expiresAt:string};
export type VerifiedFiatReceipt={reference:string;providerReference:string;currency:'NGN';amountMinor:number;feeMinor:number;paidAt:string;status:'success'|'pending'|'failed';channel:string};
export interface FiatRampProvider{
 readonly id:string;
 readonly environment:'test'|'live';
 readonly configured:boolean;
 createBankTransfer(input:{reference:string;amountMinor:string;email:string;accountId:string;expiresAt:string}):Promise<BankTransferInstructions>;
 recoverBankTransfer?(reference:string):Promise<BankTransferInstructions|null>;
 verify(reference:string):Promise<VerifiedFiatReceipt>;
}
export interface FiatPayoutProvider{
 readonly id:string;readonly environment:'test'|'live';readonly configured:boolean;
 listBanks(currency:'NGN'):Promise<Array<{name:string;code:string}>>;
 resolveDestination(input:{accountNumber:string;bankCode:string}):Promise<{accountName:string;accountNumber:string;bankCode:string}>;
 createDestination(input:{name:string;accountNumber:string;bankCode:string;currency:'NGN'}):Promise<{destinationToken:string}>;
 createPayout(input:{reference:string;amountMinor:string;currency:'NGN';destinationToken:string;idempotencyKey:string}):Promise<{providerReference:string;status:'pending'|'processing'|'success'|'failed'}>;
 verifyPayout(providerReference:string):Promise<{providerReference:string;status:'pending'|'processing'|'success'|'failed';paidAt?:string}>;
}
