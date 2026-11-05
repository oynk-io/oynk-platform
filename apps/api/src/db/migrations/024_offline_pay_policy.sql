-- Offline Pay policies use a user-selected rolling limit and a separate expiry.
-- The dedicated device signer remains independent from the account's primary
-- passkey/EVM signer because the online terminal transports offline approvals.
ALTER TABLE consumer_quick_pay_accounts
  DROP CONSTRAINT consumer_quick_pay_offline_limit_allowed,
  ADD COLUMN offline_expires_at TIMESTAMPTZ;

ALTER TABLE consumer_quick_pay_accounts
  ADD CONSTRAINT consumer_quick_pay_offline_limit_allowed
    CHECK (offline_limit_kobo = 0 OR
           offline_limit_kobo BETWEEN 10000 AND 2000000);

