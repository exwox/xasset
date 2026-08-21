BEGIN;

CREATE TABLE maintenance_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL CHECK(category IN ('preventive','corrective','inspection')),
  default_interval_days integer CHECK(default_interval_days > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_statuses (
  code text PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  terminal boolean NOT NULL DEFAULT false
);

CREATE TABLE maintenance_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  maintenance_type_id uuid NOT NULL REFERENCES maintenance_types(id),
  status_code text NOT NULL DEFAULT 'PLANNED' REFERENCES maintenance_statuses(code),
  title text NOT NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
  pic_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  pic_name text,
  planned_date date NOT NULL,
  completed_date date,
  recurrence_days integer CHECK(recurrence_days > 0),
  estimated_cost numeric(20,2) CHECK(estimated_cost >= 0),
  actual_cost numeric(20,2) CHECK(actual_cost >= 0),
  result text,
  notes text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CHECK(status_code <> 'COMPLETED' OR completed_date IS NOT NULL)
);

CREATE TABLE asset_maintenance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  schedule_id uuid REFERENCES maintenance_schedules(id) ON DELETE SET NULL,
  action text NOT NULL,
  previous_status text,
  new_status text,
  snapshot jsonb NOT NULL DEFAULT '{}',
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE asset_documents
  ADD COLUMN description text,
  ADD COLUMN expires_on date,
  ADD COLUMN archived_at timestamptz;

CREATE INDEX maintenance_schedules_asset_idx ON maintenance_schedules(asset_id,planned_date DESC) WHERE archived_at IS NULL;
CREATE INDEX maintenance_schedules_due_idx ON maintenance_schedules(planned_date,status_code) WHERE archived_at IS NULL;
CREATE INDEX asset_maintenance_history_asset_idx ON asset_maintenance_history(asset_id,created_at DESC);
CREATE INDEX asset_documents_active_idx ON asset_documents(asset_id,created_at DESC) WHERE archived_at IS NULL;

INSERT INTO maintenance_types(code,name,category,default_interval_days) VALUES
  ('PREVENTIVE','Preventive maintenance','preventive',90),
  ('CORRECTIVE','Corrective maintenance','corrective',NULL),
  ('INSPECTION','Inspeksi berkala','inspection',30)
ON CONFLICT(code) DO NOTHING;

INSERT INTO maintenance_statuses(code,name,sort_order,terminal) VALUES
  ('PLANNED','Direncanakan',10,false),
  ('IN_PROGRESS','Sedang dikerjakan',20,false),
  ('COMPLETED','Selesai',30,true),
  ('CANCELLED','Dibatalkan',40,true)
ON CONFLICT(code) DO NOTHING;

INSERT INTO permissions(code,description) VALUES
  ('maintenance:read','Melihat jadwal dan histori maintenance'),
  ('maintenance:write','Mengelola jadwal dan realisasi maintenance'),
  ('document:download','Mengunduh dokumentasi aset'),
  ('document:upload','Mengunggah dokumentasi aset'),
  ('document:delete','Mengarsipkan dokumentasi aset')
ON CONFLICT(code) DO NOTHING;

INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE (r.code='viewer' AND p.code IN ('maintenance:read','document:download'))
   OR (r.code='operator' AND p.code IN ('maintenance:read','maintenance:write','document:download','document:upload','document:delete'))
   OR (r.code='dxf_editor' AND p.code IN ('maintenance:read','document:download'))
   OR r.code='administrator'
ON CONFLICT DO NOTHING;

COMMIT;
