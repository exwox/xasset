import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import DxfParser from "dxf-parser";
import {
  createDxfPreviewSvg,
  createOverview,
  normalizeDxfDrawing,
  serializeDxfJson,
} from "../src/lib/dxf-processing";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run validate:dxf -- /path/to/file.dxf");
  const started = performance.now();
  const source = await readFile(file, "utf8");
  const parsedAt = performance.now();
  const drawing = new DxfParser().parseSync(source);
  if (!drawing) throw new Error("DXF could not be parsed");
  const normalized = normalizeDxfDrawing(drawing, 300_000);
  const normalizedAt = performance.now();
  const overview = createOverview(normalized);
  const preview = createDxfPreviewSvg(normalized);
  const compactJson = JSON.stringify(serializeDxfJson(normalized));
  console.log(
    JSON.stringify(
      {
        sourceBytes: Buffer.byteLength(source),
        entityCount: normalized.entityCount,
        supportedEntityCount: normalized.supportedEntityCount,
        layerCount: normalized.layers.length,
        totalSegmentCount: normalized.totalSegmentCount,
        normalizedSegmentCount: normalized.segments.length,
        overviewSegmentCount: overview.segments.length,
        compactJsonBytes: Buffer.byteLength(compactJson),
        compactJsonGzipBytes: gzipSync(compactJson, { level: 6 }).byteLength,
        truncated: normalized.truncated,
        bounds: normalized.bounds,
        unit: normalized.unit,
        sourceReadMs: Number((parsedAt - started).toFixed(1)),
        parseAndNormalizeMs: Number((normalizedAt - parsedAt).toFixed(1)),
        totalMs: Number((performance.now() - started).toFixed(1)),
        previewSha256: createHash("sha256").update(preview).digest("hex"),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
