ALTER TABLE ramp_transactions
  ADD COLUMN IF NOT EXISTS orchestrator_request_id TEXT,
  ADD COLUMN IF NOT EXISTS onchain_state TEXT,
  ADD COLUMN IF NOT EXISTS destination JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS ramp_transactions_orchestrator_request_unique
  ON ramp_transactions(network, orchestrator_request_id)
  WHERE orchestrator_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS consumer_offramp_intents (
  reference TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES consumer_accounts(id),
  ramp_transaction_id UUID NOT NULL UNIQUE REFERENCES ramp_transactions(id),
  quote JSONB NOT NULL,
  destination JSONB NOT NULL,
  state TEXT NOT NULL DEFAULT 'quoted' CHECK (state IN ('quoted','creating','awaiting_funding','funded','pending_approval','processing','completed','failed','rejected','refunded')),
  create_tx_hash TEXT,
  funding_tx_hash TEXT,
  provider_reference TEXT,
  failure_code TEXT,
  failure_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS consumer_offramp_account_created_idx
  ON consumer_offramp_intents(account_id, created_at DESC);

ALTER TABLE consumer_deposit_intents DROP CONSTRAINT IF EXISTS consumer_deposit_intents_state_check;
ALTER TABLE consumer_deposit_intents ADD CONSTRAINT consumer_deposit_intents_state_check
  CHECK(state IN ('quoted','creating','pending','settling','received','review','expired','failed'));
