import type { Asset, DxfSegment } from "./types";

export const assets: Asset[] = [
  { id: "1", no: 1, assetNumber: "10000001", capitalizedOn: "2021-03-18", assetCode: "PM-001", assetClass: "Production Machine", description: "Hydraulic Press Line A", acquisitionValue: 2850000000, bookValue: 1765000000, quantity: 1, unit: "UNIT", location: "Plant Jakarta", subAsset: "Main Drive", documentationCount: 4, layout: "Production / Line A", maintenance: "Active", usageFrequency: "Setiap hari", longitude: 106.84582, latitude: -6.20842, altitude: 65 },
  { id: "2", no: 2, assetNumber: "10000002", capitalizedOn: "2022-07-04", assetCode: "EL-014", assetClass: "Electrical", description: "Main Distribution Panel", acquisitionValue: 485000000, bookValue: 356000000, quantity: 1, unit: "SET", location: "Plant Jakarta", subAsset: "—", documentationCount: 2, layout: "Utility / Electrical", maintenance: "Commissioning", usageFrequency: "Kontinu", longitude: 106.84608, latitude: -6.20831, altitude: 64 },
  { id: "3", no: 3, assetNumber: "10000003", capitalizedOn: "2020-11-26", assetCode: "PP-007", assetClass: "Pump", description: "Cooling Water Pump B", acquisitionValue: 315000000, bookValue: 124000000, quantity: 2, unit: "UNIT", location: "Plant Jakarta", subAsset: "Motor B-07", documentationCount: 6, layout: "Utility / Pump Room", maintenance: "Under Maintenance", usageFrequency: "16 jam/hari", longitude: 106.84562, latitude: -6.20817, altitude: 64 },
  { id: "4", no: 4, assetNumber: "10000004", capitalizedOn: "2023-01-12", assetCode: "WH-022", assetClass: "Material Handling", description: "Electric Forklift 3 Ton", acquisitionValue: 625000000, bookValue: 518000000, quantity: 1, unit: "UNIT", location: "Warehouse Jakarta", subAsset: "Battery Pack", documentationCount: 3, layout: "Warehouse / Zone C", maintenance: "Active", usageFrequency: "8 jam/hari", longitude: 106.84623, latitude: -6.20855, altitude: 64 },
];

export const sampleDxf: DxfSegment[] = [
  { start: { x: 0, y: 0 }, end: { x: 50, y: 0 }, layer: "BUILDING" },
  { start: { x: 50, y: 0 }, end: { x: 50, y: 32 }, layer: "BUILDING" },
  { start: { x: 50, y: 32 }, end: { x: 0, y: 32 }, layer: "BUILDING" },
  { start: { x: 0, y: 32 }, end: { x: 0, y: 0 }, layer: "BUILDING" },
  { start: { x: 18, y: 0 }, end: { x: 18, y: 32 }, layer: "ZONE" },
  { start: { x: 34, y: 0 }, end: { x: 34, y: 32 }, layer: "ZONE" },
];
