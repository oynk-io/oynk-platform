-- A layaway duration is a payoff window, not a payment schedule. Customers may
-- make any number of contributions before the 30/60/90-day deadline.
ALTER TABLE mart_layaway_plans
  ADD COLUMN deadline_at TIMESTAMPTZ;

ALTER TABLE mart_layaway_plans DROP CONSTRAINT mart_layaway_plans_state_check;
ALTER TABLE mart_layaway_plans ADD CONSTRAINT mart_layaway_plans_state_check
  CHECK(state IN ('PENDING_MERCHANT','ACTIVE','FUNDED','SETTLING','COMPLETED','EXPIRED','CANCELLED'));

-- Preserve already-active local plans by deriving their deadline from their
-- activation time. New plans always receive an explicit deadline on approval.
UPDATE mart_layaway_plans
SET deadline_at = starts_at + make_interval(days => duration_months * 30)
WHERE starts_at IS NOT NULL AND deadline_at IS NULL;

ALTER TABLE mart_payments
  ADD COLUMN layaway_plan_id UUID REFERENCES mart_layaway_plans(id),
  ADD COLUMN payment_kind TEXT NOT NULL DEFAULT 'FULL'
    CHECK(payment_kind IN ('FULL','LAYAWAY_CONTRIBUTION'));

-- Convert any development plans created under the former fixed-installment
-- model without losing their payment history.
UPDATE mart_payments p
SET layaway_plan_id = i.plan_id,
    payment_kind = 'LAYAWAY_CONTRIBUTION'
FROM mart_layaway_installments i
WHERE p.layaway_installment_id = i.id;

DROP INDEX IF EXISTS mart_payments_one_completed_full_per_order;
CREATE UNIQUE INDEX mart_payments_one_completed_full_per_order
  ON mart_payments(order_id)
  WHERE payment_kind='FULL' AND state='COMPLETED';
CREATE INDEX mart_payments_layaway_contributions_idx
  ON mart_payments(layaway_plan_id,created_at)
  WHERE payment_kind='LAYAWAY_CONTRIBUTION';

CREATE INDEX mart_layaway_plans_deadline_idx
  ON mart_layaway_plans(deadline_at)
  WHERE state='ACTIVE';
