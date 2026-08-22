import { z } from "zod";

const contentTypes = ["application/dxf", "application/x-dxf", "image/vnd.dxf", "application/octet-stream"] as const;

export const dxfUploadSchema = z.object({
  documentId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(240)
    .refine((value) => value.toLowerCase().endsWith(".dxf")),
  contentType: z.enum(contentTypes).default("application/octet-stream"),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(250 * 1024 * 1024),
  siteId: z.string().uuid().nullable().optional(),
  buildingId: z.string().uuid().nullable().optional(),
  floorId: z.string().uuid().nullable().optional(),
  changeNote: z.string().trim().max(500).nullable().optional(),
});

export const dxfConfirmSchema = z.object({ objectKey: z.string().min(1) });

export const controlPointSchema = z.object({
  local: z.object({ x: z.number().finite(), y: z.number().finite() }),
  world: z.object({ longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) }),
});

export const georeferenceSchema = z.object({
  controlPoints: z.array(controlPointSchema).min(2).max(20),
  transformMode: z.enum(["similarity", "affine"]).default("similarity"),
  maximumResidualMeters: z.number().positive().max(1000).default(5),
});

export const manualGeoreferenceSchema = z.object({
  method: z.literal("manual"),
  transform: z.object({
    origin: z.object({ longitude: z.number().min(-180).max(180), latitude: z.number().min(-90).max(90) }),
    localOrigin: z.object({ x: z.number().finite(), y: z.number().finite() }),
    metersPerUnit: z.number().positive().max(1_000_000),
    rotationDegrees: z.number().finite().min(-3600).max(3600),
  }),
});

export const georeferenceRequestSchema = z.union([manualGeoreferenceSchema, georeferenceSchema]);

export const publishDxfSchema = z.object({ versionId: z.string().uuid() });

export const dxfLayerSchema = z.object({
  layers: z.array(
    z.object({
      name: z.string().min(1).max(255),
      visible: z.boolean().optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .nullable()
        .optional(),
      opacity: z.number().min(0).max(1).optional(),
      sortOrder: z.number().int().min(0).optional(),
    }),
  ),
});

const point = z.object({ x: z.number().finite(), y: z.number().finite() });
const editorEntity = z.object({
  id: z.string().min(1).max(160),
  type: z.enum(["LINE", "LWPOLYLINE", "CIRCLE", "ARC", "TEXT"]),
  layer: z.string().trim().min(1).max(255),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  lineType: z.string().trim().min(1).max(80).optional(),
  points: z.array(point).max(10_000).optional(),
  center: point.optional(),
  radius: z.number().positive().finite().optional(),
  startAngle: z.number().finite().optional(),
  endAngle: z.number().finite().optional(),
  text: z.string().max(2_000).optional(),
  height: z.number().positive().finite().optional(),
});
export const editorSnapshotSchema = z.object({
  patches: z.record(z.string().min(1).max(160), editorEntity.nullable()).refine((value) => Object.keys(value).length <= 25_000),
});
export const createEditSessionSchema = z.object({ baseVersionId: z.string().uuid(), changeNote: z.string().trim().max(500).nullable().optional() });
export const saveEditSessionSchema = z.object({ version: z.number().int().positive(), snapshot: editorSnapshotSchema, changeNote: z.string().trim().max(500).nullable().optional() });
export const exportEditSessionSchema = z.object({ changeNote: z.string().trim().min(1).max(500) });
