import type { PolicyDecision, RampPolicy } from './types.js';

export function evaluateRampPolicy(input: {
 policy: RampPolicy;
 amountUsdcAtomic: bigint | null;
 priorWindowAmountUsdcAtomic?: bigint;
}): PolicyDecision {
 const prior = input.priorWindowAmountUsdcAtomic ?? 0n;
 const amount = input.amountUsdcAtomic;
 if (!input.policy.enabled) return {
  outcome: 'BLOCKED', reasonCodes: ['POLICY_DISABLED'], approvalState: 'PENDING',
  riskState: 'BLOCKED', state: 'PENDING_APPROVAL', cumulativeAmountUsdcAtomic: prior + (amount ?? 0n),
 };
 const reasons: string[] = [];
 if (amount === null) reasons.push('USDC_AMOUNT_UNAVAILABLE');
 if (amount !== null && amount > input.policy.manualThresholdUsdcAtomic) reasons.push('AMOUNT_THRESHOLD_EXCEEDED');
 const cumulative = prior + (amount ?? 0n);
 if (input.policy.cumulativeEnabled && input.policy.cumulativeThresholdUsdcAtomic !== null && cumulative > input.policy.cumulativeThresholdUsdcAtomic) reasons.push('CUMULATIVE_THRESHOLD_EXCEEDED');
 const manual = reasons.length > 0;
 return {
  outcome: manual ? 'MANUAL_APPROVAL' : 'AUTO_APPROVED', reasonCodes: reasons,
  approvalState: manual ? 'PENDING' : 'NOT_REQUIRED', riskState: manual ? 'REVIEW_REQUIRED' : 'CLEAR',
  state: manual ? 'PENDING_APPROVAL' : 'CREATED', cumulativeAmountUsdcAtomic: cumulative,
 };
}
