BEGIN;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_quantity_check;
ALTER TABLE assets ADD CONSTRAINT assets_quantity_check CHECK(quantity >= 0);
COMMIT;
