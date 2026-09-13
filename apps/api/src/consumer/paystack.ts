import { createHmac, timingSafeEqual } from 'node:crypto';
import { funding } from './settings.js';
export function validSignature(raw: Buffer, signature: string | undefined, secret = funding.PAYSTACK_SECRET_KEY) {
 if (!secret || !signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
 return timingSafeEqual(createHmac('sha512', secret).update(raw).digest(), Buffer.from(signature, 'hex'));
}
export async function paystack(path: string, body?: Record<string, unknown>): Promise<Record<string, any>> {
 if (!/^sk_(test|live)_/.test(funding.PAYSTACK_SECRET_KEY)) throw new Error('Naira deposits are being configured. Please try again later.');
 const response = await fetch(`https://api.paystack.co${path}`, { method: body ? 'POST' : 'GET', redirect: 'error', headers: { Authorization: `Bearer ${funding.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000) });
 const value = await response.json() as { status?: boolean; data?: Record<string, any> };
 if (!response.ok || value.status !== true || !value.data) throw new Error('Paystack could not complete the request. Additional customer verification may be required.');
 return value.data;
}
