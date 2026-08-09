CREATE TABLE IF NOT EXISTS offchain_transactions (
  id TEXT PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('INFLOW', 'OUTFLOW')),
  amount_usd NUMERIC(38, 18) NOT NULL CHECK (amount_usd >= 0),
  transaction_id TEXT,
  reference_id TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (reference_id)
);

CREATE INDEX IF NOT EXISTS offchain_transactions_time_idx
  ON offchain_transactions(occurred_at DESC);
