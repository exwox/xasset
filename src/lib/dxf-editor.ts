import type { DxfSegment, LocalPoint } from "./types";

export type EditorEntityType = "LINE" | "LWPOLYLINE" | "CIRCLE" | "ARC" | "TEXT";
export interface EditorEntity {
  id: string;
  type: EditorEntityType;
  layer: string;
  color?: string | null;
  lineType?: string;
  points?: LocalPoint[];
  center?: LocalPoint;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  text?: string;
  height?: number;
}
export interface EditorSnapshot { patches: Record<string, EditorEntity | null> }
export type SnapKind = "endpoint" | "midpoint" | "intersection" | "grid";
export interface SnapResult { point: LocalPoint; kind: SnapKind; entityIds?: string[]; distance: number }

const finitePoint = (point: LocalPoint | undefined): point is LocalPoint =>
  Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y));

export function segmentsToEditorEntities(segments: DxfSegment[]): EditorEntity[] {
  return segments.map((segment, index) => ({
    id: segment.id ?? `segment:${index}`,
    type: "LINE",
    layer: segment.layer || "0",
    points: [segment.start, segment.end],
  }));
}

export function applyEditorSnapshot(base: EditorEntity[], snapshot: EditorSnapshot): EditorEntity[] {
  const entities = new Map(base.map((entity) => [entity.id, entity]));
  for (const [id, patch] of Object.entries(snapshot.patches)) {
    if (patch === null) entities.delete(id);
    else entities.set(id, { ...patch, id });
  }
  return [...entities.values()];
}

export function orderEditorEntitiesForExport(entities: EditorEntity[]) {
  return [...entities].sort((left, right) => Number(!left.id.startsWith("new:")) - Number(!right.id.startsWith("new:")));
}

export function validateEditorEntity(entity: EditorEntity): string[] {
  const errors: string[] = [];
  if (!entity.id) errors.push("ID entitas wajib diisi");
  if (!entity.layer.trim()) errors.push("Layer wajib diisi");
  if (entity.type === "LINE" && (entity.points?.length !== 2 || !entity.points.every(finitePoint)))
    errors.push("LINE harus memiliki dua titik valid");
  if (entity.type === "LWPOLYLINE" && ((entity.points?.length ?? 0) < 2 || !entity.points?.every(finitePoint)))
    errors.push("LWPOLYLINE harus memiliki minimal dua titik valid");
  if ((entity.type === "CIRCLE" || entity.type === "ARC") && (!finitePoint(entity.center) || !(Number(entity.radius) > 0)))
    errors.push(`${entity.type} harus memiliki center dan radius positif`);
  if (entity.type === "ARC" && (!Number.isFinite(entity.startAngle) || !Number.isFinite(entity.endAngle)))
    errors.push("ARC harus memiliki sudut awal dan akhir");
  if (entity.type === "TEXT" && (!finitePoint(entity.points?.[0]) || !entity.text?.trim() || !(Number(entity.height) > 0)))
    errors.push("TEXT harus memiliki posisi, isi, dan tinggi positif");
  return errors;
}

export function validateEditorEntities(entities: EditorEntity[]) {
  return entities.flatMap((entity) => validateEditorEntity(entity).map((message) => ({ id: entity.id, message })));
}

const distance = (a: LocalPoint, b: LocalPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: LocalPoint, b: LocalPoint): LocalPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

function linePairs(entity: EditorEntity): Array<[LocalPoint, LocalPoint]> {
  const points = entity.points ?? [];
  return points.slice(1).map((point, index) => [points[index], point]);
}

function intersection(a: [LocalPoint, LocalPoint], b: [LocalPoint, LocalPoint]): LocalPoint | null {
  const [p1, p2] = a, [p3, p4] = b;
  const denominator = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(denominator) < 1e-12) return null;
  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denominator;
  const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
}

