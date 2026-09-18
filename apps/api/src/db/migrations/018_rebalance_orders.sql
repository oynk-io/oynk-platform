CREATE TABLE vault_rebalance_orders (
  id UUID PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  network TEXT NOT NULL CHECK(network IN ('TESTNET','PUBLIC')),
  request_id TEXT UNIQUE,
  direction TEXT CHECK(direction IN ('ADD_LIQUIDITY','REDUCE_LIQUIDITY')),
  amount_atomic NUMERIC(30,0),
  minimum_fill_atomic NUMERIC(30,0),
  state TEXT NOT NULL CHECK(state IN ('SUBMITTING','OPEN','FAILED')),
  stellar_transaction_hash TEXT,
  failure_reason TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX vault_rebalance_orders_created_idx ON vault_rebalance_orders(created_at DESC);
