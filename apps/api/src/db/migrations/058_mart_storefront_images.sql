ALTER TABLE mart_storefronts
  ADD COLUMN image_url TEXT CHECK (
    image_url IS NULL OR (length(image_url) <= 2048 AND image_url LIKE 'https://%')
  );
