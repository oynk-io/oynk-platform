CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY,
  chain TEXT NOT NULL CHECK (chain IN ('ALL', 'BSC', 'SOLANA')),
  mode TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  transfers_inserted INTEGER NOT NULL DEFAULT 0,
  transfers_updated INTEGER NOT NULL DEFAULT 0,
  cursors_advanced INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS sync_runs_started_idx ON sync_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS indexer_failures (
  id BIGSERIAL PRIMARY KEY,
  chain TEXT NOT NULL CHECK (chain IN ('BSC', 'SOLANA')),
  source TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  error TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE(chain, source, transaction_id)
);

CREATE INDEX IF NOT EXISTS indexer_failures_retry_idx
  ON indexer_failures(next_retry_at) WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS tracked_solana_sources (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  source_address TEXT NOT NULL,
  mint_address TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('OWNER', 'ASSOCIATED_TOKEN_ACCOUNT', 'TOKEN_ACCOUNT', 'MANUAL')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(wallet_address, source_address, mint_address)
);

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS settlement_reference TEXT;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS corridor_reference TEXT;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS origin_leg_id TEXT;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS destination_leg_id TEXT;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS pairing_method TEXT
  CHECK (pairing_method IN ('REFERENCE', 'HEURISTIC'));
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS pairing_confidence NUMERIC(5,4);
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS paired_at TIMESTAMPTZ;

UPDATE transfers
SET pairing_method = 'HEURISTIC',
    pairing_confidence = 0.5000,
    paired_at = COALESCE(paired_at, NOW())
WHERE pair_id IS NOT NULL
  AND pairing_method IS NULL;
