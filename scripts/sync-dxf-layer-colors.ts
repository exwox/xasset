import { GetObjectCommand } from "@aws-sdk/client-s3";
import DxfParser from "dxf-parser";
import { colorFromDxfLayer } from "../src/lib/dxf-processing";
import { config } from "../src/server/config";
import { query } from "../src/server/db";
import { storage } from "../src/server/storage";

interface VersionRow {
  id: string;
  source_file_key: string;
}

interface ParsedDrawing {
  tables?: {
    layer?: {
      layers?: Record<string, { color?: number; colorIndex?: number }>;
    };
  };
}

async function main() {
  const versions = await query<VersionRow>(
    `SELECT id,source_file_key
     FROM dxf_versions
     WHERE status IN ('ready','published') AND source_file_key IS NOT NULL
     ORDER BY created_at`,
  );
  let updatedLayers = 0;

  for (const version of versions.rows) {
    const object = await storage().send(
      new GetObjectCommand({ Bucket: config().S3_BUCKET, Key: version.source_file_key }),
    );
    const source = await object.Body?.transformToString();
    if (!source) continue;
    const drawing = new DxfParser().parseSync(source) as ParsedDrawing | null;
    const layers = drawing?.tables?.layer?.layers ?? {};

    for (const [name, definition] of Object.entries(layers)) {
      const color = colorFromDxfLayer(definition);
      if (!color) continue;
      const result = await query(
        `UPDATE dxf_layers SET color=$3 WHERE version_id=$1 AND name=$2 AND color IS DISTINCT FROM $3`,
        [version.id, name, color],
      );
      updatedLayers += result.rowCount ?? 0;
    }
  }

  console.log(JSON.stringify({ versions: versions.rowCount, updatedLayers }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
