BEGIN;

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_maintenance_cost_check;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'maintenance_cost'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'maintenance_reference'
  ) THEN
    ALTER TABLE assets RENAME COLUMN maintenance_cost TO maintenance_reference;
  END IF;
END $$;

ALTER TABLE assets ADD COLUMN IF NOT EXISTS maintenance_reference text;
ALTER TABLE assets ALTER COLUMN maintenance_reference TYPE text USING maintenance_reference::text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS coordinate_text text;

COMMENT ON COLUMN assets.maintenance_reference IS 'Referensi biaya/pemeliharaan dari workbook, misalnya COA 5110020001';
COMMENT ON COLUMN assets.coordinate_text IS 'Nilai koordinat asli dari workbook; longitude/latitude menyimpan hasil parsing terstruktur';

COMMIT;
