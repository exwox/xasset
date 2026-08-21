import type { PoolClient } from "pg";
import { query, transaction } from "./db";
import type { Session } from "./auth";
import type { z } from "zod";
import type { assetInputSchema, assetListSchema, assetPatchSchema } from "./asset-schema";

type AssetInput = z.infer<typeof assetInputSchema>;
type AssetPatch = z.infer<typeof assetPatchSchema>;
type AssetList = z.infer<typeof assetListSchema>;
const maintenanceStatusSql = "a.maintenance_status";
const select = `SELECT a.id,a.directory_no::int "no",a.asset_number "assetNumber",a.capitalized_on "capitalizedOn",a.asset_code "assetCode",a.asset_description description,
  a.acquisition_value "acquisitionValue",a.book_value "bookValue",a.currency_code "currencyCode",a.quantity,${maintenanceStatusSql} maintenance,
  a.documentation_note "documentationNote",a.layout_location layout,a.layout_reference "layoutReference",a.coordinate_text "coordinateText",a.polygon,
  a.sub_asset_text "subAsset",
  a.longitude,a.latitude,a.altitude,a.local_x "localX",a.local_y "localY",a.local_z "localZ",
  a.dxf_document_id "dxfDocumentId",a.floor_id "floorId",a.version,a.created_at "createdAt",a.updated_at "updatedAt",
  ac.name "assetClass",ac.id "assetClassId",u.code unit,u.id "unitId",l.name location,l.id "locationId",
  pa.asset_number "parentAssetNumber",pa.id "parentAssetId",uf.name "usageFrequency",uf.id "usageFrequencyId",
  (SELECT count(*)::int FROM asset_documents ad WHERE ad.asset_id=a.id AND ad.archived_at IS NULL) "documentationCount",
  (SELECT ad.id FROM asset_documents ad WHERE ad.asset_id=a.id AND ad.archived_at IS NULL AND ad.document_type='photo' AND ad.content_type IN ('image/jpeg','image/png','image/webp') ORDER BY ad.created_at DESC LIMIT 1) "photoDocumentId"
  FROM assets a LEFT JOIN asset_classes ac ON ac.id=a.asset_class_id LEFT JOIN units_of_measure u ON u.id=a.unit_id
  LEFT JOIN locations l ON l.id=a.location_id LEFT JOIN assets pa ON pa.id=a.parent_asset_id LEFT JOIN usage_frequencies uf ON uf.id=a.usage_frequency_id`;

