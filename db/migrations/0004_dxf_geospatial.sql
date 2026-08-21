BEGIN;

CREATE TABLE dxf_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
  building_id uuid REFERENCES buildings(id) ON DELETE SET NULL,
  floor_id uuid REFERENCES floors(id) ON DELETE SET NULL,
  active_version_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE dxf_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES dxf_documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK(version_number > 0),
  file_name text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK(size_bytes > 0),
  source_file_key text NOT NULL UNIQUE,
  normalized_file_key text,
  render_file_key text,
  preview_file_key text,
  unit text,
  crs text NOT NULL DEFAULT 'LOCAL',
  transform_matrix jsonb,
  control_points jsonb NOT NULL DEFAULT '[]',
  bounds jsonb,
  entity_count integer,
  supported_entity_count integer,
  layer_count integer,
  status text NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','queued','processing','ready','published','failed','archived')),
  progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  residual_error_m numeric(14,4),
  error_message text,
  change_note text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(document_id, version_number)
);

ALTER TABLE dxf_documents
  ADD CONSTRAINT dxf_documents_active_version_fk
  FOREIGN KEY(active_version_id) REFERENCES dxf_versions(id) ON DELETE SET NULL;

CREATE TABLE dxf_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES dxf_versions(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  entity_count integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(version_id, name)
);

ALTER TABLE assets
  ADD COLUMN dxf_document_id uuid REFERENCES dxf_documents(id) ON DELETE SET NULL,
  ADD COLUMN floor_id uuid REFERENCES floors(id) ON DELETE SET NULL;

CREATE INDEX dxf_documents_site_idx ON dxf_documents(site_id, status);
CREATE INDEX dxf_versions_document_idx ON dxf_versions(document_id, version_number DESC);
CREATE INDEX dxf_layers_version_idx ON dxf_layers(version_id, sort_order);
CREATE INDEX assets_dxf_local_idx ON assets(dxf_document_id, floor_id) WHERE local_x IS NOT NULL AND local_y IS NOT NULL;

COMMIT;
