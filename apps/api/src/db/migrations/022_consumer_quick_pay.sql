-- Quick Pay caches the provider balance for fast reads and offline-policy
-- evaluation. VFD's dedicated 1-to-1 account remains the fiat source of truth.
-- This stays separate from USDC wallet and pool positions while sharing the
-- same consumer identity and audit boundary.
CREATE TABLE consumer_quick_pay_accounts (
  account_id UUID PRIMARY KEY REFERENCES consumer_accounts(id) ON DELETE CASCADE,
  balance_kobo BIGINT NOT NULL DEFAULT 0 CHECK (balance_kobo >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX consumer_quick_pay_updated_idx
  ON consumer_quick_pay_accounts(updated_at DESC);
