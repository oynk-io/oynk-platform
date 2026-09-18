-- Canonical operational ledger for every fiat/USDC ramp. Provider-specific
-- intents remain evidence; this ledger owns policy, approval and execution state.
CREATE TABLE ramp_policy_configs (
  id UUID PRIMARY KEY,
  direction TEXT NOT NULL UNIQUE CHECK (direction IN ('ON_RAMP','OFF_RAMP')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  manual_threshold_usdc_atomic NUMERIC(30,0) NOT NULL CHECK (manual_threshold_usdc_atomic >= 0),
  cumulative_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  cumulative_threshold_usdc_atomic NUMERIC(30,0) CHECK (cumulative_threshold_usdc_atomic > 0),
  cumulative_window_seconds INTEGER CHECK (cumulative_window_seconds > 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (NOT cumulative_enabled OR (cumulative_threshold_usdc_atomic IS NOT NULL AND cumulative_window_seconds IS NOT NULL))
);

-- USDC uses seven decimal places on Stellar: 500 USDC = 5,000,000,000 stroops.
INSERT INTO ramp_policy_configs(id,direction,manual_threshold_usdc_atomic)
VALUES
  ('d07b08de-5cd7-4bc6-81e2-b2233706e45d','ON_RAMP',5000000000),
  ('1565951f-e7af-43ee-a509-211f534542c1','OFF_RAMP',5000000000)
ON CONFLICT(direction) DO NOTHING;

CREATE TABLE ramp_policy_versions (
  id UUID PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES ramp_policy_configs(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('ON_RAMP','OFF_RAMP')),
  version INTEGER NOT NULL,
  configuration JSONB NOT NULL,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  change_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(policy_id,version)
);
INSERT INTO ramp_policy_versions(id,policy_id,direction,version,configuration,change_note)
SELECT gen_random_uuid(),id,direction,version,
 jsonb_build_object('enabled',enabled,'manualThresholdUsdcAtomic',manual_threshold_usdc_atomic::TEXT,
 'cumulativeEnabled',cumulative_enabled,'cumulativeThresholdUsdcAtomic',cumulative_threshold_usdc_atomic::TEXT,
 'cumulativeWindowSeconds',cumulative_window_seconds), 'Initial policy'
FROM ramp_policy_configs
ON CONFLICT(policy_id,version) DO NOTHING;

CREATE TABLE ramp_transactions (
  id UUID PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('ON_RAMP','OFF_RAMP')),
  state TEXT NOT NULL CHECK (state IN ('CREATED','POLICY_CHECK','PENDING_APPROVAL','APPROVED','PROCESSING','COMPLETED','FAILED','REJECTED','CANCELLED')),
  approval_state TEXT NOT NULL CHECK (approval_state IN ('NOT_REQUIRED','PENDING','APPROVED','REJECTED')),
  risk_state TEXT NOT NULL CHECK (risk_state IN ('CLEAR','REVIEW_REQUIRED','FLAGGED','BLOCKED')),
  consumer_account_id UUID REFERENCES consumer_accounts(id) ON DELETE RESTRICT,
  subject_reference TEXT,
  wallet_address TEXT NOT NULL,
  network TEXT NOT NULL CHECK(network IN ('TESTNET','PUBLIC')),
  fiat_currency TEXT,
  fiat_amount_minor BIGINT CHECK (fiat_amount_minor IS NULL OR fiat_amount_minor > 0),
  usdc_amount_atomic NUMERIC(30,0) CHECK (usdc_amount_atomic IS NULL OR usdc_amount_atomic > 0),
  fee_fiat_minor BIGINT CHECK (fee_fiat_minor IS NULL OR fee_fiat_minor >= 0),
  provider TEXT,
  provider_reference TEXT,
  provider_status TEXT,
  stellar_transaction_hash TEXT,
  destination_fingerprint TEXT,
  failure_code TEXT,
  failure_reason TEXT,
  policy_id UUID REFERENCES ramp_policy_configs(id),
  policy_version INTEGER,
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK ((state = 'COMPLETED') = (completed_at IS NOT NULL))
);
CREATE INDEX ramp_transactions_status_idx ON ramp_transactions(direction,state,created_at DESC);
CREATE INDEX ramp_transactions_account_idx ON ramp_transactions(consumer_account_id,created_at DESC);
CREATE INDEX ramp_transactions_provider_idx ON ramp_transactions(provider,provider_reference);
CREATE UNIQUE INDEX ramp_provider_reference_uidx ON ramp_transactions(provider,provider_reference)
  WHERE provider IS NOT NULL AND provider_reference IS NOT NULL;

CREATE TABLE ramp_policy_decisions (
  id UUID PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES ramp_transactions(id) ON DELETE RESTRICT,
  policy_id UUID REFERENCES ramp_policy_configs(id) ON DELETE SET NULL,
  policy_version INTEGER,
  outcome TEXT NOT NULL CHECK (outcome IN ('AUTO_APPROVED','MANUAL_APPROVAL','BLOCKED')),
  reason_codes TEXT[] NOT NULL DEFAULT '{}',
  evaluated_amount_usdc_atomic NUMERIC(30,0),
  cumulative_amount_usdc_atomic NUMERIC(30,0),
  facts JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ramp_policy_decisions_tx_idx ON ramp_policy_decisions(transaction_id,created_at);

CREATE TABLE ramp_approval_actions (
  id UUID PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES ramp_transactions(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('APPROVE','REJECT')),
  operator_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  operator_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(transaction_id)
);

CREATE TABLE ramp_execution_attempts (
  id UUID PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES ramp_transactions(id) ON DELETE RESTRICT,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  state TEXT NOT NULL CHECK (state IN ('QUEUED','PROCESSING','SUCCEEDED','FAILED')),
  provider_reference TEXT,
  stellar_transaction_hash TEXT,
  error_code TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(transaction_id,operation,attempt_number)
);

CREATE TABLE ramp_transaction_events (
  sequence BIGSERIAL PRIMARY KEY,
  id UUID NOT NULL UNIQUE,
  transaction_id UUID NOT NULL REFERENCES ramp_transactions(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('CONSUMER','OPERATOR','PROVIDER','SYSTEM')),
  actor_reference TEXT,
  request_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ramp_events_tx_idx ON ramp_transaction_events(transaction_id,sequence);
CREATE INDEX ramp_events_type_time_idx ON ramp_transaction_events(event_type,created_at DESC);

ALTER TABLE consumer_deposit_intents
  ADD COLUMN ramp_transaction_id UUID REFERENCES ramp_transactions(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX consumer_intents_ramp_uidx ON consumer_deposit_intents(ramp_transaction_id)
  WHERE ramp_transaction_id IS NOT NULL;

INSERT INTO permissions(name,description) VALUES
  ('ramp_transactions:read','Read ramp transactions and audit history'),
  ('ramp_transactions:approve','Approve or reject ramp transactions'),
  ('ramp_transactions:retry','Retry failed ramp transaction execution'),
  ('ramp_policies:manage','Configure ramp transaction policies')
ON CONFLICT(name) DO NOTHING;

INSERT INTO role_permissions(role_name,permission_name)
SELECT 'PLATFORM_OWNER',name FROM permissions WHERE name LIKE 'ramp_%'
ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_name,permission_name) VALUES
  ('PAYMENT_OPERATIONS','ramp_transactions:read'),
  ('PAYMENT_OPERATIONS','ramp_transactions:approve'),
  ('PAYMENT_OPERATIONS','ramp_transactions:retry'),
  ('RISK_ANALYST','ramp_transactions:read'),
  ('RISK_ANALYST','ramp_transactions:approve'),
  ('INTERNAL_AUDITOR','ramp_transactions:read'),
  ('SUPPORT_AGENT','ramp_transactions:read')
ON CONFLICT DO NOTHING;
