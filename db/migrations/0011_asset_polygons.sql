BEGIN;

ALTER TABLE assets
  ADD COLUMN polygon jsonb,
  ADD CONSTRAINT assets_polygon_valid CHECK (
    CASE
      WHEN polygon IS NULL THEN true
      WHEN jsonb_typeof(polygon) <> 'array' THEN false
      ELSE jsonb_array_length(polygon) BETWEEN 3 AND 500
    END
  );

COMMIT;
