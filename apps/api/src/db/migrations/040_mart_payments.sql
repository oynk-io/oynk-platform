ALTER TABLE mart_orders DROP CONSTRAINT mart_orders_state_check;
ALTER TABLE mart_orders ADD CONSTRAINT mart_orders_state_check
 CHECK(state IN ('AWAITING_MERCHANT','CONFIRMED_AWAITING_PAYMENT','PAID','REJECTED','CANCELLED','EXPIRED'));

CREATE TABLE mart_payments (
 id UUID PRIMARY KEY,
 order_id UUID NOT NULL REFERENCES mart_orders(id),
 consumer_account_id UUID NOT NULL REFERENCES consumer_accounts(id),
 amount_kobo BIGINT NOT NULL CHECK(amount_kobo > 0),
 source_account_number TEXT NOT NULL CHECK(source_account_number ~ '^\d{10}$'),
 destination_account_number TEXT NOT NULL CHECK(destination_account_number ~ '^\d{10}$'),
 destination_account_name TEXT NOT NULL,
 provider_reference TEXT NOT NULL UNIQUE,
 provider_returned_reference TEXT,
 state TEXT NOT NULL CHECK(state IN ('AWAITING_APPROVAL','PROCESSING','RECONCILIATION_REQUIRED','COMPLETED','FAILED')),
 initial_token_jti TEXT NOT NULL,
 minimum_token_iat BIGINT NOT NULL,
 required_auth_method TEXT NOT NULL CHECK(required_auth_method IN ('passkey','device')),
 approval_expires_at TIMESTAMPTZ NOT NULL,
 approved_at TIMESTAMPTZ,
 completed_at TIMESTAMPTZ,
 failure_code TEXT,
 reconciliation_attempts INTEGER NOT NULL DEFAULT 0,
 next_reconciliation_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX mart_payments_one_active_per_order ON mart_payments(order_id)
 WHERE state IN ('AWAITING_APPROVAL','PROCESSING','RECONCILIATION_REQUIRED','COMPLETED');
CREATE INDEX mart_payments_reconciliation_idx ON mart_payments(next_reconciliation_at)
 WHERE state IN ('PROCESSING','RECONCILIATION_REQUIRED');

CREATE TABLE mart_payment_events (
 id UUID PRIMARY KEY,
 payment_id UUID NOT NULL REFERENCES mart_payments(id),
 action TEXT NOT NULL,
 actor_type TEXT NOT NULL CHECK(actor_type IN ('BUYER','SYSTEM','PROVIDER')),
 actor_reference TEXT NOT NULL,
 metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX mart_payment_events_payment_idx ON mart_payment_events(payment_id,created_at);
CREATE TRIGGER mart_payment_events_append_only BEFORE UPDATE OR DELETE ON mart_payment_events
 FOR EACH ROW EXECUTE FUNCTION mart_reject_event_mutation();
