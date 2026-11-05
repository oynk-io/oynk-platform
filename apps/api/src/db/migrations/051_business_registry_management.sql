-- Stable public-facing business URLs. Internal UUIDs remain the account/FK IDs.
ALTER TABLE organizations ADD COLUMN business_slug TEXT;
CREATE UNIQUE INDEX organizations_business_slug_uidx ON organizations(business_slug) WHERE business_slug IS NOT NULL;

CREATE FUNCTION assign_business_slug() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix TEXT;
  attempt INTEGER := 0;
BEGIN
  IF NEW.type <> 'BUSINESS' THEN NEW.business_slug := NULL; RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.business_slug IS NOT NULL THEN
    NEW.business_slug := OLD.business_slug;
    RETURN NEW;
  END IF;
  base_slug := trim(BOTH '-' FROM regexp_replace(lower(NEW.legal_name), '[^a-z0-9]+', '-', 'g'));
  base_slug := trim(TRAILING '-' FROM left(base_slug, 72));
  IF base_slug = '' THEN base_slug := 'business'; END IF;
  -- Serialize only slug allocation, so simultaneous equal-name registrations
  -- cannot both claim the same readable URL.
  PERFORM pg_advisory_xact_lock(hashtextextended('oynk.business.slug', 0));
  candidate := base_slug;
  suffix := left(replace(NEW.id::text, '-', ''), 10);
  WHILE EXISTS(SELECT 1 FROM organizations WHERE business_slug = candidate AND id <> NEW.id) LOOP
    attempt := attempt + 1;
    candidate := base_slug || '-' || suffix || CASE WHEN attempt > 1 THEN '-' || attempt::text ELSE '' END;
  END LOOP;
  NEW.business_slug := candidate;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organizations_assign_business_slug
BEFORE INSERT OR UPDATE OF legal_name, type, business_slug ON organizations
FOR EACH ROW EXECUTE FUNCTION assign_business_slug();

DO $$
DECLARE business RECORD;
BEGIN
  FOR business IN SELECT id FROM organizations WHERE type='BUSINESS' ORDER BY created_at,id LOOP
    UPDATE organizations SET business_slug=NULL WHERE id=business.id;
  END LOOP;
END;
$$;

ALTER TABLE organizations ADD CONSTRAINT organizations_business_slug_valid CHECK (
  (type='BUSINESS' AND business_slug IS NOT NULL AND length(business_slug)<=100 AND business_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
  OR (type<>'BUSINESS' AND business_slug IS NULL)
);

-- Information requests are separate from activation: asking an active business
-- for information does not implicitly suspend its payment access.
CREATE TABLE business_information_requests (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  note TEXT NOT NULL CHECK (length(note) BETWEEN 3 AND 2000),
  state TEXT NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','RESPONDED','RESOLVED')),
  response TEXT CHECK (response IS NULL OR length(response) BETWEEN 3 AND 4000),
  responded_by UUID REFERENCES users(id),
  responded_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolution_note TEXT CHECK (resolution_note IS NULL OR length(resolution_note)<=1000),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((state='OPEN' AND response IS NULL AND resolved_at IS NULL)
    OR (state='RESPONDED' AND response IS NOT NULL AND responded_at IS NOT NULL AND resolved_at IS NULL)
    OR (state='RESOLVED' AND resolved_at IS NOT NULL))
);
CREATE INDEX business_information_requests_org_idx ON business_information_requests(organization_id,created_at DESC);
