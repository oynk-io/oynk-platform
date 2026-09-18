CREATE TABLE consumer_referral_codes (
  id UUID PRIMARY KEY,
  campaign_key TEXT NOT NULL,
  code TEXT NOT NULL CHECK (code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$'),
  code_hash TEXT NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  owner_account_id UUID NOT NULL REFERENCES consumer_accounts(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  max_qualified_uses INTEGER CHECK (max_qualified_uses IS NULL OR max_qualified_uses > 0),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code),
  UNIQUE (code_hash),
  UNIQUE (campaign_key, owner_account_id)
);

CREATE TABLE consumer_referral_attributions (
  id UUID PRIMARY KEY,
  campaign_key TEXT NOT NULL,
  code_id UUID NOT NULL REFERENCES consumer_referral_codes(id),
  inviter_account_id UUID NOT NULL REFERENCES consumer_accounts(id),
  invitee_subject TEXT NOT NULL,
  invitee_client_id TEXT NOT NULL,
  invitee_network TEXT NOT NULL CHECK (invitee_network IN ('TESTNET', 'PUBLIC')),
  invitee_wallet TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'BOUND' CHECK (status IN ('BOUND', 'QUALIFIED', 'REWARDED', 'REJECTED', 'EXPIRED')),
  qualification_event_hash TEXT CHECK (qualification_event_hash IS NULL OR qualification_event_hash ~ '^[0-9a-f]{64}$'),
  bound_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  qualified_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_key, invitee_client_id, invitee_network, invitee_wallet)
);

CREATE INDEX consumer_referral_codes_owner_idx
  ON consumer_referral_codes(owner_account_id, created_at DESC);

CREATE INDEX consumer_referral_attributions_inviter_idx
  ON consumer_referral_attributions(inviter_account_id, status, bound_at DESC);

CREATE INDEX consumer_referral_attributions_invitee_idx
  ON consumer_referral_attributions(invitee_client_id, invitee_network, invitee_wallet);

