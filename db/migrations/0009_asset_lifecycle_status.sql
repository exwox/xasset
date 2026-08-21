ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_maintenance_status_check;

UPDATE assets
SET maintenance_status = CASE maintenance_status
  WHEN 'Maintenance' THEN 'Under Maintenance'
  WHEN 'Operational' THEN 'Active'
  WHEN 'Inspection' THEN 'Active'
  ELSE maintenance_status
END;

ALTER TABLE assets ALTER COLUMN maintenance_status SET DEFAULT 'Active';
ALTER TABLE assets ADD CONSTRAINT assets_maintenance_status_check
  CHECK (maintenance_status IN (
    'Planned',
    'Under Construction',
    'Commissioning',
    'Active',
    'Under Maintenance',
    'Inactive',
    'Decommissioned',
    'Demolished'
  ));
