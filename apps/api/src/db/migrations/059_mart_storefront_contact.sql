ALTER TABLE mart_storefronts ADD COLUMN public_phone TEXT
  CHECK (public_phone IS NULL OR public_phone ~ '^\+[1-9][0-9]{7,14}$');
