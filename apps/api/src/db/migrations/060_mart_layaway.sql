ALTER TABLE mart_quotes
 ADD COLUMN purchase_mode TEXT NOT NULL DEFAULT 'PAY_NOW'
  CHECK(purchase_mode IN ('PAY_NOW','LAYAWAY')),
 ADD COLUMN duration_months INTEGER
  CHECK(duration_months IS NULL OR duration_months BETWEEN 1 AND 3),
 ADD COLUMN merchandise_total_minor BIGINT NOT NULL DEFAULT 0 CHECK(merchandise_total_minor >= 0),
 ADD COLUMN service_fee_minor BIGINT NOT NULL DEFAULT 0 CHECK(service_fee_minor >= 0);

UPDATE mart_quotes SET merchandise_total_minor=total_minor WHERE merchandise_total_minor=0;

ALTER TABLE mart_orders DROP CONSTRAINT mart_orders_state_check;
ALTER TABLE mart_orders ADD CONSTRAINT mart_orders_state_check
 CHECK(state IN ('AWAITING_MERCHANT','CONFIRMED_AWAITING_PAYMENT','LAYAWAY_ACTIVE','LAYAWAY_SETTLEMENT_PENDING','PAID','REJECTED','CANCELLED','EXPIRED'));

CREATE TABLE mart_layaway_plans (
 id UUID PRIMARY KEY,
 order_id UUID NOT NULL UNIQUE REFERENCES mart_orders(id),
 duration_months INTEGER NOT NULL CHECK(duration_months BETWEEN 1 AND 3),
 merchandise_total_minor BIGINT NOT NULL CHECK(merchandise_total_minor > 0),
 service_fee_minor BIGINT NOT NULL CHECK(service_fee_minor >= 0),
 total_minor BIGINT NOT NULL CHECK(total_minor = merchandise_total_minor + service_fee_minor),
 funding_source TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK(funding_source IN ('CUSTOMER','OYNK_CREDIT')),
 state TEXT NOT NULL DEFAULT 'PENDING_MERCHANT'
  CHECK(state IN ('PENDING_MERCHANT','ACTIVE','FUNDED','SETTLING','COMPLETED','CANCELLED')),
 starts_at TIMESTAMPTZ,
 completed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mart_layaway_installments (
 id UUID PRIMARY KEY,
 plan_id UUID NOT NULL REFERENCES mart_layaway_plans(id),
 sequence INTEGER NOT NULL CHECK(sequence BETWEEN 1 AND 3),
 amount_kobo BIGINT NOT NULL CHECK(amount_kobo > 0),
 due_at TIMESTAMPTZ NOT NULL,
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','PAID')),
 paid_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(plan_id,sequence)
);
CREATE INDEX mart_layaway_installments_due_idx ON mart_layaway_installments(state,due_at);

ALTER TABLE mart_payments
 ADD COLUMN layaway_installment_id UUID REFERENCES mart_layaway_installments(id);

DROP INDEX mart_payments_one_active_per_order;
CREATE UNIQUE INDEX mart_payments_one_inflight_per_order ON mart_payments(order_id)
 WHERE state IN ('AWAITING_APPROVAL','PROCESSING','RECONCILIATION_REQUIRED');
CREATE UNIQUE INDEX mart_payments_one_completed_full_per_order ON mart_payments(order_id)
 WHERE layaway_installment_id IS NULL AND state='COMPLETED';
CREATE UNIQUE INDEX mart_payments_one_completed_per_installment ON mart_payments(layaway_installment_id)
 WHERE layaway_installment_id IS NOT NULL AND state='COMPLETED';

CREATE TABLE mart_layaway_settlements (
 id UUID PRIMARY KEY,
 plan_id UUID NOT NULL UNIQUE REFERENCES mart_layaway_plans(id),
 order_id UUID NOT NULL UNIQUE REFERENCES mart_orders(id),
 amount_kobo BIGINT NOT NULL CHECK(amount_kobo > 0),
 source_account_number TEXT NOT NULL CHECK(source_account_number ~ '^\d{10}$'),
 destination_account_number TEXT NOT NULL CHECK(destination_account_number ~ '^\d{10}$'),
 destination_account_name TEXT NOT NULL,
 provider_reference TEXT NOT NULL UNIQUE,
 provider_returned_reference TEXT,
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','PROCESSING','RECONCILIATION_REQUIRED','COMPLETED','FAILED')),
 failure_code TEXT,
 reconciliation_attempts INTEGER NOT NULL DEFAULT 0,
 next_reconciliation_at TIMESTAMPTZ DEFAULT NOW(),
 completed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX mart_layaway_settlements_reconciliation_idx ON mart_layaway_settlements(next_reconciliation_at)
 WHERE state IN ('PENDING','PROCESSING','RECONCILIATION_REQUIRED');

CREATE TABLE mart_layaway_journal_entries (
 id UUID PRIMARY KEY,
 plan_id UUID NOT NULL REFERENCES mart_layaway_plans(id),
 payment_id UUID REFERENCES mart_payments(id),
 settlement_id UUID REFERENCES mart_layaway_settlements(id),
 account_code TEXT NOT NULL CHECK(account_code IN ('HOLDING_CASH','CUSTOMER_FUNDS_HELD','MERCHANT_PAYABLE','SERVICE_FEE_REVENUE','FINANCING_RECEIVABLE')),
 direction TEXT NOT NULL CHECK(direction IN ('DEBIT','CREDIT')),
 amount_kobo BIGINT NOT NULL CHECK(amount_kobo > 0),
 reference TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(reference,account_code,direction)
);
CREATE INDEX mart_layaway_journal_plan_idx ON mart_layaway_journal_entries(plan_id,created_at);
CREATE TRIGGER mart_layaway_journal_append_only BEFORE UPDATE OR DELETE ON mart_layaway_journal_entries
 FOR EACH ROW EXECUTE FUNCTION mart_reject_event_mutation();

