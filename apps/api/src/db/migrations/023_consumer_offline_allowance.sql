-- Offline Pay is a bounded authorization against the current Oynk Pay balance.
-- The merchant terminal remains online and atomically checks/debits the ledger;
-- enabling a cap therefore never removes funds from ordinary online spending.
ALTER TABLE consumer_quick_pay_accounts
  ADD COLUMN offline_limit_kobo BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN offline_spent_kobo BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN offline_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN offline_updated_at TIMESTAMPTZ,
  ADD COLUMN offline_signer_address TEXT,
  ADD COLUMN offline_public_key_hex TEXT;

ALTER TABLE consumer_quick_pay_accounts
  ADD CONSTRAINT consumer_quick_pay_offline_limit_allowed
    CHECK (offline_limit_kobo IN (0, 1000000, 2000000)),
  ADD CONSTRAINT consumer_quick_pay_offline_spent_valid
    CHECK (offline_spent_kobo >= 0 AND offline_spent_kobo <= offline_limit_kobo),
  ADD CONSTRAINT consumer_quick_pay_offline_state_valid
    CHECK ((offline_enabled AND offline_limit_kobo > 0) OR
           (NOT offline_enabled AND offline_limit_kobo = 0 AND offline_spent_kobo = 0)),
  ADD CONSTRAINT consumer_quick_pay_offline_signer_address_valid
    CHECK (offline_signer_address IS NULL OR offline_signer_address ~ '^0x[0-9a-f]{40}$'),
  ADD CONSTRAINT consumer_quick_pay_offline_public_key_valid
    CHECK (offline_public_key_hex IS NULL OR offline_public_key_hex ~ '^04[0-9a-f]{128}$');
