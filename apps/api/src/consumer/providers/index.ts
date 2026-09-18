import { paystackPayoutProvider, paystackRampProvider } from './paystackProvider.js';
import type { FiatPayoutProvider, FiatRampProvider } from './types.js';
const providers=new Map<string,FiatRampProvider>([[paystackRampProvider.id,paystackRampProvider]]);
export function fiatRampProvider(id=process.env.OYNK_DEFAULT_FIAT_PROVIDER??'PAYSTACK'):FiatRampProvider{const provider=providers.get(id.toUpperCase());if(!provider)throw new Error('Configured fiat ramp provider is unavailable');return provider;}
const payoutProviders=new Map<string,FiatPayoutProvider>([[paystackPayoutProvider.id,paystackPayoutProvider]]);
export function fiatPayoutProvider(id=process.env.OYNK_DEFAULT_FIAT_PROVIDER??'PAYSTACK'):FiatPayoutProvider{const provider=payoutProviders.get(id.toUpperCase());if(!provider)throw new Error('Configured fiat payout provider is unavailable');return provider;}
