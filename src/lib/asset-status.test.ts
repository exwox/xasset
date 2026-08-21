import { describe, expect, it } from "vitest";
import { assetInputSchema, assetListSchema } from "@/server/asset-schema";
import { ASSET_STATUSES, ASSET_STATUS_COLORS } from "./asset-status";

describe("asset lifecycle status", () => {
  it("keeps the supported statuses and map colors stable", () => {
    expect(ASSET_STATUSES).toEqual([
      "Planned",
      "Under Construction",
      "Commissioning",
      "Active",
      "Under Maintenance",
      "Inactive",
      "Decommissioned",
      "Demolished",
    ]);
    expect(ASSET_STATUS_COLORS).toEqual({
      Planned: "#a855f7",
      "Under Construction": "#1d4ed8",
      Commissioning: "#38bdf8",
      Active: "#22c55e",
      "Under Maintenance": "#f97316",
      Inactive: "#ef4444",
      Decommissioned: "#facc15",
      Demolished: "#94a3b8",
    });
  });

  it("defaults new assets to Active and rejects legacy status filters", () => {
    const input = assetInputSchema.parse({
      assetNumber: "A-1",
      assetCode: "CODE-1",
      description: "Asset test",
    });
    expect(input.maintenanceStatus).toBe("Active");
    expect(assetListSchema.safeParse({ status: "Operational" }).success).toBe(false);
  });
});
