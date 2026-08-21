BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code IN ('viewer', 'operator', 'dxf_editor', 'administrator')),
  name text NOT NULL
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role_id uuid NOT NULL REFERENCES roles(id),
  active boolean NOT NULL DEFAULT true,
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  ip_address inet,
  user_agent text,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_resource_idx ON audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_user_id, created_at DESC);

INSERT INTO roles(code, name) VALUES
  ('viewer', 'Viewer'), ('operator', 'Operator'), ('dxf_editor', 'DXF Editor'), ('administrator', 'Administrator')
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions(code, description) VALUES
  ('asset:read', 'Melihat data aset'),
  ('asset:write', 'Mengubah data aset'),
  ('dxf:read', 'Melihat DXF'),
  ('dxf:write', 'Mengubah draft DXF'),
  ('dxf:publish', 'Menerbitkan versi DXF'),
  ('admin:manage', 'Mengelola pengguna dan konfigurasi'),
  ('audit:read', 'Melihat audit log')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE (r.code = 'viewer' AND p.code IN ('asset:read', 'dxf:read'))
   OR (r.code = 'operator' AND p.code IN ('asset:read', 'asset:write', 'dxf:read'))
   OR (r.code = 'dxf_editor' AND p.code IN ('asset:read', 'dxf:read', 'dxf:write', 'dxf:publish'))
   OR r.code = 'administrator'
ON CONFLICT DO NOTHING;

COMMIT;
