CREATE TABLE business_application_events (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sequence BIGSERIAL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  actor_user_id UUID REFERENCES users(id),
  note TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(organization_id,sequence)
);

CREATE TABLE business_account_provisioning_events (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sequence BIGSERIAL,
  event_type TEXT NOT NULL,
  state TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id),
  provider_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(organization_id,sequence)
);
