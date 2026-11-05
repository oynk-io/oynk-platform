ALTER TABLE consumer_chain_intents ADD COLUMN candidate_hash TEXT CHECK(candidate_hash ~ '^[a-f0-9]{64}$'), ADD COLUMN checked_at TIMESTAMPTZ;
CREATE INDEX consumer_chain_reconciliation ON consumer_chain_intents(checked_at) WHERE state IN ('SUBMITTED','RECONCILIATION_REQUIRED') AND candidate_hash IS NOT NULL;
