import { paystackPayoutProvider, paystackRampProvider } from './paystackProvider.js';
import { vfdPayoutProvider, vfdRampProvider } from './vfdProvider.js';
import { funding } from '../settings.js';
import type { FiatPayoutProvider, FiatRampProvider } from './types.js';
const providers=new Map<string,FiatRampProvider>([[paystackRampProvider.id,paystackRampProvider],[vfdRampProvider.id,vfdRampProvider]]);
const payoutProviders=new Map<string,FiatPayoutProvider>([[paystackPayoutProvider.id,paystackPayoutProvider],[vfdPayoutProvider.id,vfdPayoutProvider]]);

export function fiatRampProvider(id:string=funding.OYNK_FIAT_COLLECTION_PROVIDER??funding.OYNK_DEFAULT_FIAT_PROVIDER):FiatRampProvider{
 const provider=providers.get(id.toUpperCase());if(!provider)throw new Error('Configured fiat collection provider is unavailable');return provider;
}
export function fiatPayoutProvider(id:string=funding.OYNK_FIAT_PAYOUT_PROVIDER??funding.OYNK_DEFAULT_FIAT_PROVIDER):FiatPayoutProvider{
 const provider=payoutProviders.get(id.toUpperCase());if(!provider)throw new Error('Configured fiat payout provider is unavailable');return provider;
}
