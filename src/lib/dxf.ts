import DxfParser from "dxf-parser";
import type { DxfSegment, LocalPoint } from "./types";

function point(value: { x: number; y: number }): LocalPoint { return { x: value.x, y: value.y }; }

export function parseDxf(text: string): DxfSegment[] {
  const drawing = new DxfParser().parseSync(text);
  const segments: DxfSegment[] = [];
  for (const entity of drawing?.entities ?? []) {
    if (entity.type === "LINE" && "vertices" in entity && Array.isArray(entity.vertices)) {
      const vertices = entity.vertices as Array<{ x: number; y: number }>;
      if (vertices.length >= 2) segments.push({ start: point(vertices[0]), end: point(vertices[1]), layer: entity.layer ?? "0" });
    }
    if ((entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") && "vertices" in entity && Array.isArray(entity.vertices)) {
      const vertices = entity.vertices as Array<{ x: number; y: number }>;
      for (let index = 1; index < vertices.length; index += 1) {
        segments.push({ start: point(vertices[index - 1]), end: point(vertices[index]), layer: entity.layer ?? "0" });
      }
      if ((entity as { shape?: boolean }).shape && vertices.length > 2) segments.push({ start: point(vertices.at(-1)!), end: point(vertices[0]), layer: entity.layer ?? "0" });
    }
  }
  return segments;
}
