import { describe, expect, it } from "vitest";
import { createSiteSchema, createUserSchema, updateUserSchema } from "./admin-schema";

describe("admin schemas", () => {
  it("accepts the three supported roles and rejects removed legacy roles", () => {
    const base = { name: "User Bandara", email: "user@example.com", password: "password-aman-123" };
    for (const role of ["administrator", "user", "viewer"]) expect(createUserSchema.safeParse({ ...base, role }).success).toBe(true);
    expect(createUserSchema.safeParse({ ...base, role: "operator" }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...base, role: "dxf_editor" }).success).toBe(false);
  });
  it("requires a secure password and a real update", () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
    expect(updateUserSchema.safeParse({ password: "pendek" }).success).toBe(false);
    expect(updateUserSchema.safeParse({ role: "viewer" }).success).toBe(true);
  });
  it("validates airport coordinates and normalizes its code", () => {
    const parsed = createSiteSchema.parse({ code: "bth", name: "Bandar Udara Hang Nadim", longitude: 104.1188, latitude: 1.121, cameraHeight: 5200 });
    expect(parsed).toMatchObject({ code: "BTH", active: false });
    expect(createSiteSchema.safeParse({ ...parsed, latitude: 100 }).success).toBe(false);
  });
});
