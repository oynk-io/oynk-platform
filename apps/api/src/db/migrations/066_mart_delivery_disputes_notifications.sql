-- Delivery is part of the order contract. The merchant defines the options
-- before a buyer checks out; every order then keeps its own immutable snapshot.
ALTER TABLE mart_storefronts
 ADD COLUMN pickup_enabled BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN dispatch_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN pickup_address TEXT NOT NULL DEFAULT '',
 ADD COLUMN dispatch_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK(dispatch_fee_minor >= 0),
 ADD COLUMN dispatch_min_days INTEGER NOT NULL DEFAULT 1 CHECK(dispatch_min_days BETWEEN 0 AND 30),
 ADD COLUMN dispatch_max_days INTEGER NOT NULL DEFAULT 3 CHECK(dispatch_max_days BETWEEN 0 AND 60),
 ADD CONSTRAINT mart_storefront_dispatch_days_check CHECK(dispatch_max_days >= dispatch_min_days);

CREATE TABLE mart_fulfillments (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL REFERENCES organizations(id),
 buyer_subject TEXT NOT NULL,
 buyer_network TEXT NOT NULL CHECK(buyer_network IN ('TESTNET','PUBLIC')),
 buyer_wallet TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('PICKUP','DISPATCH')),
 recipient_name TEXT NOT NULL CHECK(length(recipient_name) BETWEEN 2 AND 120),
 recipient_phone TEXT NOT NULL CHECK(recipient_phone ~ '^\+[1-9][0-9]{7,14}$'),
 delivery_address TEXT,
 delivery_instructions TEXT,
 delivery_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK(delivery_fee_minor >= 0),
 estimated_ready_at TIMESTAMPTZ,
 estimated_delivery_at TIMESTAMPTZ,
 handoff_pin_ciphertext TEXT NOT NULL,
 handoff_pin_hash TEXT NOT NULL,
 handoff_pin_failures INTEGER NOT NULL DEFAULT 0 CHECK(handoff_pin_failures >= 0),
 handoff_pin_locked_until TIMESTAMPTZ,
 handoff_verified_at TIMESTAMPTZ,
 buyer_confirmed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(method='PICKUP' OR (delivery_address IS NOT NULL AND length(delivery_address) BETWEEN 5 AND 500))
);

ALTER TABLE mart_orders ADD COLUMN fulfillment_id UUID REFERENCES mart_fulfillments(id);
CREATE INDEX mart_fulfillments_buyer_idx ON mart_fulfillments(buyer_subject,buyer_network,created_at DESC);
CREATE INDEX mart_orders_fulfillment_group_idx ON mart_orders(fulfillment_id);

ALTER TABLE mart_layaway_plans ADD COLUMN delivery_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK(delivery_fee_minor >= 0);
ALTER TABLE mart_layaway_plans DROP CONSTRAINT IF EXISTS mart_layaway_plans_check;
ALTER TABLE mart_layaway_plans DROP CONSTRAINT IF EXISTS mart_layaway_plans_total_minor_check;
ALTER TABLE mart_layaway_plans ADD CONSTRAINT mart_layaway_total_check
 CHECK(total_minor = merchandise_total_minor + service_fee_minor + delivery_fee_minor);

ALTER TABLE mart_orders DROP CONSTRAINT IF EXISTS mart_orders_fulfillment_state_check;
ALTER TABLE mart_orders ADD CONSTRAINT mart_orders_fulfillment_state_check
 CHECK(fulfillment_state IN ('NOT_STARTED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','DISPUTED','CLOSED'));

ALTER TABLE mart_order_events DROP CONSTRAINT IF EXISTS mart_order_events_actor_type_check;
ALTER TABLE mart_order_events ADD CONSTRAINT mart_order_events_actor_type_check
 CHECK(actor_type IN ('BUYER','MERCHANT','RIDER','OPERATOR','SYSTEM'));

CREATE TABLE mart_order_disputes (
 id UUID PRIMARY KEY,
 order_id UUID NOT NULL REFERENCES mart_orders(id),
 buyer_subject TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('NOT_RECEIVED','DAMAGED','WRONG_ITEM','MISSING_ITEM','OTHER')),
 details TEXT NOT NULL CHECK(length(details) BETWEEN 1 AND 1000),
 state TEXT NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','UNDER_REVIEW','RESOLVED_BUYER','RESOLVED_MERCHANT','CANCELLED')),
 resolution_note TEXT,
 resolved_by TEXT,
 resolved_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX mart_order_disputes_one_open
 ON mart_order_disputes(order_id) WHERE state IN ('OPEN','UNDER_REVIEW');
CREATE INDEX mart_order_disputes_review_idx ON mart_order_disputes(state,created_at);

