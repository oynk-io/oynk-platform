-- Fiat receipts are liabilities awaiting settlement, never wallet USDC credits.
CREATE TABLE consumer_accounts (
 id UUID PRIMARY KEY, subject TEXT NOT NULL, client_id TEXT NOT NULL,
 network TEXT NOT NULL CHECK(network IN ('TESTNET','PUBLIC')), wallet TEXT NOT NULL,
 profile JSONB NOT NULL, tier SMALLINT NOT NULL DEFAULT 1 CHECK(tier BETWEEN 1 AND 3),
 paystack_customer TEXT UNIQUE,
 consent_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(client_id,subject,network), UNIQUE(client_id,network,wallet)
);
CREATE UNIQUE INDEX consumer_email ON consumer_accounts (lower(profile->>'email'));
CREATE TABLE consumer_deposit_intents (
 reference TEXT PRIMARY KEY, account_id UUID NOT NULL REFERENCES consumer_accounts(id),
 amount_kobo BIGINT NOT NULL CHECK(amount_kobo > 0), bank JSONB, quote JSONB NOT NULL,
 state TEXT NOT NULL DEFAULT 'quoted' CHECK(state IN ('quoted','creating','pending','received','review','expired')),
 expires_at TIMESTAMPTZ NOT NULL, last_checked_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX consumer_intents_account ON consumer_deposit_intents(account_id, expires_at);
CREATE TABLE consumer_fiat_receipts (
 reference TEXT PRIMARY KEY, provider_id TEXT UNIQUE NOT NULL,
 account_id UUID REFERENCES consumer_accounts(id), amount_kobo BIGINT NOT NULL CHECK(amount_kobo > 0),
 fee_kobo BIGINT NOT NULL CHECK(fee_kobo >= 0), paid_at TIMESTAMPTZ NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('fiat_received','review')),
 reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX consumer_receipts_window ON consumer_fiat_receipts(account_id, paid_at);
