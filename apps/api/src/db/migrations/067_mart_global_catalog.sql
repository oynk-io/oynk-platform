CREATE TABLE IF NOT EXISTS mart_source_markets (
  code TEXT PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{2,39}$'),
  provider TEXT NOT NULL CHECK (provider ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 80),
  country_code TEXT NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  marketplace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','PAUSED')),
  managed_by TEXT NOT NULL DEFAULT 'OYNK' CHECK (managed_by = 'OYNK'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mart_global_storefronts (
  id UUID PRIMARY KEY,
  market_code TEXT NOT NULL REFERENCES mart_source_markets(code),
  source_seller_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  source_url TEXT,
  rating NUMERIC(6,3),
  feedback_count BIGINT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market_code, source_seller_id)
);

CREATE TABLE IF NOT EXISTS mart_global_items (
  id UUID PRIMARY KEY,
  market_code TEXT NOT NULL REFERENCES mart_source_markets(code),
  storefront_id UUID NOT NULL REFERENCES mart_global_storefronts(id),
  source_item_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT,
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(image_urls) = 'array'),
  currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  price_minor BIGINT NOT NULL CHECK (price_minor >= 0),
  shipping_minor BIGINT,
  availability TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (availability IN ('AVAILABLE','UNAVAILABLE','UNKNOWN')),
  buying_options JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(buying_options) = 'array'),
  condition TEXT,
  source_ends_at TIMESTAMPTZ,
  source_payload_hash TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market_code, source_item_id)
);

CREATE INDEX IF NOT EXISTS mart_global_storefronts_market_idx ON mart_global_storefronts(market_code, id DESC) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS mart_global_storefronts_name_idx ON mart_global_storefronts USING GIN (to_tsvector('simple', display_name));
CREATE INDEX IF NOT EXISTS mart_global_items_market_idx ON mart_global_items(market_code, id DESC) WHERE availability='AVAILABLE';
CREATE INDEX IF NOT EXISTS mart_global_items_store_idx ON mart_global_items(storefront_id, id DESC) WHERE availability='AVAILABLE';
CREATE INDEX IF NOT EXISTS mart_global_items_search_idx ON mart_global_items USING GIN (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(category,'')));

CREATE TABLE IF NOT EXISTS mart_logistics_routes (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]{2,49}$'),
  scope TEXT NOT NULL CHECK (scope IN ('LOCAL','GLOBAL')),
  market_code TEXT REFERENCES mart_source_markets(code),
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 100),
  provider_reference TEXT,
  origin_country TEXT NOT NULL CHECK (origin_country ~ '^[A-Z]{2}$'),
  destination_country TEXT NOT NULL CHECK (destination_country ~ '^[A-Z]{2}$'),
  transport_mode TEXT NOT NULL CHECK (transport_mode IN ('LOCAL_DISPATCH','AIR','SEA','COURIER')),
  min_days INTEGER NOT NULL CHECK (min_days >= 0 AND min_days <= 180),
  max_days INTEGER NOT NULL CHECK (max_days >= min_days AND max_days <= 365),
  pricing_policy JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(pricing_policy)='object'),
  status TEXT NOT NULL DEFAULT 'PAUSED' CHECK (status IN ('ACTIVE','PAUSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((scope='GLOBAL' AND market_code IS NOT NULL) OR (scope='LOCAL' AND market_code IS NULL))
);
CREATE INDEX IF NOT EXISTS mart_logistics_routes_scope_idx ON mart_logistics_routes(scope,status,code);

INSERT INTO mart_source_markets(code,provider,display_name,country_code,currency,marketplace_id)
VALUES ('ebay_us','EBAY','eBay US','US','USD','EBAY_US')
ON CONFLICT (code) DO UPDATE SET
  provider=EXCLUDED.provider,
  display_name=EXCLUDED.display_name,
  country_code=EXCLUDED.country_code,
  currency=EXCLUDED.currency,
  marketplace_id=EXCLUDED.marketplace_id,
  updated_at=NOW();

INSERT INTO permissions(name,description) VALUES
 ('mart_global:read','Read global market and logistics configuration'),
 ('mart_global:manage','Manage global market and logistics configuration')
ON CONFLICT (name) DO NOTHING;
INSERT INTO role_permissions(role_name,permission_name) VALUES
 ('PLATFORM_OWNER','mart_global:read'),('PLATFORM_OWNER','mart_global:manage'),
 ('PARTNER_OPERATIONS','mart_global:read')
ON CONFLICT DO NOTHING;
