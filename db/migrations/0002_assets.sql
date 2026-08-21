BEGIN;

CREATE TABLE sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL,
  boundary geometry(MultiPolygon, 4326), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  code text NOT NULL, name text NOT NULL, location geometry(Point, 4326), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, code)
);
CREATE TABLE floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), building_id uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  code text NOT NULL, name text NOT NULL, level_number numeric(8,2), elevation numeric(12,3), UNIQUE(building_id, code)
);
CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  building_id uuid REFERENCES buildings(id) ON DELETE SET NULL, floor_id uuid REFERENCES floors(id) ON DELETE SET NULL,
  code text NOT NULL, name text NOT NULL, UNIQUE(site_id, code)
);
CREATE TABLE asset_classes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL);
CREATE TABLE asset_categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL);
CREATE TABLE units_of_measure (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL);
CREATE TABLE usage_frequencies (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL, sort_order integer NOT NULL DEFAULT 0);

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_number text NOT NULL UNIQUE,
  capitalized_on date,
  asset_code text NOT NULL,
  asset_class_id uuid REFERENCES asset_classes(id),
  category_id uuid REFERENCES asset_categories(id),
  asset_description text NOT NULL,
  acquisition_value numeric(20,2) NOT NULL DEFAULT 0 CHECK(acquisition_value >= 0),
  book_value numeric(20,2) NOT NULL DEFAULT 0 CHECK(book_value >= 0),
  currency_code char(3) NOT NULL DEFAULT 'IDR',
  quantity numeric(20,4) NOT NULL DEFAULT 1 CHECK(quantity > 0),
  unit_id uuid REFERENCES units_of_measure(id),
  location_id uuid REFERENCES locations(id),
  parent_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  sub_asset_text text,
  data_requirements text,
  documentation_note text,
  layout_location text,
  maintenance_reference text,
  usage_frequency_id uuid REFERENCES usage_frequencies(id),
  layout_reference text,
  maintenance_status text NOT NULL DEFAULT 'Active' CHECK(maintenance_status IN ('Planned','Under Construction','Commissioning','Active','Under Maintenance','Inactive','Decommissioned','Demolished')),
  condition text,
  longitude numeric(10,7) CHECK(longitude BETWEEN -180 AND 180),
  latitude numeric(10,7) CHECK(latitude BETWEEN -90 AND 90),
  altitude numeric(12,3),
  coordinate_text text,
  local_x numeric(20,6), local_y numeric(20,6), local_z numeric(20,6),
  version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id), updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
  CHECK(parent_asset_id IS NULL OR parent_asset_id <> id)
);
CREATE INDEX assets_code_idx ON assets(asset_code);
CREATE INDEX assets_class_idx ON assets(asset_class_id);
CREATE INDEX assets_location_idx ON assets(location_id);
CREATE INDEX assets_parent_idx ON assets(parent_asset_id);
CREATE INDEX assets_search_idx ON assets USING gin(to_tsvector('simple', asset_number || ' ' || asset_code || ' ' || asset_description));
CREATE INDEX assets_geo_idx ON assets USING gist(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)) WHERE longitude IS NOT NULL AND latitude IS NOT NULL;

CREATE TABLE asset_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  file_name text NOT NULL, object_key text NOT NULL UNIQUE, content_type text NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes >= 0),
  document_type text, uploaded_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE asset_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  previous_status text, new_status text NOT NULL, note text, changed_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO sites(code,name) VALUES('TNJ','Bandar Udara Raja Haji Fisabilillah — Tanjung Pinang') ON CONFLICT(code) DO NOTHING;
INSERT INTO usage_frequencies(code,name,sort_order) VALUES
  ('CONTINUOUS','Kontinu',10),('DAILY','Setiap hari',20),('WEEKLY','Mingguan',30),('MONTHLY','Bulanan',40),('OCCASIONAL','Sesuai kebutuhan',50),('UNKNOWN','Belum ditentukan',99)
ON CONFLICT(code) DO NOTHING;

COMMIT;
