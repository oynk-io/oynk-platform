import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTerminal } from './activity.js';
const payment={id:'12345678-abcd-4321-abcd-123456789abc',business_name:'Test Store',amount_kobo:'500000',created_at:new Date(),updated_at:new Date()};
test('only confirmed terminal payments say Paid',()=>{
 for(const state of ['AWAITING_PIN','DECLINED','PROCESSING','FAILED']) {
  const item=normalizeTerminal({...payment,state});
  assert.equal(item.title,'Payment to Test Store');
  assert.equal(item.fiatAmountMinor,'500000');
  assert.equal(item.reference,`terminal:${payment.id}`);
 }
 assert.equal(normalizeTerminal({...payment,state:'COMPLETED'}).title,'Paid Test Store');
 assert.equal(normalizeTerminal({...payment,state:'REFUNDED'}).title,'Refund from Test Store');
});
