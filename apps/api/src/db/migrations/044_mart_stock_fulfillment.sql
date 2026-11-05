CREATE TABLE mart_stock_fulfillments (
 order_id UUID PRIMARY KEY REFERENCES mart_orders(id),
 organization_id UUID NOT NULL REFERENCES organizations(id),
 connection_id UUID NOT NULL REFERENCES mart_connections(id),
 source_item_id TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0),
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','PROCESSING','COMPLETED','NEEDS_REVIEW')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 last_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX mart_stock_fulfillment_due_idx ON mart_stock_fulfillments(next_attempt_at) WHERE state IN ('PENDING','PROCESSING');