export function findSnap(point: LocalPoint, entities: EditorEntity[], tolerance: number, gridSize = 1): SnapResult | null {
  const candidates: SnapResult[] = [];
  for (const entity of entities) for (const [start, end] of linePairs(entity)) {
    for (const candidate of [start, end]) candidates.push({ point: candidate, kind: "endpoint", entityIds: [entity.id], distance: distance(point, candidate) });
    const middle = midpoint(start, end);
    candidates.push({ point: middle, kind: "midpoint", entityIds: [entity.id], distance: distance(point, middle) });
  }
  for (let left = 0; left < entities.length; left += 1) for (let right = left + 1; right < entities.length; right += 1)
    for (const a of linePairs(entities[left])) for (const b of linePairs(entities[right])) {
      const result = intersection(a, b);
      if (result) candidates.push({ point: result, kind: "intersection", entityIds: [entities[left].id, entities[right].id], distance: distance(point, result) });
    }
  const grid = { x: Math.round(point.x / gridSize) * gridSize, y: Math.round(point.y / gridSize) * gridSize };
  candidates.push({ point: grid, kind: "grid", distance: distance(point, grid) });
  return candidates.filter((candidate) => candidate.distance <= tolerance).sort((a, b) => a.distance - b.distance)[0] ?? null;
}

function mapPoints(entity: EditorEntity, operation: (point: LocalPoint) => LocalPoint): EditorEntity {
  return { ...entity, points: entity.points?.map(operation), center: entity.center ? operation(entity.center) : undefined };
}
export const moveEntity = (entity: EditorEntity, dx: number, dy: number) => mapPoints(entity, (point) => ({ x: point.x + dx, y: point.y + dy }));
export function rotateEntity(entity: EditorEntity, degrees: number, origin: LocalPoint = { x: 0, y: 0 }) {
  const angle = degrees * Math.PI / 180;
  return mapPoints(entity, (point) => ({ x: origin.x + (point.x-origin.x)*Math.cos(angle)-(point.y-origin.y)*Math.sin(angle), y: origin.y + (point.x-origin.x)*Math.sin(angle)+(point.y-origin.y)*Math.cos(angle) }));
}
export function scaleEntity(entity: EditorEntity, factor: number, origin: LocalPoint = { x: 0, y: 0 }) {
  const scaled = mapPoints(entity, (point) => ({ x: origin.x + (point.x-origin.x)*factor, y: origin.y + (point.y-origin.y)*factor }));
  return scaled.radius == null ? scaled : { ...scaled, radius: Math.abs(scaled.radius * factor) };
}

const pair = (code: number, value: string | number) => `${code}\n${value}\n`;
export function exportEditorDxf(entities: EditorEntity[], unit = "meter") {
  const errors = validateEditorEntities(entities);
  if (errors.length) throw new Error(errors.map((error) => `${error.id}: ${error.message}`).join("; "));
  const unitCode: Record<string, number> = { unitless: 0, inch: 1, foot: 2, millimeter: 4, centimeter: 5, meter: 6 };
  let output = pair(0,"SECTION")+pair(2,"HEADER")+pair(9,"$ACADVER")+pair(1,"AC1015")+pair(9,"$INSUNITS")+pair(70,unitCode[unit] ?? 0)+pair(0,"ENDSEC");
  output += pair(0,"SECTION")+pair(2,"ENTITIES");
  for (const entity of entities) {
    output += pair(0,entity.type)+pair(8,entity.layer)+pair(6,entity.lineType ?? "CONTINUOUS");
    if (entity.type === "LINE") output += pair(10,entity.points![0].x)+pair(20,entity.points![0].y)+pair(11,entity.points![1].x)+pair(21,entity.points![1].y);
    if (entity.type === "LWPOLYLINE") {
      output += pair(90,entity.points!.length)+pair(70,0);
      for (const point of entity.points!) output += pair(10,point.x)+pair(20,point.y);
    }
    if (entity.type === "CIRCLE" || entity.type === "ARC") output += pair(10,entity.center!.x)+pair(20,entity.center!.y)+pair(40,entity.radius!);
    if (entity.type === "ARC") output += pair(50,entity.startAngle!)+pair(51,entity.endAngle!);
    if (entity.type === "TEXT") output += pair(10,entity.points![0].x)+pair(20,entity.points![0].y)+pair(40,entity.height!)+pair(1,entity.text!.replace(/[\r\n]/g," "));
  }
  return output+pair(0,"ENDSEC")+pair(0,"EOF");
}
