CREATE TABLE consumer_goals (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES consumer_accounts(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('car','house','equipment','business','other')),
  custom_goal TEXT,
  profession TEXT NOT NULL,
  target_amount_kobo BIGINT NOT NULL CHECK (target_amount_kobo > 0),
  target_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','ARCHIVED','ACHIEVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((category='other' AND custom_goal IS NOT NULL) OR (category<>'other' AND custom_goal IS NULL))
);

CREATE UNIQUE INDEX consumer_goals_one_active
  ON consumer_goals(account_id) WHERE status='ACTIVE';
CREATE INDEX consumer_goals_account_created
  ON consumer_goals(account_id, created_at DESC);
