import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kobo, rollingAllowance, transferQuote } from './money.js';
test('money parsing rejects floating-point and ambiguous input',()=>{
 assert.equal(kobo('10000.01'),1000001n);
 for (const bad of ['-1','1e5','NaN','1,000','0.001',100]) assert.throws(()=>kobo(bad));
});
test('Pay with Transfer fees are grossed up, including threshold and cap',()=>{
 assert.deepEqual(transferQuote(1000000n,143000n),{depositKobo:'1000000',feeKobo:'25381',totalKobo:'1025381',rateKoboPerUsdc:'143000',estimatedUsdcAtomic:'69930069',indicative:true,settlement:'not_available'});
 assert.equal(transferQuote(50000000n,null).feeKobo,'200000');
 for (const n of [5000n,240000n,246249n,246250n,249999n,250000n,1000000n,50000000n]) {
  const q = transferQuote(n,null); const total = BigInt(q.totalKobo);
  const baseFee=(total*150n+9999n)/10000n+(total<250000n?0n:10000n);
  assert.ok(total-(baseFee>200000n?200000n:baseFee)>=n);
 }
});
test('rolling allowance releases each payment after its own 24-hour boundary',()=>{
 const day=86400000, now=1800000000000;
 const entries=[{amount:1000000n,at:now},{amount:2000000n,at:now+3600000}];
 assert.equal(rollingAllowance(1,entries,now+7200000).remainingKobo,'2000000');
 assert.equal(rollingAllowance(1,entries,now+day).remainingKobo,'3000000');
 assert.equal(rollingAllowance(1,entries,now+day+3600000).remainingKobo,'5000000');
 assert.equal(rollingAllowance(2,[],now).remainingKobo,'20000000');
 assert.equal(rollingAllowance(3,[],now).remainingKobo,'500000000');
});
