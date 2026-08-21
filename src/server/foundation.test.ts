import { describe, expect, it } from "vitest";
import { hasPermission, type Session } from "./auth";
import { hashPassword, verifyPassword } from "./password";

const viewer: Session = { userId: "1", email: "viewer@example.com", name: "Viewer", role: "viewer", permissions: ["asset:read", "dxf:read"] };

describe("password", () => {
  it("hashes and verifies without storing plaintext", async () => { const hash = await hashPassword("correct horse battery staple"); expect(hash).not.toContain("correct horse"); expect(await verifyPassword("correct horse battery staple", hash)).toBe(true); expect(await verifyPassword("wrong password", hash)).toBe(false); });
});

describe("permissions", () => {
  it("restricts viewer writes", () => { expect(hasPermission(viewer, "asset:read")).toBe(true); expect(hasPermission(viewer, "asset:write")).toBe(false); });
  it("allows administrator permissions", () => expect(hasPermission({ ...viewer, role: "administrator", permissions: [] }, "admin:manage")).toBe(true));
});
