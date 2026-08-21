BEGIN;

CREATE SEQUENCE asset_directory_no_seq AS bigint START WITH 1;

ALTER TABLE assets ADD COLUMN directory_no bigint;

WITH numbered AS (
  SELECT id,row_number() OVER (ORDER BY created_at,id) AS directory_no
  FROM assets
)
UPDATE assets a
SET directory_no=numbered.directory_no
FROM numbered
WHERE numbered.id=a.id;

SELECT setval(
  'asset_directory_no_seq',
  COALESCE((SELECT max(directory_no) FROM assets),0)+1,
  false
);

ALTER TABLE assets
  ALTER COLUMN directory_no SET DEFAULT nextval('asset_directory_no_seq'),
  ALTER COLUMN directory_no SET NOT NULL;

ALTER SEQUENCE asset_directory_no_seq OWNED BY assets.directory_no;
CREATE UNIQUE INDEX assets_directory_no_idx ON assets(directory_no);

COMMIT;
