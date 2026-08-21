BEGIN;

ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_code_check;

INSERT INTO roles(code, name) VALUES ('user', 'User')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name;

UPDATE users u
SET role_id=(SELECT id FROM roles WHERE code='user'), updated_at=now()
FROM roles r
WHERE u.role_id=r.id AND r.code IN ('operator', 'dxf_editor');

DELETE FROM roles WHERE code IN ('operator', 'dxf_editor');
UPDATE roles SET name='Admin' WHERE code='administrator';
UPDATE roles SET name='Viewer' WHERE code='viewer';

ALTER TABLE roles ADD CONSTRAINT roles_code_check
  CHECK (code IN ('viewer', 'user', 'administrator'));

DELETE FROM role_permissions
WHERE role_id IN (SELECT id FROM roles WHERE code IN ('viewer', 'user'));

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE (r.code='viewer' AND p.code IN ('asset:read','dxf:read'))
   OR (r.code='user' AND p.code IN (
     'asset:read','asset:write','dxf:read','dxf:write','dxf:publish',
     'document:download','document:upload','document:delete'
   ))
ON CONFLICT DO NOTHING;

ALTER TABLE sites
  ADD COLUMN longitude numeric(10,7) CHECK(longitude BETWEEN -180 AND 180),
  ADD COLUMN latitude numeric(10,7) CHECK(latitude BETWEEN -90 AND 90),
  ADD COLUMN camera_height numeric(12,2) NOT NULL DEFAULT 4200 CHECK(camera_height BETWEEN 100 AND 20000000),
  ADD COLUMN active boolean NOT NULL DEFAULT false;

UPDATE sites
SET longitude=104.5323, latitude=0.9227, camera_height=4200, active=true, updated_at=now()
WHERE code='TNJ';

CREATE UNIQUE INDEX sites_one_active_idx ON sites(active) WHERE active;

COMMIT;
