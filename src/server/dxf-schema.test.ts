import { describe, expect, it } from "vitest";
import { georeferenceRequestSchema } from "./dxf-schema";

describe("georeferenceRequestSchema", () => {
  it("accepts a manual pan, scale, and rotation transform", () => {
    const result = georeferenceRequestSchema.safeParse({
      method: "manual",
      transform: {
        origin: { longitude: 104.5323, latitude: 0.9227 },
        localOrigin: { x: 500, y: 250 },
        metersPerUnit: 0.001,
        rotationDegrees: 12.5,
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects a manual transform with a zero scale", () => {
    const result = georeferenceRequestSchema.safeParse({
      method: "manual",
      transform: {
        origin: { longitude: 104.5323, latitude: 0.9227 },
        localOrigin: { x: 0, y: 0 },
        metersPerUnit: 0,
        rotationDegrees: 0,
      },
    });

    expect(result.success).toBe(false);
  });
});
