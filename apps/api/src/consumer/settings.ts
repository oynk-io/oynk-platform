import '../config.js';
import { z } from 'zod';
export const funding = z.object({
 SOCKETFI_CLIENT_ID: z.string().default('sf_client_live_u3zqxglr2dhozi7z5z73o3wchwkm'),
 SOCKETFI_CLIENT_SECRET: z.string().default(''),
 SOCKETFI_API_URL: z.url().default('https://api.socket.fi'),
 PAYSTACK_SECRET_KEY: z.string().default(''),
 OYNK_DEFAULT_FIAT_PROVIDER: z.enum(['PAYSTACK','VFD']).default('VFD'),
 OYNK_FIAT_COLLECTION_PROVIDER: z.enum(['PAYSTACK','VFD']).optional(),
 OYNK_FIAT_PAYOUT_PROVIDER: z.enum(['PAYSTACK','VFD']).optional(),
 VFD_CONSUMER_KEY: z.string().default(''),
 VFD_CONSUMER_SECRET: z.string().default(''),
 VFD_ENVIRONMENT: z.enum(['TEST','LIVE']).default('TEST'),
 VFD_WEBHOOK_SECRET: z.string().default(''),
 VFD_WALLET_PREFIX: z.string().regex(/^[A-Za-z0-9_-]{2,30}$/).default('oynk'),
 VFD_MERCHANT_NAME: z.string().trim().min(2).max(100).default('Oynk Technologies'),
 VFD_BUSINESS_ACCOUNT_MODEL: z.literal('ONE_TO_ONE').default('ONE_TO_ONE'),
 VFD_PAYOUT_ACCOUNT_NUMBER: z.string().regex(/^\d{10}$/).or(z.literal('')).default(''),
 VFD_MART_HOLDING_ACCOUNT_NUMBER: z.string().regex(/^\d{10}$/).or(z.literal('')).default(''),
 VFD_COLLECTION_FEE_BPS: z.coerce.number().int().min(0).max(10000).default(0),
 VFD_COLLECTION_FEE_FLAT_KOBO: z.coerce.number().int().min(0).default(0),
 VFD_COLLECTION_FEE_CAP_KOBO: z.coerce.number().int().positive().optional(),
}).parse(process.env);
export const paystackDomain = funding.PAYSTACK_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test';
