BEGIN;

CREATE TABLE dxf_edit_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES dxf_documents(id) ON DELETE CASCADE,
  base_version_id uuid NOT NULL REFERENCES dxf_versions(id) ON DELETE RESTRICT,
  exported_version_id uuid REFERENCES dxf_versions(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1 CHECK(version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','exported','discarded')),
  snapshot jsonb NOT NULL DEFAULT '{"patches":{}}'::jsonb,
  change_note text,
  created_by uuid REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  exported_at timestamptz,
  CHECK(jsonb_typeof(snapshot) = 'object')
);

CREATE INDEX dxf_edit_sessions_document_idx ON dxf_edit_sessions(document_id,status,updated_at DESC);
CREATE INDEX dxf_edit_sessions_base_version_idx ON dxf_edit_sessions(base_version_id);

COMMIT;
