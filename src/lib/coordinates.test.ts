import { describe, expect, it } from "vitest";
import { fitAffineTransform, fitSimilarityTransform, localToWorld, worldToLocal } from "./coordinates";

describe("localToWorld", () => {
  const calibration = {
    origin: { longitude: 106.84555, latitude: -6.2086 },
    localOrigin: { x: 0, y: 0 },
    metersPerUnit: 1,
    rotationDegrees: 0,
  };

  it("keeps the origin fixed", () => expect(localToWorld({ x: 0, y: 0 }, calibration)).toEqual(calibration.origin));
  it("moves positive y north", () =>
    expect(localToWorld({ x: 0, y: 10 }, calibration).latitude).toBeGreaterThan(calibration.origin.latitude));
  it("applies rotation", () =>
    expect(localToWorld({ x: 10, y: 0 }, { ...calibration, rotationDegrees: 90 }).latitude).toBeGreaterThan(
      calibration.origin.latitude,
    ));
  it("round-trips world and local coordinates", () => {
    const local = { x: 172.45, y: -84.2 };
    const rotated = { ...calibration, rotationDegrees: 27 };
    const result = worldToLocal(localToWorld(local, rotated), rotated);
    expect(result.x).toBeCloseTo(local.x, 6);
    expect(result.y).toBeCloseTo(local.y, 6);
  });
});

describe("fitSimilarityTransform", () => {
  it("recovers scale, rotation, and origin from surveyed control points", () => {
    const expected = {
      origin: { longitude: 104.5323, latitude: 0.9227 },
      localOrigin: { x: 0, y: 0 },
      metersPerUnit: 0.001,
      rotationDegrees: 12,
    };
    const locals = [
      { x: 0, y: 0 },
      { x: 50_000, y: 0 },
      { x: 0, y: 40_000 },
    ];
    const fitted = fitSimilarityTransform(locals.map((local) => ({ local, world: localToWorld(local, expected) })));
    expect(fitted.origin.longitude).toBeCloseTo(expected.origin.longitude, 7);
    expect(fitted.origin.latitude).toBeCloseTo(expected.origin.latitude, 7);
    expect(fitted.metersPerUnit).toBeCloseTo(0.001, 8);
    expect(fitted.rotationDegrees).toBeCloseTo(12, 5);
    expect(fitted.residualErrorMeters).toBeLessThan(0.001);
  });
});

describe("fitAffineTransform", () => {
  it("recovers a non-uniform affine transform and supports inverse conversion", () => {
    const expected = {
      type: "affine" as const,
      reference: { longitude: 104.5323, latitude: 0.9227 },
      matrix: [
        [0.002, 0.0002, 4],
        [-0.0001, 0.0015, -3],
      ] as [[number, number, number], [number, number, number]],
    };
    const locals = [
      { x: 0, y: 0 },
      { x: 50_000, y: 0 },
      { x: 0, y: 40_000 },
      { x: 30_000, y: 20_000 },
    ];
    const fitted = fitAffineTransform(locals.map((local) => ({ local, world: localToWorld(local, expected) })));
    expect(fitted.matrix[0][0]).toBeCloseTo(expected.matrix[0][0], 8);
    expect(fitted.matrix[1][1]).toBeCloseTo(expected.matrix[1][1], 8);
    expect(fitted.residualErrorMeters).toBeLessThan(0.001);
    const restored = worldToLocal(localToWorld(locals[3], fitted), fitted);
    expect(restored.x).toBeCloseTo(locals[3].x, 5);
    expect(restored.y).toBeCloseTo(locals[3].y, 5);
  });
});
