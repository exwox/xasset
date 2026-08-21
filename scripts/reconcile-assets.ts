import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { parseAssetWorkbook } from "../src/lib/xlsx-assets";
const source = process.argv[2];
if (!source || !process.env.DATABASE_URL)
  throw new Error("Usage: DATABASE_URL=... npm run reconcile:assets -- /absolute/file.xlsx");
const number = (value: unknown) => Number(value ?? 0);
const close = (a: number, b: number) => Math.abs(a - b) < 0.01;
async function main() {
  const parsed = parseAssetWorkbook(await readFile(resolve(source)));
  const duplicates = parsed.rows
    .map((row) => row.assetNumber)
    .filter((value, index, all) => all.indexOf(value) !== index);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const result = await pool.query(
    `SELECT asset_number "assetNumber",asset_code "assetCode",asset_description description,acquisition_value "acquisitionValue",book_value "bookValue",quantity FROM assets WHERE archived_at IS NULL AND asset_number=ANY($1::text[])`,
    [parsed.rows.map((row) => row.assetNumber)],
  );
  await pool.end();
  const database = new Map(result.rows.map((row) => [row.assetNumber, row]));
  const missing: string[] = [],
    mismatches: Array<{ assetNumber: string; fields: string[] }> = [];
  for (const row of parsed.rows) {
    const stored = database.get(row.assetNumber);
    if (!stored) {
      missing.push(row.assetNumber);
      continue;
    }
    const fields: string[] = [];
    if (stored.assetCode !== row.assetCode) fields.push("assetCode");
    if (stored.description !== row.description) fields.push("description");
    if (!close(number(stored.acquisitionValue), row.acquisitionValue)) fields.push("acquisitionValue");
    if (!close(number(stored.bookValue), row.bookValue)) fields.push("bookValue");
    if (!close(number(stored.quantity), row.quantity)) fields.push("quantity");
    if (fields.length) mismatches.push({ assetNumber: row.assetNumber, fields });
  }
  const sourceTotals = parsed.rows.reduce(
    (sum, row) => ({
      acquisitionValue: sum.acquisitionValue + row.acquisitionValue,
      bookValue: sum.bookValue + row.bookValue,
      quantity: sum.quantity + row.quantity,
    }),
    { acquisitionValue: 0, bookValue: 0, quantity: 0 },
  );
  const matched = result.rows.reduce(
    (sum, row) => ({
      acquisitionValue: sum.acquisitionValue + number(row.acquisitionValue),
      bookValue: sum.bookValue + number(row.bookValue),
      quantity: sum.quantity + number(row.quantity),
    }),
    { acquisitionValue: 0, bookValue: 0, quantity: 0 },
  );
  const report = {
    source: resolve(source),
    sourceRows: parsed.rows.length,
    databaseMatchedRows: result.rowCount,
    parseErrors: parsed.errors,
    duplicateAssetNumbers: [...new Set(duplicates)],
    missing,
    mismatches,
    sourceTotals,
    databaseMatchedTotals: matched,
    reconciled:
      !parsed.errors.length &&
      !duplicates.length &&
      !missing.length &&
      !mismatches.length &&
      close(sourceTotals.acquisitionValue, matched.acquisitionValue) &&
      close(sourceTotals.bookValue, matched.bookValue) &&
      close(sourceTotals.quantity, matched.quantity),
    generatedAt: new Date().toISOString(),
  };
  const path = process.env.RECONCILIATION_REPORT ?? "reconciliation-report.json";
  await writeFile(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.reconciled) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
