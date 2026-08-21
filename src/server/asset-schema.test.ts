import { describe, expect, it } from "vitest";
import { assetPatchSchema } from "./asset-schema";

describe("asset polygon validation", () => {
  it("accepts a polygon with at least three geographic points", () => {
    expect(
      assetPatchSchema.parse({
        version: 1,
        polygon: [
          { longitude: 104.53, latitude: 0.92 },
          { longitude: 104.54, latitude: 0.92 },
          { longitude: 104.54, latitude: 0.93 },
        ],
      }).polygon,
    ).toHaveLength(3);
  });

  it("rejects an incomplete polygon", () => {
    expect(() =>
      assetPatchSchema.parse({
        version: 1,
        polygon: [
          { longitude: 104.53, latitude: 0.92 },
          { longitude: 104.54, latitude: 0.92 },
        ],
      }),
    ).toThrow();
  });
});
