CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- Match parts of names/descriptions/SKUs while preserving the discovery gates.
CREATE INDEX mart_items_partial_search_idx ON mart_items USING GIN
 ((coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(category,'') || ' ' || coalesce(sku,'')) public.gin_trgm_ops)
 WHERE published AND source_active AND availability='IN_STOCK';

CREATE INDEX mart_storefronts_partial_search_idx ON mart_storefronts
 USING GIN (display_name public.gin_trgm_ops) WHERE status='PUBLISHED';
