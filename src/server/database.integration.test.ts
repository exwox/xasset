import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.INTEGRATION_DATABASE_URL;
const suite = describe.runIf(Boolean(url));
let pool: Pool;
suite("asset database integration", () => {
  beforeAll(() => {
    pool = new Pool({ connectionString: url });
  });
  afterAll(async () => pool.end());
  it("persists exact decimals and enforces unique asset number", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(
        `INSERT INTO assets(asset_number,asset_code,asset_description,acquisition_value,book_value,quantity) VALUES('INTEGRATION-ASSET-001','TEST','Integration asset',1234.56,789.12,0) RETURNING acquisition_value,book_value,quantity`,
      );
      expect(result.rows[0]).toMatchObject({ acquisition_value: "1234.56", book_value: "789.12", quantity: "0.0000" });
      await expect(
        client.query(
          `INSERT INTO assets(asset_number,asset_code,asset_description) VALUES('INTEGRATION-ASSET-001','TEST','Duplicate')`,
        ),
      ).rejects.toMatchObject({ code: "23505" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
  it("keeps active asset numbers unique", async () => {
    const result = await pool.query(
      `SELECT count(*)::int count,count(DISTINCT asset_number)::int unique_numbers FROM assets WHERE archived_at IS NULL`,
    );
    expect(result.rows[0].unique_numbers).toBe(result.rows[0].count);
  });
  it("assigns a unique directory No without changing No Asset", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const suffix = crypto.randomUUID();
      const first = (
        await client.query(
          `INSERT INTO assets(asset_number,asset_code,asset_description) VALUES($1,'NO','Directory number one') RETURNING directory_no,asset_number`,
          [`INTEGRATION-NO-A-${suffix}`],
        )
      ).rows[0];
      const second = (
        await client.query(
          `INSERT INTO assets(asset_number,asset_code,asset_description) VALUES($1,'NO','Directory number two') RETURNING directory_no,asset_number`,
          [`INTEGRATION-NO-B-${suffix}`],
        )
      ).rows[0];
      expect(Number(second.directory_no)).toBe(Number(first.directory_no) + 1);
      expect(first.asset_number).toBe(`INTEGRATION-NO-A-${suffix}`);
      expect(second.asset_number).toBe(`INTEGRATION-NO-B-${suffix}`);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
  it("finds positioned assets with a PostGIS bounding box", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO assets(asset_number,asset_code,asset_description,longitude,latitude) VALUES('INTEGRATION-GEO-001','GEO','Spatial test',104.5323,0.9227)`,
      );
      const result = await client.query(
        `SELECT count(*)::int count FROM assets WHERE ST_Intersects(ST_SetSRID(ST_MakePoint(longitude,latitude),4326),ST_MakeEnvelope(104.52,0.91,104.54,0.94,4326)) AND asset_number='INTEGRATION-GEO-001'`,
      );
      expect(result.rows[0].count).toBe(1);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
  it("versions DXF metadata and links local asset coordinates", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const document = (await client.query(`INSERT INTO dxf_documents(name) VALUES('Integration layout') RETURNING id`))
        .rows[0];
      const version = (
        await client.query(
          `INSERT INTO dxf_versions(document_id,version_number,file_name,content_type,size_bytes,source_file_key,status) VALUES($1,1,'layout.dxf','application/octet-stream',100,'integration/layout.dxf','ready') RETURNING id`,
          [document.id],
        )
      ).rows[0];
      await client.query(`INSERT INTO dxf_layers(version_id,name,entity_count,opacity) VALUES($1,'WALL',12,.5)`, [
        version.id,
      ]);
      await client.query(`UPDATE dxf_documents SET active_version_id=$2,status='published' WHERE id=$1`, [
        document.id,
        version.id,
      ]);
      const asset = (
        await client.query(
          `INSERT INTO assets(asset_number,asset_code,asset_description,dxf_document_id,local_x,local_y) VALUES('INTEGRATION-DXF-ASSET','DXF','Local asset',$1,120.5,88.25) RETURNING local_x,local_y,dxf_document_id`,
          [document.id],
        )
      ).rows[0];
      expect(asset).toMatchObject({ local_x: "120.500000", local_y: "88.250000", dxf_document_id: document.id });
      const layer = (await client.query(`SELECT opacity FROM dxf_layers WHERE version_id=$1`, [version.id])).rows[0];
      expect(layer.opacity).toBe("0.500");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
  it("prevents two DXF editors from overwriting the same draft", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const document = (await client.query(`INSERT INTO dxf_documents(name) VALUES('Editor integration') RETURNING id`))
        .rows[0];
      const version = (
        await client.query(
          `INSERT INTO dxf_versions(document_id,version_number,file_name,content_type,size_bytes,source_file_key,status) VALUES($1,1,'base.dxf','application/dxf',10,$2,'ready') RETURNING id`,
          [document.id, `integration/editor-${crypto.randomUUID()}.dxf`],
        )
      ).rows[0];
      const session = (
        await client.query(
          `INSERT INTO dxf_edit_sessions(document_id,base_version_id) VALUES($1,$2) RETURNING id,version`,
          [document.id, version.id],
        )
      ).rows[0];
      const first = await client.query(
        `UPDATE dxf_edit_sessions SET snapshot=$2,version=version+1 WHERE id=$1 AND version=1 RETURNING version`,
        [session.id, { patches: { a: null } }],
      );
      const stale = await client.query(
        `UPDATE dxf_edit_sessions SET snapshot=$2,version=version+1 WHERE id=$1 AND version=1 RETURNING version`,
        [session.id, { patches: { b: null } }],
      );
      expect(first.rows[0].version).toBe(2);
      expect(stale.rowCount).toBe(0);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
  it("soft archives asset documents without losing the object reference", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const asset = (
        await client.query(
          `INSERT INTO assets(asset_number,asset_code,asset_description) VALUES($1,'DOC','Document integration') RETURNING id`,
          [`INTEGRATION-DOC-${crypto.randomUUID()}`],
        )
      ).rows[0];
      const document = (
        await client.query(
          `INSERT INTO asset_documents(asset_id,file_name,object_key,content_type,size_bytes,document_type) VALUES($1,'manual.pdf',$2,'application/pdf',10,'manual') RETURNING id,object_key`,
          [asset.id, `integration/${crypto.randomUUID()}`],
        )
      ).rows[0];
      const archived = (
        await client.query(
          `UPDATE asset_documents SET archived_at=now() WHERE id=$1 RETURNING object_key,archived_at`,
          [document.id],
        )
      ).rows[0];
      expect(archived.object_key).toBe(document.object_key);
      expect(archived.archived_at).toBeInstanceOf(Date);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
  it("assigns least-privilege document permissions", async () => {
    const result = await pool.query(
      `SELECT r.code,array_agg(p.code ORDER BY p.code) FILTER(WHERE p.code LIKE 'document:%') permissions FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id LEFT JOIN permissions p ON p.id=rp.permission_id GROUP BY r.code`,
    );
    const roles = Object.fromEntries(result.rows.map((row) => [row.code, row.permissions]));
    expect(roles.viewer).toBeNull();
    expect(roles.user).toEqual(["document:delete", "document:download", "document:upload"]);
    expect(roles.administrator).toContain("document:delete");
  });
});
