CREATE TABLE consumer_handles (
  handle TEXT PRIMARY KEY CHECK (handle ~ '^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$'),
  account_id UUID NOT NULL UNIQUE REFERENCES consumer_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE consumer_handle_reservations (
  handle TEXT PRIMARY KEY CHECK (handle ~ '^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])$'),
  challenge_id UUID NOT NULL UNIQUE REFERENCES consumer_phone_challenges(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX consumer_handle_reservations_expiry
  ON consumer_handle_reservations(expires_at);
