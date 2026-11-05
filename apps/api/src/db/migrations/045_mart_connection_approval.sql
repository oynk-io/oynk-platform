ALTER TABLE mart_connections DROP CONSTRAINT IF EXISTS mart_connections_status_check;
ALTER TABLE mart_connections ADD CONSTRAINT mart_connections_status_check CHECK(status IN ('PENDING','ACTIVE','REVOKED'));
