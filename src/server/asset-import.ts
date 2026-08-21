import { createHash } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { PoolClient } from "pg";
import type { Session } from "./auth";
import { transaction } from "./db";
import { config } from "./config";
import { storage } from "./storage";
import { validateFileSignature } from "./file-validation";
import type { WorkbookAssetRow } from "@/lib/xlsx-assets";

function code(value: string, fallback: string) {
  return (value || fallback).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80) || fallback;
}

async function named(client: PoolClient, table: string, itemCode: string, name: string) {
  return (await client.query<{ id: string }>(`INSERT INTO ${table}(code,name) VALUES($1,$2) ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [itemCode, name])).rows[0].id;
}

export async function importAssetRows(rows: WorkbookAssetRow[], actor: Session) {
  return transaction(async (client) => {
      const site = (await client.query<{ id: string; code: string }>(`SELECT id,code FROM sites ORDER BY active DESC,created_at LIMIT 1`)).rows[0];
      if (!site) throw new Error("Active site is missing");
      let imported = 0;
      let importedImages = 0;
      for (const row of rows) {
        const classId = await named(client, "asset_classes", code(row.assetClass, `CLASS_${row.assetCode}`), row.assetClass || `Class ${row.assetCode}`);
        const unitId = await named(client, "units_of_measure", code(row.unit, "UNIT"), row.unit || "Unit");
        const locationCode = code(row.location, `${site.code}_UNKNOWN`);
        const locationId = (await client.query<{ id: string }>(`INSERT INTO locations(site_id,code,name) VALUES($1,$2,$3) ON CONFLICT(site_id,code) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [site.id, locationCode, row.location || "Belum ditentukan"])).rows[0].id;
        let frequencyId: null | string = null;
        if (row.usageFrequency) frequencyId = await named(client, "usage_frequencies", code(row.usageFrequency, "UNKNOWN"), row.usageFrequency);
        const assetId = (await client.query<{ id: string }>(`INSERT INTO assets(asset_number,capitalized_on,asset_code,asset_class_id,asset_description,acquisition_value,book_value,quantity,unit_id,location_id,sub_asset_text,documentation_note,layout_location,maintenance_status,usage_frequency_id,coordinate_text,longitude,latitude,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19) ON CONFLICT(asset_number) DO UPDATE SET capitalized_on=EXCLUDED.capitalized_on,asset_code=EXCLUDED.asset_code,asset_class_id=EXCLUDED.asset_class_id,asset_description=EXCLUDED.asset_description,acquisition_value=EXCLUDED.acquisition_value,book_value=EXCLUDED.book_value,quantity=EXCLUDED.quantity,unit_id=EXCLUDED.unit_id,location_id=EXCLUDED.location_id,sub_asset_text=EXCLUDED.sub_asset_text,documentation_note=EXCLUDED.documentation_note,layout_location=EXCLUDED.layout_location,maintenance_status=EXCLUDED.maintenance_status,usage_frequency_id=EXCLUDED.usage_frequency_id,coordinate_text=EXCLUDED.coordinate_text,longitude=EXCLUDED.longitude,latitude=EXCLUDED.latitude,updated_by=EXCLUDED.updated_by,updated_at=now(),version=assets.version+1,archived_at=NULL RETURNING id`, [row.assetNumber, row.capitalizedOn, row.assetCode, classId, row.description, row.acquisitionValue, row.bookValue, row.quantity, unitId, locationId, row.subAsset || null, row.documentation || null, row.layoutLocation || null, row.maintenanceStatus, frequencyId, row.coordinateText || null, row.longitude, row.latitude, actor.userId])).rows[0].id;
        for (const image of row.documentationImages) {
          const signature = validateFileSignature(image.contentType, image.bytes);
          if (!signature.valid) throw new Error(`Gambar dokumentasi baris ${row.row} tidak valid: ${signature.reason}`);
          const extension = image.contentType === "image/jpeg" ? "jpg" : image.contentType.split("/")[1];
          const digest = createHash("sha256").update(image.bytes).digest("hex");
          const objectKey = `assets/${assetId}/imports/${digest}.${extension}`;
          await storage().send(new PutObjectCommand({ Bucket: config().S3_BUCKET, Key: objectKey, Body: image.bytes, ContentType: image.contentType }));
          await client.query(`INSERT INTO asset_documents(asset_id,file_name,object_key,content_type,size_bytes,document_type,description,uploaded_by) VALUES($1,$2,$3,$4,$5,'photo',$6,$7) ON CONFLICT(object_key) DO UPDATE SET archived_at=NULL,file_name=EXCLUDED.file_name,content_type=EXCLUDED.content_type,size_bytes=EXCLUDED.size_bytes,document_type='photo',description=EXCLUDED.description,uploaded_by=EXCLUDED.uploaded_by,created_at=now()`, [assetId, image.fileName, objectKey, image.contentType, image.bytes.byteLength, `Import Excel · baris ${row.row} · kolom Dokumentasi`, actor.userId]);
          importedImages += 1;
        }
        imported += 1;
      }
      await client.query(`INSERT INTO audit_logs(actor_user_id,action,resource_type,after_data) VALUES($1,'asset.bulk_import','asset_import',$2)`, [actor.userId, { imported, importedImages }]);
      return { imported, importedImages };
  });
}
