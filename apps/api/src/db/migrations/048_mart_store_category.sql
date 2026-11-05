ALTER TABLE mart_storefronts
  ADD COLUMN category TEXT NOT NULL DEFAULT 'other'
  CHECK (category IN ('electronics', 'supermarket', 'restaurants', 'food_kitchens', 'wholesale', 'fashion', 'home', 'health', 'services', 'other'));

CREATE INDEX mart_storefronts_category_published_idx
  ON mart_storefronts(category, organization_id) WHERE status = 'PUBLISHED';
