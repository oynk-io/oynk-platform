-- Dedicated business banking and owner-controlled Stellar settlement accounts.
ALTER TABLE business_financial_accounts
  DROP CONSTRAINT IF EXISTS business_financial_accounts_smart_account_address_check;

ALTER TABLE business_financial_accounts
  ADD COLUMN fiat_account_model TEXT NOT NULL DEFAULT 'ONE_TO_ONE'
    CHECK (fiat_account_model = 'ONE_TO_ONE'),
  ADD COLUMN vfd_identity_fingerprint TEXT,
  ADD COLUMN vfd_identity_verified_at TIMESTAMPTZ,
  ADD COLUMN crypto_account_kind TEXT
    CHECK (crypto_account_kind IN ('STELLAR_ACCOUNT','SOCKETFI_SMART_ACCOUNT')),
  ADD COLUMN crypto_account_verified_at TIMESTAMPTZ,
  ADD COLUMN crypto_usdc_ready BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN external_settlement_account_number TEXT,
  ADD COLUMN external_settlement_account_name TEXT,
  ADD COLUMN external_settlement_bank_code TEXT,
  ADD COLUMN external_settlement_verified_at TIMESTAMPTZ,
  ADD CONSTRAINT business_financial_accounts_crypto_address_check CHECK (
    smart_account_address IS NULL OR smart_account_address ~ '^[CG][A-Z2-7]{55}$'
  ),
  ADD CONSTRAINT business_financial_accounts_external_number_check CHECK (
    external_settlement_account_number IS NULL OR external_settlement_account_number ~ '^\d{10}$'
  );

CREATE TABLE business_wallet_challenges (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network TEXT NOT NULL CHECK (network IN ('TESTNET','PUBLIC')),
  address TEXT NOT NULL CHECK (address ~ '^G[A-Z2-7]{55}$'),
  purpose TEXT NOT NULL CHECK (purpose IN ('VERIFY_OWNERSHIP','ENABLE_USDC')),
  unsigned_xdr TEXT NOT NULL,
  transaction_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX business_wallet_challenges_active_idx
  ON business_wallet_challenges(organization_id,address,expires_at DESC)
  WHERE consumed_at IS NULL;

