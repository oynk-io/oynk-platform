ALTER TABLE mart_orders
 ADD COLUMN IF NOT EXISTS fulfillment_state TEXT NOT NULL DEFAULT 'NOT_STARTED'
 CHECK(fulfillment_state IN ('NOT_STARTED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','CLOSED'));

UPDATE mart_orders
SET fulfillment_state='PREPARING'
WHERE state='PAID' AND fulfillment_state='NOT_STARTED';

CREATE INDEX IF NOT EXISTS mart_orders_fulfillment_idx
 ON mart_orders(organization_id,fulfillment_state,updated_at DESC)
 WHERE state='PAID';
