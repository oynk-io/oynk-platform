-- Fiat tiers are granted by the banking partner. A linked SocketFi account is
-- Tier 0 until VFD confirms an individual account.
ALTER TABLE consumer_accounts DROP CONSTRAINT IF EXISTS consumer_accounts_tier_check;
ALTER TABLE consumer_accounts ALTER COLUMN tier SET DEFAULT 0;
ALTER TABLE consumer_accounts ADD CONSTRAINT consumer_accounts_tier_check CHECK (tier BETWEEN 0 AND 3);
ALTER TABLE consumer_accounts ADD COLUMN IF NOT EXISTS fiat_onboarding_skipped_at TIMESTAMPTZ;

-- Existing active VFD accounts are valid Tier 1 accounts. Profile-only rows do
-- not retain a fiat tier merely because the old schema defaulted them to one.
UPDATE consumer_accounts a
SET tier = CASE WHEN EXISTS (
  SELECT 1 FROM consumer_quick_pay_deposit_accounts d
  WHERE d.account_id=a.id AND d.provider='VFD' AND d.status='ACTIVE'
) THEN 1 ELSE 0 END;

ALTER TABLE consumer_quick_pay_deposit_accounts
  DROP CONSTRAINT IF EXISTS consumer_quick_pay_deposit_accounts_status_check;
ALTER TABLE consumer_quick_pay_deposit_accounts
  ADD CONSTRAINT consumer_quick_pay_deposit_accounts_status_check
  CHECK (status IN ('PROVISIONING','PENDING','PENDING_REVIEW','ACTIVE','SUSPENDED','CLOSED'));

CREATE TABLE consumer_fiat_verifications (
  account_id UUID PRIMARY KEY REFERENCES consumer_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'VFD',
  provider_tier SMALLINT NOT NULL DEFAULT 0 CHECK (provider_tier BETWEEN 0 AND 3),
  initial_identity_type TEXT CHECK (initial_identity_type IN ('NIN','BVN')),
  nin_fingerprint TEXT,
  bvn_fingerprint TEXT,
  date_of_birth_fingerprint TEXT,
  legal_name_fingerprint TEXT,
  verified_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE consumer_fiat_verification_events (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('TIER_1_SKIPPED','TIER_1_ACTIVATED','TIER_2_ACTIVATED','TIER_3_ACTIVATED','IDENTITY_REVIEW_REQUIRED')),
  provider TEXT NOT NULL DEFAULT 'VFD',
  provider_tier SMALLINT NOT NULL CHECK (provider_tier BETWEEN 0 AND 3),
  identity_type TEXT CHECK (identity_type IN ('NIN','BVN')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX consumer_fiat_verification_events_account_time ON consumer_fiat_verification_events(account_id,created_at DESC);

INSERT INTO consumer_fiat_verifications(account_id,provider_tier,initial_identity_type,nin_fingerprint,verified_at)
SELECT d.account_id,1,'NIN',NULLIF(d.metadata->>'identityFingerprint',''),d.updated_at
FROM consumer_quick_pay_deposit_accounts d
WHERE d.provider='VFD' AND d.status='ACTIVE'
ON CONFLICT(account_id) DO NOTHING;
