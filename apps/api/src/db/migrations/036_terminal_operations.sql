-- Complete the terminal lifecycle with bounded reconciliation, merchant
-- receipts, device administration and idempotent refunds.

ALTER TABLE merchant_terminals
  ADD COLUMN credential_version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN secret_rotated_at TIMESTAMPTZ,
  ADD COLUMN suspended_at TIMESTAMPTZ,
  ADD COLUMN revoked_at TIMESTAMPTZ;

CREATE TABLE terminal_operational_events (
  terminal_id UUID NOT NULL REFERENCES merchant_terminals(id) ON DELETE CASCADE,
  sequence BIGSERIAL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('TERMINAL','OPERATOR','BUSINESS','SYSTEM')),
  actor_reference TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (terminal_id, sequence)
);

ALTER TABLE terminal_payments
  DROP CONSTRAINT terminal_payments_state_check,
  ADD CONSTRAINT terminal_payments_state_check CHECK (
    state IN ('CREATED','AWAITING_PIN','AUTHORIZING','PROCESSING',
      'RECONCILIATION_REQUIRED','COMPLETED','DECLINED','FAILED',
      'REVERSED','CANCELLED')
  ),
  ADD COLUMN reconciliation_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_reconciled_at TIMESTAMPTZ,
  ADD COLUMN next_reconciliation_at TIMESTAMPTZ,
  ADD COLUMN reconciliation_error TEXT;

CREATE INDEX terminal_payments_reconcile_idx
  ON terminal_payments(next_reconciliation_at, updated_at)
  WHERE state='PROCESSING' AND provider_reference IS NOT NULL;

CREATE TABLE terminal_refunds (
  id UUID PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES terminal_payments(id),
  business_organization_id UUID NOT NULL REFERENCES organizations(id),
  requested_by UUID NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL,
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  reason TEXT,
  state TEXT NOT NULL CHECK (state IN (
    'CREATED','PROCESSING','RECONCILIATION_REQUIRED','COMPLETED','FAILED'
  )),
  provider TEXT,
  provider_reference TEXT,
  failure_reason TEXT,
  reconciliation_attempts INTEGER NOT NULL DEFAULT 0,
  last_reconciled_at TIMESTAMPTZ,
  next_reconciliation_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payment_id, idempotency_key),
  UNIQUE (provider, provider_reference)
);

CREATE INDEX terminal_refunds_payment_idx
  ON terminal_refunds(payment_id, created_at DESC);
CREATE INDEX terminal_refunds_reconcile_idx
  ON terminal_refunds(next_reconciliation_at, updated_at)
  WHERE state='PROCESSING' AND provider_reference IS NOT NULL;

CREATE TABLE terminal_refund_events (
  refund_id UUID NOT NULL REFERENCES terminal_refunds(id) ON DELETE CASCADE,
  sequence BIGSERIAL,
  event_type TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('BUSINESS','SYSTEM','PROVIDER','OPERATOR')),
  actor_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (refund_id, sequence)
);

INSERT INTO permissions(name,description) VALUES
  ('payments:refund','Refund completed customer payments')
ON CONFLICT(name) DO NOTHING;

INSERT INTO role_permissions(role_name,permission_name) VALUES
  ('PLATFORM_OWNER','payments:refund'),
  ('BUSINESS_OWNER','payments:refund'),
  ('BUSINESS_ADMIN','payments:refund')
ON CONFLICT DO NOTHING;
