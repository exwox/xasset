import type { DxfSegment, LocalPoint } from "./types";

interface Entity {
  type?: string;
  layer?: string;
  vertices?: LocalPoint[];
  controlPoints?: LocalPoint[];
  center?: LocalPoint;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  angle?: number;
  name?: string;
  position?: LocalPoint;
  xScale?: number;
  yScale?: number;
  rotation?: number;
}

interface Drawing {
  entities?: Entity[];
  blocks?: Record<string, { entities?: Entity[]; position?: LocalPoint }>;
  header?: Record<string, unknown>;
  tables?: { layer?: { layers?: Record<string, { color?: number; colorIndex?: number }> } };
}

export interface DxfBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface NormalizedDxf {
  schemaVersion: 1;
  unit: string;
  bounds: DxfBounds;
  entityCount: number;
  supportedEntityCount: number;
  totalSegmentCount: number;
  truncated: boolean;
  entityCounts: Record<string, number>;
  unsupportedEntityCounts: Record<string, number>;
  layers: Array<{ name: string; color: string | null; entityCount: number }>;
  segments: DxfSegment[];
}

export type CompactDxfSegment = [
  id: string,
  layerIndex: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
];

export interface CompactDxfJson extends Omit<NormalizedDxf, "schemaVersion" | "segments"> {
  schemaVersion: 2;
  segmentFormat: "id-layer-x1-y1-x2-y2";
  segmentLayers: string[];
  segments: CompactDxfSegment[];
}

const units: Record<number, string> = {
  0: "unitless",
  1: "inch",
  2: "foot",
  4: "millimeter",
  5: "centimeter",
  6: "meter",
};

export const DXF_OVERVIEW_SEGMENT_LIMIT = 100_000;
export const DXF_PREVIEW_SEGMENT_LIMIT = 100_000;

