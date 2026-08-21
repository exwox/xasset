import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import type { Session } from "../src/server/auth";
import { query, transaction } from "../src/server/db";
import { importAssetRows } from "../src/server/asset-import";
import { parseAssetWorkbook } from "../src/lib/xlsx-assets";

const source = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!source || !process.env.DATABASE_URL)
  throw new Error("Usage: DATABASE_URL=... npm run import:assets -- /absolute/file.xlsx [--dry-run]");

async function main() {
  const parsed = parseAssetWorkbook(await readFile(resolve(source)));
  const duplicates = parsed.rows
    .map((row) => row.assetNumber)
    .filter((value, index, all) => all.indexOf(value) !== index);
  const report = {
    source: resolve(source),
    validRows: parsed.rows.length,
    embeddedImages: parsed.imageCount,
    errors: parsed.errors,
    duplicateAssetNumbers: [...new Set(duplicates)],
    imported: 0,
    importedImages: 0,
    archivedOutsideWorkbook: 0,
    archivedDocumentsOutsideWorkbook: 0,
    dryRun,
  };
  if (report.errors.length || report.duplicateAssetNumbers.length) {
    await writeFile("import-report.json", JSON.stringify(report, null, 2));
    throw new Error("Workbook gagal validasi; lihat import-report.json");
  }
  if (!dryRun) {
    const actorRow = (
      await query<{ id: string; email: string; name: string }>(
        `SELECT u.id,u.email,u.name FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='administrator' AND u.active=true ORDER BY u.created_at LIMIT 1`,
      )
    ).rows[0];
    if (!actorRow) throw new Error("Administrator aktif untuk audit import tidak ditemukan");
    const actor: Session = { userId: actorRow.id, email: actorRow.email, name: actorRow.name, role: "administrator", permissions: [] };
    const imported = await importAssetRows(parsed.rows, actor);
    report.imported = imported.imported;
    report.importedImages = imported.importedImages;
    const assetNumbers = parsed.rows.map((row) => row.assetNumber);
    report.archivedOutsideWorkbook = await transaction(async (client) => {
      const archived = await client.query(
        `UPDATE assets SET archived_at=now(),updated_by=$2,updated_at=now(),version=version+1 WHERE NOT (asset_number=ANY($1::text[])) AND archived_at IS NULL RETURNING id`,
        [assetNumbers, actor.userId],
      );
      // Move every historical number to a collision-free temporary negative
      // range, then assign 1..N exactly in workbook row order.
      await client.query(`UPDATE assets SET directory_no=-(abs(directory_no)+1000000)`);
      await client.query(
        `WITH ordered AS (SELECT asset_number,ordinality::bigint directory_no FROM unnest($1::text[]) WITH ORDINALITY AS source(asset_number,ordinality)) UPDATE assets a SET directory_no=ordered.directory_no FROM ordered WHERE a.asset_number=ordered.asset_number`,
        [assetNumbers],
      );
      const importedAssets = (
        await client.query<{ id: string; asset_number: string }>(
          `SELECT id,asset_number FROM assets WHERE asset_number=ANY($1::text[])`,
          [assetNumbers],
        )
      ).rows;
      const assetIds = new Map(importedAssets.map((asset) => [asset.asset_number, asset.id]));
      const expectedDocumentKeys = parsed.rows.flatMap((row) => {
        const assetId = assetIds.get(row.assetNumber);
        if (!assetId) return [];
        return row.documentationImages.map((image) => {
          const extension = image.contentType === "image/jpeg" ? "jpg" : image.contentType.split("/")[1];
          const digest = createHash("sha256").update(image.bytes).digest("hex");
          return `assets/${assetId}/imports/${digest}.${extension}`;
        });
      });
      const archivedDocuments = await client.query(
        `UPDATE asset_documents SET archived_at=now() WHERE asset_id=ANY($1::uuid[]) AND archived_at IS NULL AND NOT (object_key=ANY($2::text[])) RETURNING id`,
        [importedAssets.map((asset) => asset.id), expectedDocumentKeys],
      );
      report.archivedDocumentsOutsideWorkbook = archivedDocuments.rowCount ?? 0;
      await client.query(`SELECT setval('asset_directory_no_seq',$1,false)`, [assetNumbers.length + 1]);
      await client.query(
        `INSERT INTO audit_logs(actor_user_id,action,resource_type,after_data) VALUES($1,'asset.reference_workbook_replace','asset_import',$2)`,
        [actor.userId, { source: resolve(source), imported: report.imported, importedImages: report.importedImages, archived: archived.rowCount ?? 0, archivedDocuments: report.archivedDocumentsOutsideWorkbook }],
      );
      return archived.rowCount ?? 0;
    });
  }
  await writeFile("import-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
