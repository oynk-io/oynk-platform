ALTER TABLE consumer_offramp_intents
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE consumer_offramp_intents
SET expires_at = created_at + INTERVAL '5 minutes'
WHERE expires_at IS NULL;

ALTER TABLE consumer_offramp_intents
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '5 minutes'),
  ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE consumer_offramp_intents
  DROP CONSTRAINT IF EXISTS consumer_offramp_intents_state_check;

ALTER TABLE consumer_offramp_intents
  ADD CONSTRAINT consumer_offramp_intents_state_check
  CHECK (state IN (
    'quoted','creating','awaiting_funding','funded','pending_approval',
    'processing','completed','failed','rejected','refunded','expired','cancelled'
  ));

-- Existing abandoned quotes predate expiry support. They have no submitted
-- chain request recorded, so release their allowance during this migration.
INSERT INTO ramp_transaction_events(
  id,transaction_id,event_type,from_state,to_state,actor_type,details
)
SELECT gen_random_uuid(),r.id,'QUOTE_EXPIRED',r.state,'CANCELLED','SYSTEM',
       jsonb_build_object('reason','Off-ramp quote expired before funding')
FROM consumer_offramp_intents i
JOIN ramp_transactions r ON r.id=i.ramp_transaction_id
WHERE i.state='quoted'
  AND i.expires_at<=NOW()
  AND r.onchain_state='NOT_CREATED'
  AND r.provider_reference IS NULL
  AND r.state IN ('CREATED','POLICY_CHECK','PENDING_APPROVAL');

UPDATE ramp_transactions r
SET state='CANCELLED',failure_code='QUOTE_EXPIRED',
    failure_reason='The conversion quote expired before funding.',updated_at=NOW()
FROM consumer_offramp_intents i
WHERE i.ramp_transaction_id=r.id
  AND i.state='quoted'
  AND i.expires_at<=NOW()
  AND r.onchain_state='NOT_CREATED'
  AND r.provider_reference IS NULL
  AND r.state IN ('CREATED','POLICY_CHECK','PENDING_APPROVAL');

UPDATE consumer_offramp_intents i
SET state='expired',failure_code='QUOTE_EXPIRED',
    failure_message='The conversion quote expired before funding.',updated_at=NOW()
FROM ramp_transactions r
WHERE r.id=i.ramp_transaction_id
  AND i.state='quoted'
  AND i.expires_at<=NOW()
  AND r.state='CANCELLED'
  AND r.failure_code='QUOTE_EXPIRED';

CREATE INDEX IF NOT EXISTS consumer_offramp_quote_expiry_idx
  ON consumer_offramp_intents(expires_at)
  WHERE state='quoted';
