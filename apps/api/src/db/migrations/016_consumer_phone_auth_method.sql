ALTER TABLE consumer_phone_links
  ADD COLUMN auth_method TEXT;

UPDATE consumer_phone_links
SET auth_method = CASE
  WHEN subject LIKE 'evm-%' THEN 'device'
  ELSE 'passkey'
END;

ALTER TABLE consumer_phone_links
  ALTER COLUMN auth_method SET NOT NULL,
  ADD CONSTRAINT consumer_phone_links_auth_method_check
    CHECK (auth_method IN ('passkey', 'device'));