function isPoint(value: unknown): value is LocalPoint {
  const point = value as LocalPoint;
  return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function lineSegments(points: LocalPoint[], layer: string, close = false) {
  const output: DxfSegment[] = [];
  for (let index = 1; index < points.length; index += 1)
    output.push({ start: points[index - 1], end: points[index], layer });
  if (close && points.length > 2) output.push({ start: points.at(-1)!, end: points[0], layer });
  return output;
}

function arcSegments(entity: Entity, layer: string): DxfSegment[] {
  if (!isPoint(entity.center) || !Number.isFinite(entity.radius) || Number(entity.radius) <= 0) return [];
  const circle = entity.type === "CIRCLE";
  const start = circle ? 0 : Number(entity.startAngle ?? 0);
  let end = circle ? Math.PI * 2 : Number(entity.endAngle ?? start);
  if (end < start) end += Math.PI * 2;
  const count = Math.max(12, Math.min(72, Math.ceil(((end - start) / (Math.PI * 2)) * 48)));
  const points = Array.from({ length: count + 1 }, (_, index) => {
    const angle = start + ((end - start) * index) / count;
    return {
      x: entity.center!.x + Math.cos(angle) * Number(entity.radius),
      y: entity.center!.y + Math.sin(angle) * Number(entity.radius),
    };
  });
  return lineSegments(points, layer);
}

export function colorFromDxfLayer(layer?: { color?: number; colorIndex?: number }) {
  // dxf-parser resolves ACI into a 24-bit RGB integer in `color`.
  if (Number.isInteger(layer?.color) && layer!.color! >= 0 && layer!.color! <= 0xffffff)
    return `#${layer!.color!.toString(16).padStart(6, "0")}`;

  // Fallback for drawings/parsers that only expose the seven basic ACI values.
  const aci: Record<number, string> = {
    1: "#ff0000",
    2: "#ffff00",
    3: "#00ff00",
    4: "#00ffff",
    5: "#0000ff",
    6: "#ff00ff",
    7: "#ffffff",
  };
  return layer?.colorIndex == null ? null : (aci[Math.abs(layer.colorIndex)] ?? null);
}

function entitySegments(entity: Entity, layer: string) {
  const type = entity.type ?? "UNKNOWN";
  if (type === "LINE" && Array.isArray(entity.vertices)) return lineSegments(entity.vertices.filter(isPoint), layer);
  if ((type === "LWPOLYLINE" || type === "POLYLINE") && Array.isArray(entity.vertices))
    return lineSegments(
      entity.vertices.filter(isPoint),
      layer,
      Boolean((entity as Entity & { shape?: boolean }).shape),
    );
  if (type === "ARC" || type === "CIRCLE") return arcSegments(entity, layer);
  if (type === "SPLINE" && Array.isArray(entity.controlPoints))
    return lineSegments(entity.controlPoints.filter(isPoint), layer);
  return [];
}

function transformInsert(segments: DxfSegment[], entity: Entity, blockOrigin: LocalPoint = { x: 0, y: 0 }) {
  const position = isPoint(entity.position) ? entity.position : { x: 0, y: 0 };
  const scaleX = Number.isFinite(entity.xScale) ? Number(entity.xScale) : 1;
  const scaleY = Number.isFinite(entity.yScale) ? Number(entity.yScale) : 1;
  const angle = (Number(entity.rotation ?? 0) * Math.PI) / 180;
  const transform = (point: LocalPoint) => {
    const x = (point.x - blockOrigin.x) * scaleX;
    const y = (point.y - blockOrigin.y) * scaleY;
    return {
      x: position.x + x * Math.cos(angle) - y * Math.sin(angle),
      y: position.y + x * Math.sin(angle) + y * Math.cos(angle),
    };
  };
  return segments.map((segment) => ({ ...segment, start: transform(segment.start), end: transform(segment.end) }));
}

export function normalizeDxfDrawing(drawing: Drawing, maxSegments = 400_000): NormalizedDxf {
  const segments: DxfSegment[] = [];
  const entityCounts: Record<string, number> = {};
  const unsupportedEntityCounts: Record<string, number> = {};
  const layerCounts = new Map<string, number>();
  let supportedEntityCount = 0;
  let totalSegmentCount = 0;

  for (const [entityIndex, entity] of (drawing.entities ?? []).entries()) {
    const type = entity.type ?? "UNKNOWN";
    const layer = entity.layer || "0";
    entityCounts[type] = (entityCounts[type] ?? 0) + 1;
    let normalized = entitySegments(entity, layer);
    if (type === "INSERT" && entity.name && drawing.blocks?.[entity.name]?.entities) {
      normalized = transformInsert(
        drawing.blocks[entity.name].entities!.flatMap((child) =>
          entitySegments(child, child.layer && child.layer !== "0" ? child.layer : layer),
        ),
        entity,
        drawing.blocks[entity.name].position,
      );
    }
    if (normalized.length) {
      normalized = normalized.map((segment, segmentIndex) => ({
        ...segment,
        id: `e${entityIndex}:s${segmentIndex}`,
      }));
      supportedEntityCount += 1;
      totalSegmentCount += normalized.length;
      for (const normalizedLayer of new Set(normalized.map((segment) => segment.layer)))
        layerCounts.set(normalizedLayer, (layerCounts.get(normalizedLayer) ?? 0) + 1);
      const remaining = maxSegments - segments.length;
      if (remaining > 0) segments.push(...normalized.slice(0, remaining));
    } else {
      unsupportedEntityCounts[type] = (unsupportedEntityCounts[type] ?? 0) + 1;
    }
  }

  const coordinates = segments.flatMap((segment) => [segment.start, segment.end]);
  const bounds = coordinates.reduce<DxfBounds>(
    (result, point) => ({
      minX: Math.min(result.minX, point.x),
      minY: Math.min(result.minY, point.y),
      maxX: Math.max(result.maxX, point.x),
      maxY: Math.max(result.maxY, point.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  if (!coordinates.length) Object.assign(bounds, { minX: 0, minY: 0, maxX: 0, maxY: 0 });
  const layerDefinitions = drawing.tables?.layer?.layers ?? {};
  const layers = [...layerCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, entityCount]) => ({
      name,
      entityCount,
      color: colorFromDxfLayer(layerDefinitions[name]),
    }));
  const unitCode = Number(drawing.header?.$INSUNITS ?? 0);
  return {
    schemaVersion: 1,
    unit: units[unitCode] ?? `code-${unitCode}`,
    bounds,
    entityCount: drawing.entities?.length ?? 0,
    supportedEntityCount,
    totalSegmentCount,
    truncated: totalSegmentCount > segments.length,
    entityCounts,
    unsupportedEntityCounts,
    layers,
    segments,
  };
}

export function createDxfPreviewSvg(dxf: NormalizedDxf, maximumSegments = DXF_PREVIEW_SEGMENT_LIMIT) {
  const width = Math.max(1, dxf.bounds.maxX - dxf.bounds.minX);
  const height = Math.max(1, dxf.bounds.maxY - dxf.bounds.minY);
  const stride = Math.max(1, Math.ceil(dxf.segments.length / maximumSegments));
  const path = dxf.segments
    .filter((_, index) => index % stride === 0)
    .map(({ start, end }) => `M${start.x} ${-start.y}L${end.x} ${-end.y}`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${dxf.bounds.minX} ${-dxf.bounds.maxY} ${width} ${height}" width="1200" height="800"><rect x="${dxf.bounds.minX}" y="${-dxf.bounds.maxY}" width="${width}" height="${height}" fill="#07111d"/><path d="${path}" fill="none" stroke="#5eead4" stroke-width="0.7" vector-effect="non-scaling-stroke"/></svg>`;
}

export function createOverview(
  dxf: NormalizedDxf,
  maximumSegments = DXF_OVERVIEW_SEGMENT_LIMIT,
): NormalizedDxf {
  if (dxf.segments.length <= maximumSegments) return dxf;
  const stride = Math.ceil(dxf.segments.length / maximumSegments);
  return { ...dxf, segments: dxf.segments.filter((_, index) => index % stride === 0) };
}

/**
 * Converts the verbose in-memory geometry into the persisted/API JSON format.
 * Layer names are stored once and points use tuples so large drawings do not
 * repeat object keys and layer strings for every segment.
 */
export function serializeDxfJson(dxf: NormalizedDxf): CompactDxfJson {
  const segmentLayers = dxf.layers.map((layer) => layer.name);
  const layerIndexes = new Map(segmentLayers.map((name, index) => [name, index]));

  for (const segment of dxf.segments) {
    if (!layerIndexes.has(segment.layer)) {
      layerIndexes.set(segment.layer, segmentLayers.length);
      segmentLayers.push(segment.layer);
    }
  }

  return {
    ...dxf,
    schemaVersion: 2,
    segmentFormat: "id-layer-x1-y1-x2-y2",
    segmentLayers,
    segments: dxf.segments.map((segment) => [
      segment.id ?? "",
      layerIndexes.get(segment.layer)!,
      segment.start.x,
      segment.start.y,
      segment.end.x,
      segment.end.y,
    ]),
  };
}

/** Reads both the new compact JSON and schema v1 artifacts already in storage. */
export function decodeDxfSegments(value: unknown): DxfSegment[] {
  const data = value as Partial<CompactDxfJson> & { segments?: unknown[] };
  if (data.schemaVersion !== 2 || data.segmentFormat !== "id-layer-x1-y1-x2-y2") {
    return (data.segments ?? []) as DxfSegment[];
  }

  const layers = Array.isArray(data.segmentLayers) ? data.segmentLayers : [];
  return (data.segments ?? []).flatMap((item) => {
    if (!Array.isArray(item) || item.length !== 6) return [];
    const [id, layerIndex, startX, startY, endX, endY] = item;
    const layer = layers[Number(layerIndex)];
    if (
      typeof id !== "string" ||
      typeof layer !== "string" ||
      ![startX, startY, endX, endY].every((coordinate) => Number.isFinite(coordinate))
    )
      return [];
    return [
      {
        ...(id ? { id } : {}),
        layer,
        start: { x: Number(startX), y: Number(startY) },
        end: { x: Number(endX), y: Number(endY) },
      },
    ];
  });
}

export function deserializeDxfJson(value: unknown): NormalizedDxf {
  const data = value as NormalizedDxf | CompactDxfJson;
  return { ...data, schemaVersion: 1, segments: decodeDxfSegments(data) };
}
