import type { AffineCalibration, Calibration, DxfControlPoint, DxfTransform, LocalPoint, WorldPoint } from "./types";

const METERS_PER_DEGREE_LATITUDE = 111_320;

export function localToWorld(point: LocalPoint, calibration: DxfTransform): WorldPoint {
  if ("matrix" in calibration) {
    const [[a, b, eastOffset], [c, d, northOffset]] = calibration.matrix;
    const east = a * point.x + b * point.y + eastOffset;
    const north = c * point.x + d * point.y + northOffset;
    const metersPerDegreeLongitude =
      METERS_PER_DEGREE_LATITUDE * Math.cos((calibration.reference.latitude * Math.PI) / 180);
    return {
      longitude: calibration.reference.longitude + east / metersPerDegreeLongitude,
      latitude: calibration.reference.latitude + north / METERS_PER_DEGREE_LATITUDE,
    };
  }
  const angle = (calibration.rotationDegrees * Math.PI) / 180;
  const dx = (point.x - calibration.localOrigin.x) * calibration.metersPerUnit;
  const dy = (point.y - calibration.localOrigin.y) * calibration.metersPerUnit;
  const east = dx * Math.cos(angle) - dy * Math.sin(angle);
  const north = dx * Math.sin(angle) + dy * Math.cos(angle);
  const latitude = calibration.origin.latitude + north / METERS_PER_DEGREE_LATITUDE;
  const metersPerDegreeLongitude = METERS_PER_DEGREE_LATITUDE * Math.cos((calibration.origin.latitude * Math.PI) / 180);
  return { longitude: calibration.origin.longitude + east / metersPerDegreeLongitude, latitude };
}

export function worldToLocal(point: WorldPoint, calibration: DxfTransform): LocalPoint {
  if ("matrix" in calibration) {
    const [[a, b, eastOffset], [c, d, northOffset]] = calibration.matrix;
    const metersPerDegreeLongitude =
      METERS_PER_DEGREE_LATITUDE * Math.cos((calibration.reference.latitude * Math.PI) / 180);
    const east = (point.longitude - calibration.reference.longitude) * metersPerDegreeLongitude - eastOffset;
    const north = (point.latitude - calibration.reference.latitude) * METERS_PER_DEGREE_LATITUDE - northOffset;
    const determinant = a * d - b * c;
    if (Math.abs(determinant) < 1e-12) throw new Error("Transformasi affine tidak dapat dibalik");
    return { x: (d * east - b * north) / determinant, y: (-c * east + a * north) / determinant };
  }
  const angle = (calibration.rotationDegrees * Math.PI) / 180;
  const north = (point.latitude - calibration.origin.latitude) * METERS_PER_DEGREE_LATITUDE;
  const metersPerDegreeLongitude = METERS_PER_DEGREE_LATITUDE * Math.cos((calibration.origin.latitude * Math.PI) / 180);
  const east = (point.longitude - calibration.origin.longitude) * metersPerDegreeLongitude;
  const dx = east * Math.cos(angle) + north * Math.sin(angle);
  const dy = -east * Math.sin(angle) + north * Math.cos(angle);
  return {
    x: calibration.localOrigin.x + dx / calibration.metersPerUnit,
    y: calibration.localOrigin.y + dy / calibration.metersPerUnit,
  };
}

function solveLinear(matrix: number[][], values: number[]) {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1)
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    if (Math.abs(augmented[column][column]) < 1e-12)
      throw new Error("Control point tidak menghasilkan transformasi unik");
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map((row) => row[size]);
}

export function fitSimilarityTransform(points: DxfControlPoint[]): Calibration & { residualErrorMeters: number } {
  if (points.length < 2) throw new Error("Minimal dua control point diperlukan");
  const reference = points[0].world;
  const latitudeRadians = (reference.latitude * Math.PI) / 180;
  const rows: number[][] = [];
  const targets: number[] = [];
  for (const point of points) {
    const east = (point.world.longitude - reference.longitude) * METERS_PER_DEGREE_LATITUDE * Math.cos(latitudeRadians);
    const north = (point.world.latitude - reference.latitude) * METERS_PER_DEGREE_LATITUDE;
    rows.push([point.local.x, -point.local.y, 1, 0], [point.local.y, point.local.x, 0, 1]);
    targets.push(east, north);
  }
  const normal = Array.from({ length: 4 }, () => Array(4).fill(0));
  const projected = Array(4).fill(0);
  for (let row = 0; row < rows.length; row += 1)
    for (let left = 0; left < 4; left += 1) {
      projected[left] += rows[row][left] * targets[row];
      for (let right = 0; right < 4; right += 1) normal[left][right] += rows[row][left] * rows[row][right];
    }
  const [a, b, eastOffset, northOffset] = solveLinear(normal, projected);
  const origin = {
    longitude: reference.longitude + eastOffset / (METERS_PER_DEGREE_LATITUDE * Math.cos(latitudeRadians)),
    latitude: reference.latitude + northOffset / METERS_PER_DEGREE_LATITUDE,
  };
  const calibration: Calibration = {
    origin,
    localOrigin: { x: 0, y: 0 },
    metersPerUnit: Math.hypot(a, b),
    rotationDegrees: (Math.atan2(b, a) * 180) / Math.PI,
  };
  const squaredError = points.reduce((total, point) => {
    const fitted = localToWorld(point.local, calibration);
    const east = (fitted.longitude - point.world.longitude) * METERS_PER_DEGREE_LATITUDE * Math.cos(latitudeRadians);
    const north = (fitted.latitude - point.world.latitude) * METERS_PER_DEGREE_LATITUDE;
    return total + east * east + north * north;
  }, 0);
  return { ...calibration, residualErrorMeters: Math.sqrt(squaredError / points.length) };
}

export function fitAffineTransform(points: DxfControlPoint[]): AffineCalibration & { residualErrorMeters: number } {
  if (points.length < 3) throw new Error("Minimal tiga control point diperlukan untuk transformasi affine");
  const reference = points[0].world;
  const longitudeScale = METERS_PER_DEGREE_LATITUDE * Math.cos((reference.latitude * Math.PI) / 180);
  const rows: number[][] = [];
  const targets: number[] = [];
  for (const point of points) {
    const east = (point.world.longitude - reference.longitude) * longitudeScale;
    const north = (point.world.latitude - reference.latitude) * METERS_PER_DEGREE_LATITUDE;
    rows.push([point.local.x, point.local.y, 1, 0, 0, 0], [0, 0, 0, point.local.x, point.local.y, 1]);
    targets.push(east, north);
  }
  const normal = Array.from({ length: 6 }, () => Array(6).fill(0));
  const projected = Array(6).fill(0);
  for (let row = 0; row < rows.length; row += 1)
    for (let left = 0; left < 6; left += 1) {
      projected[left] += rows[row][left] * targets[row];
      for (let right = 0; right < 6; right += 1) normal[left][right] += rows[row][left] * rows[row][right];
    }
  const [a, b, eastOffset, c, d, northOffset] = solveLinear(normal, projected);
  const transform: AffineCalibration = {
    type: "affine",
    reference,
    matrix: [
      [a, b, eastOffset],
      [c, d, northOffset],
    ],
  };
  const squaredError = points.reduce((total, point) => {
    const fitted = localToWorld(point.local, transform);
    const east = (fitted.longitude - point.world.longitude) * longitudeScale;
    const north = (fitted.latitude - point.world.latitude) * METERS_PER_DEGREE_LATITUDE;
    return total + east * east + north * north;
  }, 0);
  return { ...transform, residualErrorMeters: Math.sqrt(squaredError / points.length) };
}
