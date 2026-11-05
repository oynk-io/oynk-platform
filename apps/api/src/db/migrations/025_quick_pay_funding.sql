-- Stable NGN deposit accounts are provisioned by a banking partner and mapped
-- to one Oynk consumer account. The API never invents account details.
CREATE TABLE consumer_quick_pay_deposit_accounts (
  account_id UUID PRIMARY KEY REFERENCES consumer_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL UNIQUE CHECK (account_number ~ '^\d{10}$'),
  account_name TEXT NOT NULL,
  provider_customer_reference TEXT,
  provider_account_reference TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PENDING','ACTIVE','SUSPENDED','CLOSED')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Every NGN balance change has an immutable, idempotent ledger entry. This is
-- the source for rolling-limit calculations and later reconciliation.
CREATE TABLE consumer_quick_pay_ledger_entries (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('CREDIT','DEBIT')),
  kind TEXT NOT NULL CHECK (kind IN ('BANK_DEPOSIT','SMART_CONVERSION','PAYMENT','WITHDRAWAL','ADJUSTMENT')),
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  reference TEXT NOT NULL UNIQUE,
  provider TEXT,
  provider_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  effective_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX consumer_quick_pay_ledger_account_time_idx
  ON consumer_quick_pay_ledger_entries(account_id, effective_at DESC);

