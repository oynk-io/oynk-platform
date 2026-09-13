export const limits = { 1: 5_000_000n, 2: 20_000_000n, 3: 500_000_000n } as const;
export function kobo(value: unknown): bigint {
 if (typeof value !== 'string' || !/^(0|[1-9]\d{0,10})(\.\d{1,2})?$/.test(value)) throw new Error('Enter a valid naira amount with at most two decimals.');
 const [whole, fraction = ''] = value.split('.');
 return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function rollingAllowance(tier: 1 | 2 | 3, entries: { amount: bigint; at: number }[], now: number) {
 const active = entries.filter(x => x.at > now - 86_400_000);
 const used = active.reduce((sum, x) => sum + x.amount, 0n);
 return { limitKobo: String(limits[tier]), usedKobo: String(used), remainingKobo: String(used >= limits[tier] ? 0n : limits[tier] - used),
  nextReleaseAt: active.length ? new Date(Math.min(...active.map(x => x.at)) + 86_400_000).toISOString() : null };
}

// Nigerian Pay with Transfer standard local pricing; fee is charged on the gross.
// Find the smallest gross amount that leaves the requested deposit after fees.
export function transferQuote(principal: bigint, rate: bigint | null) {
 const fee = (gross: bigint) => {
  const calculated = (gross * 150n + 9999n) / 10000n + (gross < 250000n ? 0n : 10000n);
  return calculated > 200000n ? 200000n : calculated;
 };
 let low = principal, high = principal + 200000n;
 // Net is discontinuous at the flat-fee threshold, so search each pricing band.
 const candidates: bigint[] = [];
 for (const [start, end] of [[low, high < 249999n ? high : 249999n], [low > 250000n ? low : 250000n, high]]) {
  let left = start, right = end;
  if (left > right || right - fee(right) < principal) continue;
  while (left < right) { const mid = (left + right) / 2n; if (mid - fee(mid) >= principal) right = mid; else left = mid + 1n; }
  candidates.push(left);
 }
 const gross = candidates.reduce((a,b) => a < b ? a : b);
 return { depositKobo: String(principal), feeKobo: String(gross - principal), totalKobo: String(gross),
  rateKoboPerUsdc: rate ? String(rate) : null,
  estimatedUsdcAtomic: rate ? String(principal * 10_000_000n / rate) : null,
  indicative: true, settlement: 'not_available' as const };
}
