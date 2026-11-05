INSERT INTO permissions(name,description) VALUES
 ('mart:read','Read the business Mart catalog'),
 ('mart:manage','Manage the business Mart catalog and connectors')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions(role_name,permission_name) VALUES
 ('BUSINESS_OWNER','mart:read'),('BUSINESS_OWNER','mart:manage'),
 ('BUSINESS_ADMIN','mart:read'),('BUSINESS_ADMIN','mart:manage'),
 ('BUSINESS_DEVELOPER','mart:read'),('BUSINESS_DEVELOPER','mart:manage'),
 ('BUSINESS_AUDITOR','mart:read'),
 ('PLATFORM_OWNER','mart:read'),('PLATFORM_OWNER','mart:manage')
ON CONFLICT DO NOTHING;

CREATE TABLE mart_storefronts (
 organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 display_name TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'PRIVATE' CHECK(status IN ('PRIVATE','PUBLISHED','SUSPENDED')),
 published_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE mart_connections (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 source_system TEXT NOT NULL CHECK(source_system ~ '^[a-z][a-z0-9_]{1,39}$'),
 source_tenant_id TEXT NOT NULL CHECK(length(source_tenant_id) BETWEEN 1 AND 160),
 label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
 token_hash TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
 last_synced_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 revoked_at TIMESTAMPTZ
);
CREATE INDEX mart_connections_organization_idx ON mart_connections(organization_id,status);
CREATE UNIQUE INDEX mart_connections_active_source_uidx ON mart_connections(organization_id,source_system,source_tenant_id) WHERE status='ACTIVE';

CREATE TABLE mart_items (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 connection_id UUID NOT NULL REFERENCES mart_connections(id) ON DELETE CASCADE,
 source_item_id TEXT NOT NULL CHECK(length(source_item_id) BETWEEN 1 AND 160),
 source_revision BIGINT NOT NULL CHECK(source_revision >= 1),
 source_payload_hash TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('PRODUCT','SERVICE')),
 sku TEXT,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
 description TEXT NOT NULL DEFAULT '',
 category TEXT,
 image_urls JSONB NOT NULL DEFAULT '[]'::JSONB,
 currency CHAR(3) NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 price_minor BIGINT NOT NULL CHECK(price_minor >= 0),
 quantity NUMERIC(18,3) CHECK(quantity IS NULL OR quantity >= 0),
 availability TEXT NOT NULL CHECK(availability IN ('IN_STOCK','OUT_OF_STOCK','UNKNOWN')),
 source_active BOOLEAN NOT NULL DEFAULT TRUE,
 published BOOLEAN NOT NULL DEFAULT FALSE,
 published_at TIMESTAMPTZ,
 last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(connection_id,source_item_id)
);
CREATE INDEX mart_items_merchant_idx ON mart_items(organization_id,id DESC);
CREATE INDEX mart_items_discovery_idx ON mart_items(published_at DESC,id DESC)
 WHERE published AND source_active AND availability='IN_STOCK';
CREATE INDEX mart_items_search_idx ON mart_items USING GIN
 (to_tsvector('simple',coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(category,'')));

CREATE TABLE mart_catalog_events (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 connection_id UUID,
 item_id UUID,
 event_id TEXT,
 action TEXT NOT NULL,
 actor_type TEXT NOT NULL CHECK(actor_type IN ('MERCHANT','CONNECTOR','SYSTEM')),
 actor_reference TEXT NOT NULL,
 metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(connection_id,event_id)
);
CREATE INDEX mart_catalog_events_org_time_idx ON mart_catalog_events(organization_id,created_at DESC);

CREATE FUNCTION mart_reject_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Mart catalog events are append-only';
END;
$$;
CREATE TRIGGER mart_catalog_events_append_only BEFORE UPDATE OR DELETE ON mart_catalog_events
 FOR EACH ROW EXECUTE FUNCTION mart_reject_event_mutation();
