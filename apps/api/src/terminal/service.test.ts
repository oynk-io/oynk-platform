import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateFiatOfflinePayment, reconciliationDelaySeconds, terminalReceiptNumber } from './service.js';

const base={
  enabled:true,
  expired:false,
  spentKobo:0n,
  reservedKobo:0n,
  amountKobo:100_000n,
  limitKobo:1_000_000n,
  balanceKobo:2_000_000n,
};

test('fiat Offline Pay accepts an amount exactly at the remaining rolling limit',()=>{
  assert.equal(evaluateFiatOfflinePayment({...base,spentKobo:900_000n}),null);
});

test('fiat Offline Pay rejects one kobo above the rolling limit',()=>{
  assert.equal(evaluateFiatOfflinePayment({...base,spentKobo:900_001n}),'OFFLINE_LIMIT_EXCEEDED');
});

test('fiat Offline Pay requires an active, unexpired policy',()=>{
  assert.equal(evaluateFiatOfflinePayment({...base,enabled:false}),'OFFLINE_PAY_INACTIVE');
  assert.equal(evaluateFiatOfflinePayment({...base,expired:true}),'OFFLINE_PAY_INACTIVE');
});

test('fiat Offline Pay cannot exceed the current VFD balance',()=>{
  assert.equal(evaluateFiatOfflinePayment({...base,balanceKobo:99_999n}),'INSUFFICIENT_BALANCE');
  assert.equal(evaluateFiatOfflinePayment({...base,balanceKobo:100_000n}),null);
});

test('fiat Offline Pay reserves concurrent authorizing and processing payments',()=>{
  assert.equal(evaluateFiatOfflinePayment({...base,reservedKobo:900_001n}),'OFFLINE_LIMIT_EXCEEDED');
  assert.equal(evaluateFiatOfflinePayment({...base,reservedKobo:100_000n,balanceKobo:199_999n}),'INSUFFICIENT_BALANCE');
  assert.equal(evaluateFiatOfflinePayment({...base,reservedKobo:100_000n,balanceKobo:200_000n}),null);
});

test('terminal receipts are stable and do not expose the full payment id',()=>{
  const id='bf7e8d83-ac15-4139-b524-811901b6ce72';
  assert.equal(terminalReceiptNumber(id),'OYNK-BF7E8D83AC15');
  assert.equal(terminalReceiptNumber(id),terminalReceiptNumber(id));
  assert.equal(terminalReceiptNumber(id).includes('4139'),false);
});

test('terminal reconciliation uses bounded exponential backoff',()=>{
  assert.equal(reconciliationDelaySeconds(0),15);
  assert.equal(reconciliationDelaySeconds(1),30);
  assert.equal(reconciliationDelaySeconds(4),240);
  assert.equal(reconciliationDelaySeconds(20),900);
});
