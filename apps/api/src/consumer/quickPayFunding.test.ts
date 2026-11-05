import assert from 'node:assert/strict';
import test from 'node:test';
import { availableQuickPayAllowance, availableQuickPayOutboundAllowance, tierUpgradeRequirement, tierUpgradeReviewPending, verifiedLegalName } from './quickPayFunding.js';
import { VfdError } from './providers/vfdClient.js';

test('Only an explicit VFD Tier 3 review response enters pending review',()=>{
 assert.equal(tierUpgradeReviewPending(3,new VfdError('rejected','VFD_01','Request pending review')),true);
 assert.equal(tierUpgradeReviewPending(2,new VfdError('rejected','VFD_01','Request pending review')),false);
 assert.equal(tierUpgradeReviewPending(3,new VfdError('unavailable','VFD_NETWORK')),false);
});

test('Quick Pay shares the rolling tier allowance between credits and reserved conversions',()=>{
 const now=1_800_000_000_000;
 const result=availableQuickPayAllowance(1,[{amount:1_000_000n,at:now-1_000}],500_000n,now);
 assert.equal(result.limitKobo,'3000000');
 assert.equal(result.usedKobo,'1000000');
 assert.equal(result.reservedKobo,'500000');
 assert.equal(result.availableKobo,'1500000');
});

test('Quick Pay never exposes a negative allowance',()=>{
 const now=1_800_000_000_000;
 const result=availableQuickPayAllowance(1,[],6_000_000n,now);
 assert.equal(result.availableKobo,'0');
});

test('Quick Pay releases completed credits after their rolling window',()=>{
 const now=1_800_000_000_000;
 const entry={amount:3_000_000n,at:now-86_400_000};
 assert.equal(availableQuickPayAllowance(1,[entry],0n,now).availableKobo,'3000000');
});

test('Pay to Smart uses its own rolling conversion allowance',()=>{
 const now=1_800_000_000_000;
 const result=availableQuickPayOutboundAllowance(1,[{amount:1_250_000n,at:now-1_000}],now);
 assert.equal(result.limitKobo,'3000000');
 assert.equal(result.usedKobo,'1250000');
 assert.equal(result.remainingKobo,'1750000');
});

test('Pay to Smart releases conversion allowance after 24 hours',()=>{
 const now=1_800_000_000_000;
 const result=availableQuickPayOutboundAllowance(1,[{amount:3_000_000n,at:now-86_400_000}],now);
 assert.equal(result.remainingKobo,'3000000');
});
test('Tier 0 has no fiat allowance',()=>{assert.equal(availableQuickPayAllowance(0,[],0n,Date.now()).availableKobo,'0');});
test('VFD verified identity becomes the legal name without user-entered name matching',()=>{
 assert.deepEqual(verifiedLegalName({accountName:'Oynk Technologies-Ada Nneka Okafor',firstName:'Ada',middleName:'Nneka',lastName:'Okafor'}),{firstName:'Ada',middleName:'Nneka',lastName:'Okafor',fullName:'Ada Nneka Okafor'});
 assert.deepEqual(verifiedLegalName({accountName:'Oynk Technologies-Ada Nneka Okafor',firstName:null,middleName:null,lastName:null}),{firstName:'Ada',middleName:'Nneka',lastName:'Okafor',fullName:'Ada Nneka Okafor'});
});
test('Tier 2 requests the identity not used for Tier 1',()=>{
 assert.deepEqual(tierUpgradeRequirement(1,2,{provider_tier:1,initial_identity_type:'NIN',nin_fingerprint:'nin',bvn_fingerprint:null}),{missing:'bvn'});
 assert.deepEqual(tierUpgradeRequirement(1,2,{provider_tier:1,initial_identity_type:'BVN',nin_fingerprint:null,bvn_fingerprint:'bvn'}),{missing:'nin'});
});
test('Tier upgrades fail closed for inconsistent local and provider state',()=>{
 assert.throws(()=>tierUpgradeRequirement(1,2,{provider_tier:2,initial_identity_type:'NIN',nin_fingerprint:'nin',bvn_fingerprint:null}),/needs review/i);
 assert.throws(()=>tierUpgradeRequirement(1,2,{provider_tier:1,initial_identity_type:'NIN',nin_fingerprint:'nin',bvn_fingerprint:'bvn'}),/needs review/i);
 assert.throws(()=>tierUpgradeRequirement(1,3,{provider_tier:1,initial_identity_type:'NIN',nin_fingerprint:'nin',bvn_fingerprint:null}),/current account level/i);
 assert.throws(()=>tierUpgradeRequirement(2,3,{provider_tier:2,initial_identity_type:'NIN',nin_fingerprint:'nin',bvn_fingerprint:null}),/complete Tier 2/i);
});
