-- VFD receives the images. Oynk retains only hashes and upload outcomes.
CREATE TABLE consumer_fiat_tier_documents (
  account_id UUID NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('IDENTITY','ADDRESS')),
  document_type TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PROCESSING','UPLOADED','FAILED','UNKNOWN')),
  provider_error_code TEXT,
  uploaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id,kind)
);

CREATE TABLE consumer_fiat_tier_document_events (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('IDENTITY','ADDRESS')),
  content_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PROCESSING','UPLOADED','FAILED','UNKNOWN')),
  provider_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX consumer_fiat_tier_document_events_account_time
  ON consumer_fiat_tier_document_events(account_id,created_at DESC);
