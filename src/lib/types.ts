import type { AssetStatus } from "./asset-status";
export type { AssetStatus } from "./asset-status";

export interface Asset {
  id: string;
  no: number;
  assetNumber: string;
  capitalizedOn: string;
  assetCode: string;
  assetClass: string;
  description: string;
  acquisitionValue: number;
  bookValue: number;
  quantity: number;
  unit: string;
  location: string;
  subAsset: string;
  documentationCount: number;
  photoDocumentId?: string | null;
  documentationNote?: string | null;
  coordinateText?: string | null;
  polygon?: WorldPoint[] | null;
  layout: string;
  maintenance: AssetStatus;
  usageFrequency: string;
  longitude: number | null;
  latitude: number | null;
  altitude: number | null;
  localX?: number | null;
  localY?: number | null;
  localZ?: number | null;
  dxfDocumentId?: string | null;
  floorId?: string | null;
  version?: number;
}

export interface LocalPoint {
  x: number;
  y: number;
}
export interface WorldPoint {
  longitude: number;
  latitude: number;
}
export interface ActiveSite {
  id: string;
  code: string;
  name: string;
  longitude: number;
  latitude: number;
  cameraHeight: number;
}
export interface Calibration {
  origin: WorldPoint;
  localOrigin: LocalPoint;
  metersPerUnit: number;
  rotationDegrees: number;
}
export interface AffineCalibration {
  type: "affine";
  reference: WorldPoint;
  matrix: [[number, number, number], [number, number, number]];
}
export type DxfTransform = Calibration | AffineCalibration;
export interface DxfSegment {
  id?: string;
  start: LocalPoint;
  end: LocalPoint;
  layer: string;
}
export interface DxfControlPoint {
  local: LocalPoint;
  world: WorldPoint;
}
export interface DxfLayerStyle {
  name: string;
  color: string | null;
  opacity: number;
  sortOrder: number;
}
