ALTER TABLE organizations ADD COLUMN IF NOT EXISTS inventory_management_requested BOOLEAN NOT NULL DEFAULT FALSE;
