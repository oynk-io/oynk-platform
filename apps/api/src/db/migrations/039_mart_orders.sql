CREATE TABLE mart_quotes (
 id UUID PRIMARY KEY,
 item_id UUID NOT NULL REFERENCES mart_items(id),
 organization_id UUID NOT NULL REFERENCES organizations(id),
 source_revision BIGINT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 1000),
 unit_price_minor BIGINT NOT NULL CHECK(unit_price_minor >= 0),
 total_minor BIGINT NOT NULL CHECK(total_minor >= 0),
 currency CHAR(3) NOT NULL,
 state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','USED','EXPIRED')),
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX mart_quotes_item_idx ON mart_quotes(item_id,created_at DESC);

CREATE TABLE mart_orders (
 id UUID PRIMARY KEY,
 quote_id UUID NOT NULL UNIQUE REFERENCES mart_quotes(id),
 organization_id UUID NOT NULL REFERENCES organizations(id),
 buyer_subject TEXT NOT NULL,
 buyer_network TEXT NOT NULL CHECK(buyer_network IN ('TESTNET','PUBLIC')),
 buyer_wallet TEXT NOT NULL,
 idempotency_key TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'AWAITING_MERCHANT' CHECK(state IN ('AWAITING_MERCHANT','CONFIRMED_AWAITING_PAYMENT','REJECTED','CANCELLED','EXPIRED')),
 merchant_note TEXT,
 confirmed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(buyer_subject,buyer_network,idempotency_key)
);
CREATE INDEX mart_orders_merchant_idx ON mart_orders(organization_id,state,created_at DESC);
CREATE INDEX mart_orders_buyer_idx ON mart_orders(buyer_subject,buyer_network,created_at DESC);

CREATE TABLE mart_order_events (
 id UUID PRIMARY KEY,
 order_id UUID NOT NULL REFERENCES mart_orders(id),
 action TEXT NOT NULL,
 actor_type TEXT NOT NULL CHECK(actor_type IN ('BUYER','MERCHANT','SYSTEM')),
 actor_reference TEXT NOT NULL,
 metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX mart_order_events_order_idx ON mart_order_events(order_id,created_at);
CREATE TRIGGER mart_order_events_append_only BEFORE UPDATE OR DELETE ON mart_order_events
 FOR EACH ROW EXECUTE FUNCTION mart_reject_event_mutation();
