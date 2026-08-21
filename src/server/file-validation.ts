const starts = (bytes: Uint8Array, signature: number[]) => signature.every((value, index) => bytes[index] === value);
const decode = (bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: false }).decode(bytes);
export function validateFileSignature(contentType: string, bytes: Uint8Array) {
  if (!bytes.length) return { valid: false, reason: "EMPTY_FILE" };
  if (contentType === "application/pdf")
    return { valid: starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]), reason: "PDF_SIGNATURE" };
  if (contentType === "image/jpeg") return { valid: starts(bytes, [0xff, 0xd8, 0xff]), reason: "JPEG_SIGNATURE" };
  if (contentType === "image/png")
    return { valid: starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), reason: "PNG_SIGNATURE" };
  if (contentType === "image/webp")
    return {
      valid: decode(bytes.slice(0, 4)) === "RIFF" && decode(bytes.slice(8, 12)) === "WEBP",
      reason: "WEBP_SIGNATURE",
    };
  if (contentType.includes("openxmlformats-officedocument"))
    return { valid: starts(bytes, [0x50, 0x4b, 0x03, 0x04]), reason: "ZIP_SIGNATURE" };
  if (contentType === "text/plain" || contentType === "text/csv")
    return { valid: !bytes.slice(0, 4096).includes(0), reason: "TEXT_BINARY_CONTENT" };
  return { valid: false, reason: "UNSUPPORTED_CONTENT_TYPE" };
}
export function validateDxfSignature(bytes: Uint8Array) {
  const text = decode(bytes.slice(0, 8192)).replace(/^\uFEFF/, "");
  return { valid: /(^|\r?\n)\s*0\s*\r?\n\s*SECTION\s*(\r?\n|$)/i.test(text), reason: "DXF_SECTION_MISSING" };
}
