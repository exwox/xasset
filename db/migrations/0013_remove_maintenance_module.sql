BEGIN;

DROP TABLE IF EXISTS asset_maintenance_history;
DROP TABLE IF EXISTS maintenance_schedules;
DROP TABLE IF EXISTS maintenance_statuses;
DROP TABLE IF EXISTS maintenance_types;

ALTER TABLE assets DROP COLUMN IF EXISTS maintenance_reference;

DELETE FROM permissions WHERE code IN ('maintenance:read', 'maintenance:write');

COMMIT;
