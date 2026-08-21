ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_maintenance_cost_check;
ALTER TABLE assets RENAME COLUMN maintenance_cost TO maintenance_reference;
ALTER TABLE assets ALTER COLUMN maintenance_reference TYPE text USING maintenance_reference::text;
ALTER TABLE assets ADD COLUMN coordinate_text text;

COMMENT ON COLUMN assets.maintenance_reference IS 'Referensi biaya/pemeliharaan dari workbook, misalnya COA 5110020001';
COMMENT ON COLUMN assets.coordinate_text IS 'Nilai koordinat asli dari workbook; longitude/latitude menyimpan hasil parsing terstruktur';
