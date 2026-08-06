CREATE TABLE email_deliveries (
  id UUID PRIMARY KEY,
  recipient TEXT NOT NULL,
  template TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('DELIVERED','FAILED','PREVIEWED')),
  attempts INTEGER NOT NULL DEFAULT 1,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX email_deliveries_status_time_idx ON email_deliveries (status, created_at DESC);
