export const ASSET_STATUSES = [
  "Planned",
  "Under Construction",
  "Commissioning",
  "Active",
  "Under Maintenance",
  "Inactive",
  "Decommissioned",
  "Demolished",
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const ASSET_STATUS_COLORS: Record<AssetStatus, string> = {
  Planned: "#a855f7",
  "Under Construction": "#1d4ed8",
  Commissioning: "#38bdf8",
  Active: "#22c55e",
  "Under Maintenance": "#f97316",
  Inactive: "#ef4444",
  Decommissioned: "#facc15",
  Demolished: "#94a3b8",
};

export function assetStatusClass(status: AssetStatus) {
  return `asset-status-${status.toLowerCase().replaceAll(" ", "-")}`;
}
