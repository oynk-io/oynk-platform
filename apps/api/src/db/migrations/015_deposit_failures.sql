ALTER TABLE consumer_deposit_intents
  DROP CONSTRAINT IF EXISTS consumer_deposit_intents_state_check;

ALTER TABLE consumer_deposit_intents
  ADD CONSTRAINT consumer_deposit_intents_state_check
  CHECK(state IN ('quoted','creating','pending','received','review','expired','failed')),
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS failure_message TEXT;

-- Old provider rejections could leave an intent in `creating` forever. Close
-- only expired records without bank instructions; pending transfers remain
-- available to reconciliation.
UPDATE consumer_deposit_intents
SET state='failed',
    failure_code='BANK_DETAILS_UNAVAILABLE',
    failure_message='Bank details could not be created. Start a new deposit.'
WHERE state='creating' AND bank IS NULL AND expires_at < NOW();
