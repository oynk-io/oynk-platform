import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateRampPolicy } from './policy.js';
import type { RampPolicy } from './types.js';

const base: RampPolicy={id:'policy',direction:'ON_RAMP',enabled:true,manualThresholdUsdcAtomic:5_000_000_000n,cumulativeEnabled:false,cumulativeThresholdUsdcAtomic:null,cumulativeWindowSeconds:null,additionalRules:{},version:1};
test('exactly 500 USDC is automatic while any amount above it requires approval',()=>{
 assert.equal(evaluateRampPolicy({policy:base,amountUsdcAtomic:5_000_000_000n}).outcome,'AUTO_APPROVED');
 const above=evaluateRampPolicy({policy:base,amountUsdcAtomic:5_000_000_001n});assert.equal(above.outcome,'MANUAL_APPROVAL');assert.deepEqual(above.reasonCodes,['AMOUNT_THRESHOLD_EXCEEDED']);
});
test('an unknown settlement amount fails into review rather than bypassing policy',()=>{const result=evaluateRampPolicy({policy:base,amountUsdcAtomic:null});assert.equal(result.state,'PENDING_APPROVAL');assert.deepEqual(result.reasonCodes,['USDC_AMOUNT_UNAVAILABLE']);});
test('cumulative policy catches split transactions such as repeated 499 USDC ramps',()=>{const policy={...base,cumulativeEnabled:true,cumulativeThresholdUsdcAtomic:15_000_000_000n,cumulativeWindowSeconds:86400};const result=evaluateRampPolicy({policy,amountUsdcAtomic:4_990_000_000n,priorWindowAmountUsdcAtomic:14_970_000_000n});assert.equal(result.outcome,'MANUAL_APPROVAL');assert.ok(result.reasonCodes.includes('CUMULATIVE_THRESHOLD_EXCEEDED'));});
test('a disabled direction is blocked',()=>assert.equal(evaluateRampPolicy({policy:{...base,enabled:false},amountUsdcAtomic:1n}).outcome,'BLOCKED'));
