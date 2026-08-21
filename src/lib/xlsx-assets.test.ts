import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { parseAssetWorkbook } from "./xlsx-assets";

describe("parseAssetWorkbook", () => {
  it("reads only populated business cells", () => {
    const shared = `<sst><si><t>No Asset</t></si><si><t>Tanah</t></si><si><t>AREA TERMINAL</t></si><si><t>M2</t></si><si><t>TNJ</t></si></sst>`;
    const sheet = `<worksheet><sheetData><row r="2"><c r="B2" t="s"><v>0</v></c></row><row r="3"><c r="B3"><v>2001001</v></c><c r="C3"><v>45292</v></c><c r="D3"><v>2001</v></c><c r="E3" t="s"><v>1</v></c><c r="F3" t="s"><v>2</v></c><c r="G3"><v>1000</v></c><c r="H3"><v>800</v></c><c r="I3"><v>2</v></c><c r="J3" t="s"><v>3</v></c><c r="K3" t="s"><v>4</v></c></row></sheetData></worksheet>`;
    const zip = zipSync({ "xl/sharedStrings.xml": strToU8(shared), "xl/worksheets/sheet1.xml": strToU8(sheet) });
    const result = parseAssetWorkbook(zip);
    expect(result.rows).toHaveLength(1); expect(result.rows[0]).toMatchObject({ assetNumber: "2001001", assetClass: "Tanah", quantity: 2, acquisitionValue: 1000, unit: "M2", location: "TNJ" });
  });

  it("associates an embedded image anchored in the Dokumentasi column with its asset row", () => {
    const shared = `<sst><si><t>No Asset</t></si><si><t>Kode Aset</t></si><si><t>Asset description</t></si><si><t>Dokumentasi</t></si></sst>`;
    const sheet = `<worksheet><sheetData><row r="1"><c r="B1" t="s"><v>0</v></c><c r="D1" t="s"><v>1</v></c><c r="F1" t="s"><v>2</v></c><c r="N1" t="s"><v>3</v></c></row><row r="2"><c r="B2"><v>A-2</v></c><c r="D2"><v>K-2</v></c><c r="F2"><v>Pompa</v></c></row></sheetData></worksheet>`;
    const drawing = `<xdr:wsDr xmlns:xdr="xdr" xmlns:a="a" xmlns:r="r"><xdr:twoCellAnchor><xdr:from><xdr:col>13</xdr:col><xdr:row>1</xdr:row></xdr:from><xdr:pic><a:blip r:embed="rId1"/></xdr:pic></xdr:twoCellAnchor></xdr:wsDr>`;
    const rels = `<Relationships><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>`;
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const zip = zipSync({
      "xl/sharedStrings.xml": strToU8(shared),
      "xl/worksheets/sheet1.xml": strToU8(sheet),
      "xl/worksheets/_rels/sheet1.xml.rels": strToU8(`<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`),
      "xl/drawings/drawing1.xml": strToU8(drawing),
      "xl/drawings/_rels/drawing1.xml.rels": strToU8(rels),
      "xl/media/image1.png": png,
    });
    const result = parseAssetWorkbook(zip);
    expect(result.imageCount).toBe(1);
    expect(result.rows[0].documentationImages[0]).toMatchObject({
      fileName: "image1.png",
      contentType: "image/png",
    });
  });
});
