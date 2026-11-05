CREATE TABLE mart_cart_items (
 id UUID PRIMARY KEY,
 buyer_subject TEXT NOT NULL,
 buyer_network TEXT NOT NULL CHECK(buyer_network IN ('TESTNET','PUBLIC')),
 buyer_wallet TEXT NOT NULL,
 item_id UUID NOT NULL REFERENCES mart_items(id),
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(buyer_subject,buyer_network,buyer_wallet,item_id)
);
CREATE INDEX mart_cart_items_buyer_idx ON mart_cart_items(buyer_subject,buyer_network,buyer_wallet,updated_at DESC);

CREATE TABLE mart_checkouts (
 id UUID PRIMARY KEY,
 buyer_subject TEXT NOT NULL,
 buyer_network TEXT NOT NULL CHECK(buyer_network IN ('TESTNET','PUBLIC')),
 buyer_wallet TEXT NOT NULL,
 consumer_account_id UUID NOT NULL REFERENCES consumer_accounts(id),
 idempotency_key TEXT NOT NULL,
 currency CHAR(3) NOT NULL DEFAULT 'NGN',
 total_minor BIGINT NOT NULL CHECK(total_minor>0),
 source_account_number TEXT NOT NULL CHECK(source_account_number ~ '^\d{10}$'),
 holding_account_number TEXT NOT NULL CHECK(holding_account_number ~ '^\d{10}$'),
 holding_account_name TEXT NOT NULL,
 provider_reference TEXT NOT NULL UNIQUE,
 provider_returned_reference TEXT,
 state TEXT NOT NULL CHECK(state IN ('AWAITING_APPROVAL','PROCESSING','RECONCILIATION_REQUIRED','COMPLETED','FAILED','EXPIRED')),
 approval_expires_at TIMESTAMPTZ NOT NULL,
 approval_token_jti TEXT,
 approved_at TIMESTAMPTZ,
 completed_at TIMESTAMPTZ,
 failure_code TEXT,
 reconciliation_attempts INTEGER NOT NULL DEFAULT 0,
 next_reconciliation_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(buyer_subject,buyer_network,idempotency_key)
);
CREATE UNIQUE INDEX mart_checkouts_one_active_buyer ON mart_checkouts(buyer_subject,buyer_network,buyer_wallet)
 WHERE state IN ('AWAITING_APPROVAL','PROCESSING','RECONCILIATION_REQUIRED');
CREATE INDEX mart_checkouts_reconciliation_idx ON mart_checkouts(next_reconciliation_at)
 WHERE state IN ('PROCESSING','RECONCILIATION_REQUIRED');

CREATE TABLE mart_checkout_orders (
 checkout_id UUID NOT NULL REFERENCES mart_checkouts(id),
 order_id UUID NOT NULL UNIQUE REFERENCES mart_orders(id),
 amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
 PRIMARY KEY(checkout_id,order_id)
);

CREATE TABLE mart_checkout_settlements (
 id UUID PRIMARY KEY,
 checkout_id UUID NOT NULL REFERENCES mart_checkouts(id),
 organization_id UUID NOT NULL REFERENCES organizations(id),
 amount_kobo BIGINT NOT NULL CHECK(amount_kobo>0),
 source_account_number TEXT NOT NULL CHECK(source_account_number ~ '^\d{10}$'),
 destination_account_number TEXT NOT NULL CHECK(destination_account_number ~ '^\d{10}$'),
 destination_account_name TEXT NOT NULL,
 provider_reference TEXT NOT NULL UNIQUE,
 provider_returned_reference TEXT,
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','PROCESSING','RECONCILIATION_REQUIRED','COMPLETED','FAILED')),
 reconciliation_attempts INTEGER NOT NULL DEFAULT 0,
 next_reconciliation_at TIMESTAMPTZ DEFAULT NOW(),
 failure_code TEXT,
 completed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(checkout_id,organization_id)
);
CREATE INDEX mart_checkout_settlements_due_idx ON mart_checkout_settlements(next_reconciliation_at)
 WHERE state IN ('PENDING','PROCESSING','RECONCILIATION_REQUIRED');

CREATE TABLE mart_checkout_events (
 id UUID PRIMARY KEY,
 checkout_id UUID NOT NULL REFERENCES mart_checkouts(id),
 action TEXT NOT NULL,
 actor_type TEXT NOT NULL CHECK(actor_type IN ('BUYER','SYSTEM','PROVIDER')),
 actor_reference TEXT NOT NULL,
 metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX mart_checkout_events_idx ON mart_checkout_events(checkout_id,created_at);
CREATE TRIGGER mart_checkout_events_append_only BEFORE UPDATE OR DELETE ON mart_checkout_events
 FOR EACH ROW EXECUTE FUNCTION mart_reject_event_mutation();

CREATE TABLE mart_checkout_journal_entries (
 id UUID PRIMARY KEY,
 checkout_id UUID NOT NULL REFERENCES mart_checkouts(id),
 settlement_id UUID REFERENCES mart_checkout_settlements(id),
 account_code TEXT NOT NULL CHECK(account_code IN ('HOLDING_CASH','MERCHANT_PAYABLE')),
 direction TEXT NOT NULL CHECK(direction IN ('DEBIT','CREDIT')),
 amount_kobo BIGINT NOT NULL CHECK(amount_kobo>0),
 reference TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(reference,account_code,direction)
);
