-- Empty email is a valid Tier 1 value. Keep uniqueness for supplied addresses
-- while allowing multiple consumer accounts without an email address.
DROP INDEX IF EXISTS consumer_email;
CREATE UNIQUE INDEX consumer_email ON consumer_accounts (lower(profile->>'email'))
  WHERE COALESCE(profile->>'email', '') <> '';
