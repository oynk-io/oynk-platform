ALTER TABLE consumer_fiat_tier_upgrades
  DROP CONSTRAINT consumer_fiat_tier_upgrades_status_check;
ALTER TABLE consumer_fiat_tier_upgrades
  ADD CONSTRAINT consumer_fiat_tier_upgrades_status_check
  CHECK (status IN ('PROCESSING','PENDING_REVIEW','UNKNOWN','FAILED','PROVIDER_CONFIRMED','COMPLETED'));
