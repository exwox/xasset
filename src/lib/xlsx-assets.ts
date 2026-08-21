import { strFromU8, unzipSync } from "fflate";
import { ASSET_STATUSES, type AssetStatus } from "./asset-status";

export interface WorkbookAssetImage {
  fileName: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Uint8Array;
}

export interface WorkbookAssetRow {
  row: number;
  assetNumber: string;
  capitalizedOn: string | null;
  assetCode: string;
  assetClass: string;
  description: string;
  acquisitionValue: number;
  bookValue: number;
  quantity: number;
  unit: string;
  location: string;
  subAsset: string;
  documentation: string;
  layoutLocation: string;
  maintenanceStatus: AssetStatus;
  usageFrequency: string;
  coordinateText: string;
  longitude: number | null;
  latitude: number | null;
  documentationImages: WorkbookAssetImage[];
}

export interface WorkbookResult {
  rows: WorkbookAssetRow[];
  errors: Array<{ row: number; message: string }>;
  headers: Record<string, string>;
  imageCount: number;
}

function decodeXml(value: string) {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
}

function excelDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const serial = Number(value);
  if (!Number.isFinite(serial)) return null;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
}

function columnNumber(column: string) {
  return [...column].reduce((result, character) => result * 26 + character.charCodeAt(0) - 64, 0) - 1;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePath(base: string, target: string) {
  const output: string[] = [];
  for (const part of `${base}/${target}`.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") output.pop();
    else output.push(part);
  }
  return output.join("/");
}

function imageType(fileName: string): WorkbookAssetImage["contentType"] | null {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}

export function parseCoordinateText(value: string) {
  const numbers = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (numbers.length < 2) return { longitude: null, latitude: null };
  const [first, second] = numbers;
  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) return { latitude: first, longitude: second };
  if (Math.abs(first) <= 180 && Math.abs(second) <= 90) return { longitude: first, latitude: second };
  return { longitude: null, latitude: null };
}

function workbookImages(archive: Record<string, Uint8Array>, documentationColumn: number) {
  const byRow = new Map<number, WorkbookAssetImage[]>();
  const sheetRelationships = archive["xl/worksheets/_rels/sheet1.xml.rels"]
    ? strFromU8(archive["xl/worksheets/_rels/sheet1.xml.rels"])
    : "";
  const sheetDrawings = new Set(
    [...sheetRelationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)]
      .filter((match) => match[1].includes("/relationships/drawing"))
      .map((match) => match[1].match(/\bTarget="([^"]+)"/)?.[1])
      .filter((target): target is string => Boolean(target))
      .map((target) => normalizePath("xl/worksheets", target)),
  );
  for (const drawingPath of [...sheetDrawings]) {
    if (!archive[drawingPath]) continue;
    const drawing = strFromU8(archive[drawingPath]);
    const relsPath = drawingPath.replace("xl/drawings/", "xl/drawings/_rels/") + ".rels";
    const relsXml = archive[relsPath] ? strFromU8(archive[relsPath]) : "";
    const relationships = new Map<string, string>();
    for (const match of relsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?\s*>/g))
      relationships.set(match[1], normalizePath("xl/drawings", match[2]));
    for (const anchor of drawing.matchAll(/<xdr:(?:twoCellAnchor|oneCellAnchor)\b[^>]*>([\s\S]*?)<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g)) {
      const from = anchor[1].match(/<xdr:from>([\s\S]*?)<\/xdr:from>/)?.[1] ?? "";
      const column = Number(from.match(/<xdr:col>(\d+)<\/xdr:col>/)?.[1]);
      const row = Number(from.match(/<xdr:row>(\d+)<\/xdr:row>/)?.[1]) + 1;
      const relationshipId = anchor[1].match(/<a:blip\b[^>]*\br:embed="([^"]+)"/)?.[1];
      if (column !== documentationColumn || !Number.isInteger(row) || !relationshipId) continue;
      const mediaPath = relationships.get(relationshipId);
      const bytes = mediaPath ? archive[mediaPath] : undefined;
      const fileName = mediaPath?.split("/").pop() ?? "";
      const contentType = imageType(fileName);
      if (!bytes || !contentType || bytes.byteLength > 10 * 1024 * 1024) continue;
      const images = byRow.get(row) ?? [];
      images.push({ fileName, contentType, bytes });
      byRow.set(row, images);
    }
  }
  return byRow;
}

