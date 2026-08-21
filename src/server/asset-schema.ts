import { z } from "zod";
import { ASSET_STATUSES } from "@/lib/asset-status";

const nullableNumber = z.number().finite().nullable().optional();
const worldPointSchema = z.object({
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
});
export const assetInputSchema = z.object({
  assetNumber: z.string().trim().min(1).max(80),
  capitalizedOn: z.string().date().nullable().optional(),
  assetCode: z.string().trim().min(1).max(80),
  assetClassId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  description: z.string().trim().min(1).max(1000),
  acquisitionValue: z.number().nonnegative().default(0),
  bookValue: z.number().nonnegative().default(0),
  currencyCode: z.string().length(3).default("IDR"),
  quantity: z.number().nonnegative().default(1),
  unitId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  parentAssetId: z.string().uuid().nullable().optional(),
  subAsset: z.string().nullable().optional(),
  documentationNote: z.string().nullable().optional(),
  layoutLocation: z.string().nullable().optional(),
  usageFrequencyId: z.string().uuid().nullable().optional(),
  layoutReference: z.string().nullable().optional(),
  maintenanceStatus: z.enum(ASSET_STATUSES).default("Active"),
  condition: z.string().nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  altitude: nullableNumber,
  coordinateText: z.string().trim().max(500).nullable().optional(),
  polygon: z.array(worldPointSchema).min(3).max(500).nullable().optional(),
  dxfDocumentId: z.string().uuid().nullable().optional(),
  floorId: z.string().uuid().nullable().optional(),
  localX: nullableNumber,
  localY: nullableNumber,
  localZ: nullableNumber,
});
export const assetPatchSchema = assetInputSchema.partial().extend({ version: z.number().int().positive() });

export const assetListSchema = z.object({
  q: z.string().trim().max(200).default(""),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(ASSET_STATUSES).optional(),
  classId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  usageFrequencyId: z.string().uuid().optional(),
  sort: z
    .enum(["no", "assetNumber", "assetCode", "description", "capitalizedOn", "bookValue", "updatedAt"])
    .default("assetNumber"),
  order: z.enum(["asc", "desc"]).default("asc"),
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .optional(),
});
