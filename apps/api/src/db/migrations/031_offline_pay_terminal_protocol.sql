-- Offline Pay is centrally authorized while the approved merchant terminal is
-- online. The customer's device may be offline or unavailable.
ALTER TABLE consumer_quick_pay_accounts
  ADD COLUMN offline_pin_hash TEXT,
  ADD COLUMN offline_policy_version BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN offline_pin_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN offline_pin_locked_until TIMESTAMPTZ;

ALTER TABLE consumer_quick_pay_accounts
  ADD CONSTRAINT consumer_quick_pay_offline_pin_state CHECK (
    (offline_enabled AND offline_pin_hash IS NOT NULL) OR NOT offline_enabled
  ) NOT VALID,
  ADD CONSTRAINT consumer_quick_pay_offline_pin_failures CHECK (
    offline_pin_failures BETWEEN 0 AND 5
  );

CREATE TABLE consumer_primary_auth_challenges (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('OFFLINE_PAY_CONFIGURE')),
  payload_hash TEXT NOT NULL,
  initial_token_jti TEXT NOT NULL,
  required_auth_method TEXT NOT NULL CHECK (required_auth_method IN ('passkey','device')),
  minimum_token_iat BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX consumer_primary_auth_active_idx
  ON consumer_primary_auth_challenges(account_id, expires_at DESC)
  WHERE consumed_at IS NULL;

CREATE TABLE merchant_terminals (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  terminal_type TEXT NOT NULL CHECK (terminal_type IN ('HARDWARE','SOFTWARE')),
  status TEXT NOT NULL CHECK (status IN ('PENDING_ACTIVATION','ACTIVE','SUSPENDED','REVOKED')),
  secret_hash TEXT,
  activated_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX merchant_terminals_org_idx ON merchant_terminals(organization_id,status);

CREATE TABLE terminal_activation_codes (
  id UUID PRIMARY KEY,
  terminal_id UUID NOT NULL REFERENCES merchant_terminals(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE terminal_payments (
  id UUID PRIMARY KEY,
  terminal_id UUID NOT NULL REFERENCES merchant_terminals(id),
  business_organization_id UUID NOT NULL REFERENCES organizations(id),
  consumer_account_id UUID NOT NULL REFERENCES consumer_accounts(id),
  idempotency_key TEXT NOT NULL,
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  currency TEXT NOT NULL DEFAULT 'NGN' CHECK (currency='NGN'),
  state TEXT NOT NULL CHECK (state IN ('CREATED','AWAITING_PIN','AUTHORIZING','PROCESSING','COMPLETED','DECLINED','FAILED','REVERSED','CANCELLED')),
  policy_version BIGINT,
  provider TEXT,
  provider_reference TEXT,
  decline_code TEXT,
  failure_reason TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(terminal_id,idempotency_key),
  UNIQUE(provider,provider_reference)
);
CREATE INDEX terminal_payments_consumer_window_idx
  ON terminal_payments(consumer_account_id,completed_at DESC)
  WHERE state='COMPLETED';
CREATE INDEX terminal_payments_business_time_idx
  ON terminal_payments(business_organization_id,created_at DESC);

CREATE TABLE terminal_payment_events (
  payment_id UUID NOT NULL REFERENCES terminal_payments(id) ON DELETE CASCADE,
  sequence BIGSERIAL,
  event_type TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('TERMINAL','CONSUMER','SYSTEM','PROVIDER','OPERATOR')),
  actor_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(payment_id,sequence)
);

CREATE TABLE business_financial_accounts (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  provisioning_state TEXT NOT NULL CHECK (provisioning_state IN ('PENDING','PROVISIONING','AWAITING_OWNER_SMART_ACCOUNT','RECONCILIATION_REQUIRED','READY','SUSPENDED')),
  vfd_account_number TEXT,
  vfd_account_name TEXT,
  vfd_customer_reference TEXT,
  smart_account_network TEXT CHECK (smart_account_network IN ('TESTNET','PUBLIC')),
  smart_account_address TEXT,
  smart_account_owner_user_id UUID REFERENCES users(id),
  provision_idempotency_key TEXT NOT NULL UNIQUE,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (vfd_account_number IS NULL OR vfd_account_number ~ '^\d{10}$'),
  CHECK (smart_account_address IS NULL OR smart_account_address ~ '^C[A-Z2-7]{55}$')
);

CREATE TABLE terminal_requests (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hardware_requested BOOLEAN NOT NULL,
  software_requested BOOLEAN NOT NULL,
  hardware_quantity INTEGER NOT NULL DEFAULT 0 CHECK (hardware_quantity BETWEEN 0 AND 1000),
  software_device_count INTEGER NOT NULL DEFAULT 0 CHECK (software_device_count BETWEEN 0 AND 1000),
  location_name TEXT NOT NULL,
  address TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','PARTIALLY_FULFILLED','FULFILLED','REJECTED','CANCELLED')),
  submitted_by UUID NOT NULL REFERENCES users(id),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (hardware_requested OR software_requested),
  CHECK ((hardware_requested AND hardware_quantity > 0) OR (NOT hardware_requested AND hardware_quantity = 0)),
  CHECK ((software_requested AND software_device_count > 0) OR (NOT software_requested AND software_device_count = 0))
);
CREATE INDEX terminal_requests_status_idx ON terminal_requests(status,created_at DESC);