export function parseAssetWorkbook(buffer: Uint8Array): WorkbookResult {
  const archive = unzipSync(buffer);
  const sharedXml = archive["xl/sharedStrings.xml"] ? strFromU8(archive["xl/sharedStrings.xml"]) : "";
  const sheetXml = archive["xl/worksheets/sheet1.xml"] ? strFromU8(archive["xl/worksheets/sheet1.xml"]) : "";
  if (!sheetXml) throw new Error("Worksheet xl/worksheets/sheet1.xml tidak ditemukan");
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => decodeXml([...match[1].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((item) => item[1]).join("")));
  const cells = new Map<number, Record<string, string>>();
  const addCell = (attributes: string, raw: string, inline = false) => {
    const reference = attributes.match(/\br="([A-Z]+)(\d+)"/);
    if (!reference) return;
    const type = attributes.match(/\bt="([^"]+)"/)?.[1];
    const value = decodeXml(type === "s" ? (shared[Number(raw)] ?? "") : inline ? raw : raw);
    const row = Number(reference[2]);
    const data = cells.get(row) ?? {};
    data[reference[1]] = value.trim();
    cells.set(row, data);
  };
  // The reference workbook contains millions of styled but empty self-closing
  // cells. Match value-bearing cells directly so those placeholders are never
  // materialized or accidentally consumed as one enormous cross-cell match.
  for (const match of sheetXml.matchAll(/<c\b([^>]*)><v>([^<]*)<\/v><\/c>/g)) {
    addCell(match[1], match[2]);
  }
  for (const match of sheetXml.matchAll(/<c\b([^>]*)\bt="inlineStr"([^>]*)><is>([\s\S]*?)<\/is><\/c>/g)) {
    const inline = [...match[3].matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>/g)].map((item) => item[1]).join("");
    addCell(`${match[1]} t="inlineStr" ${match[2]}`, inline, true);
  }
  const headerEntry = [...cells].find(([, values]) => Object.values(values).some((value) => normalizeHeader(value) === "no asset"));
  if (!headerEntry) throw new Error("Header 'No Asset' tidak ditemukan");
  const [headerRow, headers] = headerEntry;
  const headerColumns = new Map(Object.entries(headers).map(([column, value]) => [normalizeHeader(value), column]));
  const column = (names: string[], fallback: string) => names.map((name) => headerColumns.get(name)).find(Boolean) ?? fallback;
  const documentationColumnName = column(["dokumentasi", "documentation"], "M");
  const imagesByRow = workbookImages(archive, columnNumber(documentationColumnName));
  const rows: WorkbookAssetRow[] = [];
  const errors: WorkbookResult["errors"] = [];
  const value = (data: Record<string, string>, names: string[], fallback: string) => data[column(names, fallback)] ?? "";
  for (const [row, data] of [...cells].sort((a, b) => a[0] - b[0])) {
    if (row <= headerRow) continue;
    const assetNumber = value(data, ["no asset"], "B");
    if (!assetNumber) continue;
    const assetCode = value(data, ["kode aset"], "D");
    const description = value(data, ["asset description", "deskripsi"], "F");
    const acquisitionValue = Number(value(data, ["acquis.val.", "acquisition value"], "G") || 0);
    const bookValue = Number(value(data, ["book val.", "book value"], "H") || 0);
    const quantity = Number(value(data, ["quantity"], "I") || 0);
    const statusValue = value(data, ["status aset", "maintenance"], "O") || "Active";
    if (!assetCode || !description) { errors.push({ row, message: "Kode Aset atau Asset Description kosong" }); continue; }
    if (![acquisitionValue, bookValue, quantity].every(Number.isFinite) || quantity < 0) { errors.push({ row, message: "Nilai finansial/quantity tidak valid" }); continue; }
    if (!ASSET_STATUSES.includes(statusValue as AssetStatus)) { errors.push({ row, message: `Status Aset tidak valid: ${statusValue}` }); continue; }
    const coordinateText = value(data, ["koordinat", "coordinate", "coordinates"], "Q");
    const coordinate = parseCoordinateText(coordinateText);
    rows.push({ row, assetNumber, capitalizedOn: value(data, ["capitalized on"], "C") ? excelDate(value(data, ["capitalized on"], "C")) : null, assetCode, assetClass: value(data, ["class asset", "class aset"], "E"), description, acquisitionValue, bookValue, quantity, unit: value(data, ["base unit of measure", "unit"], "J"), location: value(data, ["location", "lokasi"], "K"), subAsset: value(data, ["sub asset"], "L"), documentation: value(data, ["dokumentasi", "documentation"], "M"), layoutLocation: value(data, ["lokasi / layout"], "N"), maintenanceStatus: statusValue as AssetStatus, usageFrequency: value(data, ["frekuensi pemakaian"], "P"), coordinateText, ...coordinate, documentationImages: imagesByRow.get(row) ?? [] });
  }
  return { rows, errors, headers, imageCount: rows.reduce((count, row) => count + row.documentationImages.length, 0) };
}
