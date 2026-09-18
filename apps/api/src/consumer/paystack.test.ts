import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.PAYSTACK_SECRET_KEY ||= 'sk_test_fixture_not_a_key';

test('Paystack classifies validation failures as definitive rejections', async () => {
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>Response.json({status:false,message:'Email Address is required',type:'validation_error',code:'missing_params'},{status:400});
  const {paystack,PaystackRequestError}=await import('./paystack.js');
  await assert.rejects(()=>paystack('/charge',{email:''}),error=>error instanceof PaystackRequestError&&error.kind==='rejected'&&error.code==='MISSING_PARAMS');
 } finally { globalThis.fetch=original; }
});

test('Paystack keeps retryable failures recoverable', async () => {
 const original=globalThis.fetch;
 try {
  globalThis.fetch=async()=>Response.json({status:false,message:'Try later'},{status:503});
  const {paystack,PaystackRequestError}=await import('./paystack.js');
  await assert.rejects(()=>paystack('/charge',{email:'test@example.invalid'}),error=>error instanceof PaystackRequestError&&error.kind==='unavailable');
 } finally { globalThis.fetch=original; }
});
