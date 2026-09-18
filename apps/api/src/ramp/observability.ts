type RampLog = { event: string; transactionId?: string; direction?: string; state?: string; provider?: string; code?: string; durationMs?: number };

export function rampLog(level: 'info' | 'warn' | 'error', value: RampLog): void {
 // Keep this deliberately allow-listed: no phone, email, bank details, tokens or provider payloads.
 const record = { service: 'oynk-api', component: 'ramp', at: new Date().toISOString(), ...value };
 (level === 'error' ? console.error : level === 'warn' ? console.warn : console.info)(JSON.stringify(record));
}
