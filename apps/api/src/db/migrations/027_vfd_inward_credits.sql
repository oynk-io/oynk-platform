CREATE TABLE consumer_vfd_inward_credits (
  session_id TEXT PRIMARY KEY,
  provider_reference TEXT NOT NULL,
  deposit_account_id UUID NOT NULL REFERENCES consumer_quick_pay_deposit_accounts(account_id),
  amount_kobo BIGINT NOT NULL CHECK (amount_kobo > 0),
  occurred_at TIMESTAMPTZ NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('CREDITED','REVIEW')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX consumer_vfd_inward_account_time_idx
  ON consumer_vfd_inward_credits(deposit_account_id, occurred_at DESC);
