-- Durable state around VFD /client/update calls. This prevents two taps from
-- submitting the same upgrade twice and lets Oynk finish a provider-confirmed
-- upgrade if local persistence is interrupted.
CREATE TABLE consumer_fiat_tier_upgrades (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'VFD',
  target_tier SMALLINT NOT NULL CHECK (target_tier IN (2,3)),
  identity_type TEXT CHECK (identity_type IN ('NIN','BVN')),
  request_fingerprint TEXT NOT NULL,
  request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('PROCESSING','UNKNOWN','FAILED','PROVIDER_CONFIRMED','COMPLETED')),
  provider_tier SMALLINT CHECK (provider_tier IN (2,3)),
  provider_error_code TEXT,
  provider_confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id,target_tier)
);

CREATE INDEX consumer_fiat_tier_upgrades_status_time
  ON consumer_fiat_tier_upgrades(status,updated_at DESC);
