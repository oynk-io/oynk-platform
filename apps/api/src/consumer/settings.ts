import '../config.js';
import { z } from 'zod';
export const funding = z.object({
 SOCKETFI_CLIENT_ID: z.string().default('sf_client_live_u3zqxglr2dhozi7z5z73o3wchwkm'),
 SOCKETFI_CLIENT_SECRET: z.string().default(''),
 SOCKETFI_API_URL: z.url().default('https://api.socket.fi'),
 PAYSTACK_SECRET_KEY: z.string().default(''),
 OYNK_NGN_PER_USDC: z.string().default(''),
 OYNK_RATE_EXPIRES_AT: z.string().default(''),
}).parse(process.env);
export const paystackDomain = funding.PAYSTACK_SECRET_KEY.startsWith('sk_live_') ? 'live' : 'test';