CREATE TABLE mart_refunds (
 id UUID PRIMARY KEY,
 order_id UUID NOT NULL REFERENCES mart_orders(id),
 dispute_id UUID REFERENCES mart_order_disputes(id),
 consumer_account_id UUID NOT NULL REFERENCES consumer_accounts(id),
 reason TEXT NOT NULL CHECK(reason IN ('LAYAWAY_EXPIRED','MERCHANT_CANCELLED','DISPUTE_RESOLVED','ORDER_CANCELLED')),
 amount_kobo BIGINT NOT NULL CHECK(amount_kobo > 0),
 source_account_number TEXT NOT NULL CHECK(source_account_number ~ '^\d{10}$'),
 destination_account_number TEXT NOT NULL CHECK(destination_account_number ~ '^\d{10}$'),
 provider_reference TEXT NOT NULL UNIQUE,
 provider_returned_reference TEXT,
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','PROCESSING','RECONCILIATION_REQUIRED','COMPLETED','FAILED')),
 failure_code TEXT,
 reconciliation_attempts INTEGER NOT NULL DEFAULT 0,
 next_reconciliation_at TIMESTAMPTZ DEFAULT NOW(),
 completed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(order_id,reason)
);
CREATE INDEX mart_refunds_due_idx ON mart_refunds(next_reconciliation_at)
 WHERE state IN ('PENDING','PROCESSING','RECONCILIATION_REQUIRED');

CREATE TABLE mart_refund_events (
 id UUID PRIMARY KEY,
 refund_id UUID NOT NULL REFERENCES mart_refunds(id),
 action TEXT NOT NULL,
 from_state TEXT,
 to_state TEXT NOT NULL,
 actor_type TEXT NOT NULL CHECK(actor_type IN ('BUYER','MERCHANT','OPERATOR','SYSTEM','PROVIDER')),
 actor_reference TEXT NOT NULL,
 metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX mart_refund_events_refund_idx ON mart_refund_events(refund_id,created_at);
CREATE TRIGGER mart_refund_events_append_only BEFORE UPDATE OR DELETE ON mart_refund_events
 FOR EACH ROW EXECUTE FUNCTION mart_reject_event_mutation();

CREATE TABLE mart_notifications (
 id UUID PRIMARY KEY,
 consumer_account_id UUID REFERENCES consumer_accounts(id) ON DELETE CASCADE,
 organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
 type TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 320),
 data JSONB NOT NULL DEFAULT '{}'::JSONB,
 deduplication_key TEXT NOT NULL UNIQUE,
 read_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK((consumer_account_id IS NOT NULL)::int + (organization_id IS NOT NULL)::int = 1)
);
CREATE INDEX mart_notifications_consumer_idx ON mart_notifications(consumer_account_id,created_at DESC);
CREATE INDEX mart_notifications_business_idx ON mart_notifications(organization_id,created_at DESC);

CREATE TABLE consumer_push_devices (
 id UUID PRIMARY KEY,
 consumer_account_id UUID NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
 device_id TEXT NOT NULL CHECK(length(device_id) BETWEEN 8 AND 160),
 platform TEXT NOT NULL CHECK(platform IN ('IOS','ANDROID')),
 push_token TEXT NOT NULL UNIQUE CHECK(length(push_token) BETWEEN 16 AND 512),
 active BOOLEAN NOT NULL DEFAULT TRUE,
 last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(consumer_account_id,device_id)
);

CREATE TABLE mart_notification_deliveries (
 id UUID PRIMARY KEY,
 notification_id UUID NOT NULL REFERENCES mart_notifications(id) ON DELETE CASCADE,
 push_device_id UUID NOT NULL REFERENCES consumer_push_devices(id) ON DELETE CASCADE,
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','SENT','FAILED')),
 attempt_count INTEGER NOT NULL DEFAULT 0,
 provider_reference TEXT,
 failure_reason TEXT,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 sent_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(notification_id,push_device_id)
);
CREATE INDEX mart_notification_deliveries_due_idx ON mart_notification_deliveries(next_attempt_at)
 WHERE state='PENDING';

-- Oynk Go is an operational role attached to an existing Oynk consumer account.
-- It does not create a second wallet or financial identity.
CREATE TABLE oynk_go_profiles (
 consumer_account_id UUID PRIMARY KEY REFERENCES consumer_accounts(id) ON DELETE CASCADE,
 shopper_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 rider_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','SUSPENDED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(shopper_enabled OR rider_enabled)
);

CREATE TABLE oynk_go_delivery_tasks (
 id UUID PRIMARY KEY,
 fulfillment_id UUID NOT NULL UNIQUE REFERENCES mart_fulfillments(id),
 assigned_account_id UUID REFERENCES consumer_accounts(id),
 state TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK(state IN ('AVAILABLE','ASSIGNED','PICKED_UP','DELIVERED','CANCELLED')),
 pickup_note TEXT,
 assigned_at TIMESTAMPTZ,
 picked_up_at TIMESTAMPTZ,
 delivered_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX oynk_go_tasks_available_idx ON oynk_go_delivery_tasks(state,created_at)
 WHERE state='AVAILABLE';
