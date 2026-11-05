-- Two-phase terminal credential rotation prevents a device from being locked
-- out when the response carrying its replacement secret is interrupted.
CREATE TABLE terminal_credential_rotations (
  id UUID PRIMARY KEY,
  terminal_id UUID NOT NULL REFERENCES merchant_terminals(id) ON DELETE CASCADE,
  new_secret_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX terminal_credential_rotations_pending_idx
  ON terminal_credential_rotations(terminal_id,expires_at DESC)
  WHERE confirmed_at IS NULL;
