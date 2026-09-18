-- Preserve pre-control-layer Paystack activity in the canonical ramp ledger.
-- Unknown USDC amounts fail into manual review instead of bypassing policy.
WITH source AS (
 SELECT i.reference,i.account_id,a.subject,a.wallet,a.network,i.quote,i.state intent_state,
  r.provider_id,r.state receipt_state,r.reason,p.id policy_id,p.version policy_version,
  NULLIF(i.quote->>'estimatedUsdcAtomic','')::NUMERIC(30,0) usdc_atomic,
  (i.quote->>'depositKobo')::BIGINT fiat_minor,(i.quote->>'feeKobo')::BIGINT fee_minor,
  p.manual_threshold_usdc_atomic threshold_atomic
 FROM consumer_deposit_intents i JOIN consumer_accounts a ON a.id=i.account_id
 LEFT JOIN consumer_fiat_receipts r ON r.reference=i.reference
 JOIN ramp_policy_configs p ON p.direction='ON_RAMP'
 WHERE i.ramp_transaction_id IS NULL
), inserted AS (
 INSERT INTO ramp_transactions(id,reference,idempotency_key,direction,state,approval_state,risk_state,consumer_account_id,subject_reference,wallet_address,network,fiat_currency,fiat_amount_minor,usdc_amount_atomic,fee_fiat_minor,provider,provider_reference,provider_status,failure_code,policy_id,policy_version,policy_snapshot,metadata)
 SELECT gen_random_uuid(),reference,'legacy-consumer-on-ramp:'||reference,'ON_RAMP',
  CASE WHEN intent_state='expired' THEN 'CANCELLED'
       WHEN receipt_state='review' OR usdc_atomic IS NULL OR usdc_atomic>threshold_atomic THEN 'PENDING_APPROVAL'
       WHEN receipt_state='fiat_received' THEN 'APPROVED' ELSE 'CREATED' END,
  CASE WHEN receipt_state='review' OR usdc_atomic IS NULL OR usdc_atomic>threshold_atomic THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
  CASE WHEN receipt_state='review' OR usdc_atomic IS NULL OR usdc_atomic>threshold_atomic THEN 'REVIEW_REQUIRED' ELSE 'CLEAR' END,
  account_id,subject,wallet,network,'NGN',fiat_minor,usdc_atomic,fee_minor,'PAYSTACK',provider_id,
  CASE WHEN receipt_state='fiat_received' THEN 'CONFIRMED' WHEN receipt_state='review' THEN 'REVIEW' ELSE NULL END,
  reason,policy_id,policy_version,
  jsonb_build_object('backfilled',TRUE,'manualThresholdUsdcAtomic',threshold_atomic::TEXT),
  jsonb_build_object('source','consumer_deposit_backfill')
 FROM source ON CONFLICT(reference) DO NOTHING RETURNING id,reference,state,approval_state,policy_id,policy_version,usdc_amount_atomic
)
UPDATE consumer_deposit_intents i SET ramp_transaction_id=t.id FROM ramp_transactions t
WHERE t.reference=i.reference AND i.ramp_transaction_id IS NULL;

INSERT INTO ramp_policy_decisions(id,transaction_id,policy_id,policy_version,outcome,reason_codes,evaluated_amount_usdc_atomic,cumulative_amount_usdc_atomic,facts)
SELECT gen_random_uuid(),t.id,t.policy_id,t.policy_version,
 CASE WHEN t.approval_state='PENDING' THEN 'MANUAL_APPROVAL' ELSE 'AUTO_APPROVED' END,
 CASE WHEN t.usdc_amount_atomic IS NULL THEN ARRAY['USDC_AMOUNT_UNAVAILABLE']::TEXT[]
      WHEN t.failure_code IS NOT NULL THEN ARRAY['LEGACY_RECEIPT_REVIEW']::TEXT[]
      WHEN t.approval_state='PENDING' THEN ARRAY['AMOUNT_THRESHOLD_EXCEEDED']::TEXT[] ELSE ARRAY[]::TEXT[] END,
 t.usdc_amount_atomic,t.usdc_amount_atomic,jsonb_build_object('backfilled',TRUE)
FROM ramp_transactions t
WHERE t.metadata->>'source'='consumer_deposit_backfill'
AND NOT EXISTS(SELECT 1 FROM ramp_policy_decisions d WHERE d.transaction_id=t.id);

INSERT INTO ramp_transaction_events(id,transaction_id,event_type,from_state,to_state,actor_type,details)
SELECT gen_random_uuid(),t.id,'TRANSACTION_BACKFILLED',NULL,t.state,'SYSTEM',jsonb_build_object('source','consumer_deposit_intents')
FROM ramp_transactions t
WHERE t.metadata->>'source'='consumer_deposit_backfill'
AND NOT EXISTS(SELECT 1 FROM ramp_transaction_events e WHERE e.transaction_id=t.id AND e.event_type='TRANSACTION_BACKFILLED');
