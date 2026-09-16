CREATE TABLE consumer_phone_links (
  phone TEXT NOT NULL,
  subject TEXT NOT NULL,
  client_id TEXT NOT NULL,
  network TEXT NOT NULL CHECK(network IN ('TESTNET','PUBLIC')),
  wallet TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (phone, client_id),
  UNIQUE (client_id, network, wallet)
);
