import { describe, expect, it } from "vitest";
import {
  createDxfPreviewSvg,
  createOverview,
  deserializeDxfJson,
  normalizeDxfDrawing,
  serializeDxfJson,
} from "./dxf-processing";

describe("DXF normalization", () => {
  const normalized = normalizeDxfDrawing({
    header: { $INSUNITS: 6 },
    tables: {
      layer: {
        layers: {
          WALL: { color: 0x00ff00, colorIndex: 3 },
          PIPE: { color: 0xff0000, colorIndex: 1 },
        },
      },
    },
    entities: [
      {
        type: "LINE",
        layer: "WALL",
        vertices: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      },
      {
        type: "LWPOLYLINE",
        layer: "PIPE",
        vertices: [
          { x: 2, y: 3 },
          { x: 8, y: 3 },
          { x: 8, y: 6 },
        ],
      },
      { type: "TEXT", layer: "NOTE" },
    ],
  });

  it("normalizes supported entities, layers, bounds, and units", () => {
    expect(normalized).toMatchObject({
      unit: "meter",
      entityCount: 3,
      supportedEntityCount: 2,
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 6 },
      unsupportedEntityCounts: { TEXT: 1 },
    });
    expect(normalized.segments).toHaveLength(3);
    expect(normalized.segments.map((segment) => segment.id)).toEqual(["e0:s0", "e1:s0", "e1:s1"]);
    expect(normalized.layers.map((layer) => layer.name)).toEqual(["PIPE", "WALL"]);
    expect(normalized.layers).toMatchObject([
      { name: "PIPE", color: "#ff0000" },
      { name: "WALL", color: "#00ff00" },
    ]);
  });

  it("creates a deterministic lightweight overview and SVG preview", () => {
    expect(
      createOverview({ ...normalized, segments: [...normalized.segments, ...normalized.segments] }, 3).segments,
    ).toHaveLength(3);
    expect(createDxfPreviewSvg(normalized)).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -6 10 6" width="1200" height="800"><rect x="0" y="-6" width="10" height="6" fill="#07111d"/><path d="M0 0L10 0M2 -3L8 -3M8 -3L8 -6" fill="none" stroke="#5eead4" stroke-width="0.7" vector-effect="non-scaling-stroke"/></svg>',
    );
  });

  it("serializes geometry as compact JSON and reads both compact and legacy data", () => {
    const compact = serializeDxfJson(normalized);

    expect(compact.schemaVersion).toBe(2);
    expect(compact.segmentLayers).toEqual(["PIPE", "WALL"]);
    expect(compact.segments[0]).toEqual(["e0:s0", 1, 0, 0, 10, 0]);
    expect(deserializeDxfJson(compact).segments).toEqual(normalized.segments);
    expect(deserializeDxfJson(normalized).segments).toEqual(normalized.segments);
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(normalized).length);
  });

  it("expands block INSERT entities with scale, rotation, and translation", () => {
    const block = normalizeDxfDrawing({
      blocks: {
        PUMP: {
          entities: [
            {
              type: "LINE",
              layer: "0",
              vertices: [
                { x: 0, y: 0 },
                { x: 10, y: 0 },
              ],
            },
          ],
        },
      },
      entities: [
        {
          type: "INSERT",
          name: "PUMP",
          layer: "EQUIPMENT",
          position: { x: 100, y: 200 },
          xScale: 2,
          yScale: 2,
          rotation: 90,
        },
      ],
    });
    expect(block.supportedEntityCount).toBe(1);
    expect(block.segments[0].start).toEqual({ x: 100, y: 200 });
    expect(block.segments[0].end.x).toBeCloseTo(100, 8);
    expect(block.segments[0].end.y).toBeCloseTo(220, 8);
  });
});