export async function listAssets(input: AssetList) {
  const values: unknown[] = [];
  const where = ["a.archived_at IS NULL"];
  if (input.q) {
    values.push(`%${input.q}%`);
    where.push(
      `(a.directory_no::text ILIKE $${values.length} OR a.asset_number ILIKE $${values.length} OR a.asset_code ILIKE $${values.length} OR a.asset_description ILIKE $${values.length} OR ac.name ILIKE $${values.length} OR l.name ILIKE $${values.length})`,
    );
  }
  if (input.status) {
    values.push(input.status);
    where.push(`${maintenanceStatusSql}=$${values.length}`);
  }
  if (input.classId) {
    values.push(input.classId);
    where.push(`a.asset_class_id=$${values.length}`);
  }
  if (input.locationId) {
    values.push(input.locationId);
    where.push(`a.location_id=$${values.length}`);
  }
  if (input.usageFrequencyId) {
    values.push(input.usageFrequencyId);
    where.push(`a.usage_frequency_id=$${values.length}`);
  }
  if (input.bbox) {
    const [west, south, east, north] = input.bbox.split(",").map(Number);
    if (west < east && south < north && west >= -180 && east <= 180 && south >= -90 && north <= 90) {
      values.push(west, south, east, north);
      where.push(
        `a.longitude IS NOT NULL AND a.latitude IS NOT NULL AND ST_Intersects(ST_SetSRID(ST_MakePoint(a.longitude,a.latitude),4326),ST_MakeEnvelope($${values.length - 3},$${values.length - 2},$${values.length - 1},$${values.length},4326))`,
      );
    }
  }
  const sort = {
    no: "a.directory_no",
    assetNumber: "a.asset_number",
    assetCode: "a.asset_code",
    description: "a.asset_description",
    capitalizedOn: "a.capitalized_on",
    bookValue: "a.book_value",
    updatedAt: "a.updated_at",
  }[input.sort];
  const count = await query<{ count: number }>(
    `SELECT count(*)::int count FROM assets a LEFT JOIN asset_classes ac ON ac.id=a.asset_class_id LEFT JOIN locations l ON l.id=a.location_id WHERE ${where.join(" AND ")}`,
    values,
  );
  values.push(input.pageSize, (input.page - 1) * input.pageSize);
  const rows = await query(
    `${select} WHERE ${where.join(" AND ")} ORDER BY ${sort} ${input.order === "desc" ? "DESC" : "ASC"} NULLS LAST LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return {
    data: rows.rows,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: count.rows[0]?.count ?? 0,
      pages: Math.ceil((count.rows[0]?.count ?? 0) / input.pageSize),
    },
  };
}
export async function getAsset(id: string) {
  return (await query(`${select} WHERE a.id=$1 AND a.archived_at IS NULL`, [id])).rows[0] ?? null;
}

function columns(input: Partial<AssetInput>) {
  const mapping: Record<string, string> = {
    assetNumber: "asset_number",
    capitalizedOn: "capitalized_on",
    assetCode: "asset_code",
    assetClassId: "asset_class_id",
    categoryId: "category_id",
    description: "asset_description",
    acquisitionValue: "acquisition_value",
    bookValue: "book_value",
    currencyCode: "currency_code",
    quantity: "quantity",
    unitId: "unit_id",
    locationId: "location_id",
    parentAssetId: "parent_asset_id",
    subAsset: "sub_asset_text",
    documentationNote: "documentation_note",
    layoutLocation: "layout_location",
    usageFrequencyId: "usage_frequency_id",
    layoutReference: "layout_reference",
    maintenanceStatus: "maintenance_status",
    condition: "condition",
    longitude: "longitude",
    latitude: "latitude",
    altitude: "altitude",
    coordinateText: "coordinate_text",
    polygon: "polygon",
    dxfDocumentId: "dxf_document_id",
    floorId: "floor_id",
    localX: "local_x",
    localY: "local_y",
    localZ: "local_z",
  };
  return Object.entries(input)
    .filter(([key]) => key in mapping)
    .map(([key, value]) => ({
      column: mapping[key],
      value: key === "polygon" && value != null ? JSON.stringify(value) : value,
    }));
}
export async function createAsset(input: AssetInput, actor: Session) {
  const entries = columns(input);
  entries.push({ column: "created_by", value: actor.userId }, { column: "updated_by", value: actor.userId });
  const result = await query<{ id: string }>(
    `INSERT INTO assets(${entries.map((item) => item.column).join(",")}) VALUES(${entries.map((_, index) => `$${index + 1}`).join(",")}) RETURNING id`,
    entries.map((item) => item.value),
  );
  return getAsset(result.rows[0].id);
}
export async function updateAsset(id: string, input: AssetPatch, actor: Session) {
  const { version, ...changes } = input;
  const entries = columns(changes);
  entries.push({ column: "updated_by", value: actor.userId });
  const result = await transaction(async (client: PoolClient) => {
    const before = await client.query(`SELECT * FROM assets WHERE id=$1 AND archived_at IS NULL FOR UPDATE`, [id]);
    if (!before.rows[0]) return { state: "missing" as const };
    if (before.rows[0].version !== version)
      return { state: "conflict" as const, currentVersion: before.rows[0].version };
    const values = entries.map((item) => item.value);
    values.push(id, version);
    await client.query(
      `UPDATE assets SET ${entries.map((item, index) => `${item.column}=$${index + 1}`).join(",")},version=version+1,updated_at=now() WHERE id=$${values.length - 1} AND version=$${values.length}`,
      values,
    );
    const after = (await client.query(`SELECT * FROM assets WHERE id=$1`, [id])).rows[0];
    await client.query(
      `INSERT INTO audit_logs(actor_user_id,action,resource_type,resource_id,before_data,after_data) VALUES($1,'asset.update','asset',$2,$3,$4)`,
      [actor.userId, id, before.rows[0], after],
    );
    return { state: "updated" as const };
  });
  return result.state === "updated" ? { ...result, asset: await getAsset(id) } : result;
}
export async function archiveAsset(id: string, actor: Session) {
  const result = await query(
    `UPDATE assets SET archived_at=now(),updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1 AND archived_at IS NULL RETURNING id`,
    [id, actor.userId],
  );
  return result.rowCount === 1;
}
export async function archiveAllAssets(actor: Session) {
  const result = await query(
    `UPDATE assets SET archived_at=now(),updated_by=$1,updated_at=now(),version=version+1 WHERE archived_at IS NULL RETURNING id`,
    [actor.userId],
  );
  return result.rowCount ?? 0;
}
