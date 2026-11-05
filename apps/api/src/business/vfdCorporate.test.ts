import assert from 'node:assert/strict';
import test from 'node:test';
import { VfdError } from '../consumer/providers/vfdClient.js';
import { corporateRetryFailure, publicCorporateVfdError, shouldRetryCorporateCreation, vfdBusinessType, vfdCorporateDate, vfdCorporatePayload, vfdRegistrationNumber } from './vfdCorporate.js';

test('formats the incorporation date exactly as VFD corporate creation requires',()=>{
 assert.equal(vfdCorporateDate('2021-01-05'),'05 January 2021');
 assert.throws(()=>vfdCorporateDate('2021-02-31'));
});

test('builds a one-to-one corporate account request without changing identity values',()=>{
 const payload=vfdCorporatePayload({registrationNumber:'RC12345',companyName:'Oynk Test Store',incorporationDate:'2021-01-05',bvn:'22228819111',nin:'23230042941',taxIdentificationNumber:'TIN-1',address:'5 Johnson Street, Ikeja',state:'Lagos',businessType:'RC'});
 assert.deepEqual(payload,{rcNumber:'12345',companyName:'Oynk Test Store',incorporationDate:'05 January 2021',bvn:'22228819111',nin:'23230042941',tin:'TIN-1',address:'5 Johnson Street, Ikeja',businessType:'RC',state:'Lagos'});
});

test('maps Nigerian registered companies and business names to VFD types',()=>{
 assert.equal(vfdBusinessType('Limited liability company'),'RC');
 assert.equal(vfdBusinessType('RC'),'RC');
 assert.equal(vfdBusinessType('Sole proprietorship'),'BN');
 assert.equal(vfdBusinessType('Partnership'),'BN');
 assert.equal(vfdBusinessType('BN'),'BN');
 assert.equal(vfdRegistrationNumber('BN-0981771'),'0981771');
});

test('returns a safe and actionable registration error without echoing the RC number',()=>{
 const result=publicCorporateVfdError(new VfdError('rejected','VFD_199','Invalid RC: 1234567'));
 assert.deepEqual(result,{code:'VFD_INVALID_RC',message:'VFD did not recognize this registration number. Review the RC number and legal business name, then try again.'});
 assert.equal(result.message.includes('1234567'),false);
});

test('retries only the VFD corporate status that explicitly requests another submission',()=>{
 assert.equal(shouldRetryCorporateCreation(new VfdError('unavailable','VFD_99')),true);
 assert.equal(shouldRetryCorporateCreation(new VfdError('unavailable','VFD_NETWORK')),false);
 assert.equal(shouldRetryCorporateCreation(new VfdError('rejected','VFD_199')),false);
});

test('classifies a repeated VFD status 99 as provider configuration instead of asking forever',()=>{
 const result=corporateRetryFailure(new VfdError('unavailable','VFD_99','Try Again'));
 assert.equal(result instanceof VfdError,true);
 assert.equal((result as VfdError).kind,'configuration');
 assert.equal((result as VfdError).code,'VFD_CORPORATE_CREATION_UNAVAILABLE');
 assert.equal((result as VfdError).message,'Try Again');
});
