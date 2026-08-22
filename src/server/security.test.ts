import { describe, expect, it } from "vitest";
import { validateDxfSignature, validateFileSignature } from "./file-validation";
import { isTrustedMutation, opaqueRateLimitKey } from "./security";
const bytes = (value: string) => new TextEncoder().encode(value);
describe("security boundaries", () => {
  it("rejects cross-site mutations and mismatched origins", () => {
    expect(isTrustedMutation({ method: "GET", origin: "https://evil.test" }, "https://asset.example")).toBe(true);
    expect(isTrustedMutation({ method: "POST", secFetchSite: "cross-site" }, "https://asset.example")).toBe(false);
    expect(isTrustedMutation({ method: "PATCH", origin: "https://evil.test" }, "https://asset.example")).toBe(false);
    expect(
      isTrustedMutation(
        { method: "POST", origin: "http://203.0.113.10:3000" },
        "http://localhost:3000",
        "http://203.0.113.10:3000",
      ),
    ).toBe(true);
    expect(isTrustedMutation({ method: "DELETE", origin: "https://asset.example" }, "https://asset.example")).toBe(
      true,
    );
  });
  it("uses opaque deterministic rate-limit keys", () => {
    const key = opaqueRateLimitKey("login-account", "Admin@Example.com");
    expect(key).not.toContain("Admin");
    expect(key).toBe(opaqueRateLimitKey("login-account", "admin@example.com"));
  });
  it("validates PDF, PNG, JPEG, WebP, Office ZIP and text signatures", () => {
    expect(validateFileSignature("application/pdf", bytes("%PDF-1.7")).valid).toBe(true);
    expect(validateFileSignature("application/pdf", bytes("<script>")).valid).toBe(false);
    expect(
      validateFileSignature("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).valid,
    ).toBe(true);
    expect(validateFileSignature("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff])).valid).toBe(true);
    expect(validateFileSignature("image/webp", bytes("RIFFxxxxWEBP")).valid).toBe(true);
    expect(
      validateFileSignature(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      ).valid,
    ).toBe(true);
    expect(validateFileSignature("text/plain", new Uint8Array([65, 0, 66])).valid).toBe(false);
  });
  it("requires an ASCII DXF SECTION marker", () => {
    expect(validateDxfSignature(bytes("  0\nSECTION\n  2\nHEADER\n")).valid).toBe(true);
    expect(validateDxfSignature(bytes("not a drawing")).valid).toBe(false);
  });
});
