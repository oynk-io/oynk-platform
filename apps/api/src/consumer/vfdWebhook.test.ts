import assert from 'node:assert/strict';
import test from 'node:test';
import { isVfdDashboardTest, vfdOccurredAt, vfdWebhookPayload } from './vfdWebhook.js';

test('accepts the timezone-less timestamp delivered by VFD sandbox',()=>{
 const parsed=vfdWebhookPayload.safeParse({
  reference:'Oynk Technologies-20260922160102839',
  amount:'10000',
  account_number:'1001708305',
  timestamp:'2026-09-22T16:01:02.839',
  session_id:'090110260922170102167929321547',
 });
 assert.equal(parsed.success,true);
 assert.equal(vfdOccurredAt('2026-09-22T16:01:02.839').toISOString(),'2026-09-22T15:01:02.839Z');
});

test('preserves an explicit provider timezone',()=>{
 assert.equal(vfdOccurredAt('2026-09-22T16:01:02.839Z').toISOString(),'2026-09-22T16:01:02.839Z');
});

test('recognizes only VFD dashboard validation callbacks',()=>{
 const base={reference:'WebhookTest-19010',amount:'1000',account_number:'5999919199',timestamp:'2026-09-22T16:01:02.839',session_id:'00001111222233334455'};
 assert.equal(isVfdDashboardTest(base),true);
 assert.equal(isVfdDashboardTest({...base,account_number:'1001708305'}),false);
 assert.equal(isVfdDashboardTest({...base,reference:'Oynk Technologies-19010'}),false);
});
