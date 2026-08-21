import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { gzipSync } from "node:zlib";
import { Worker, type Job } from "bullmq";
import DxfParser from "dxf-parser";
import { createDxfPreviewSvg, createOverview, normalizeDxfDrawing, serializeDxfJson } from "../lib/dxf-processing";
import { config } from "../server/config";
import { query, transaction } from "../server/db";
import { logger } from "../server/logger";
import { redis } from "../server/redis";
import { DXF_QUEUE } from "../server/queue";
import { storage } from "../server/storage";

interface DxfJob {
  documentId: string;
  versionId: string;
  sourceKey: string;
}

async function progress(job: Job<DxfJob>, value: number) {
  await job.updateProgress(value);
  await query(`UPDATE dxf_versions SET progress=$2,status='processing',error_message=NULL WHERE id=$1`, [
    job.data.versionId,
    value,
  ]);
}

const worker = new Worker<DxfJob>(
  DXF_QUEUE,
  async (job) => {
    try {
      await progress(job, 5);
      const response = await storage().send(
        new GetObjectCommand({ Bucket: config().S3_BUCKET, Key: job.data.sourceKey }),
      );
      const text = await response.Body?.transformToString();
      if (!text) throw new Error("DXF source is empty");
      await progress(job, 20);
      const drawing = new DxfParser().parseSync(text);
      if (!drawing) throw new Error("DXF could not be parsed");
      await progress(job, 50);
      const normalized = normalizeDxfDrawing(drawing, 300_000);
      if (!normalized.segments.length) throw new Error("DXF tidak memiliki entitas yang dapat dirender");
      const root = `dxf/${job.data.documentId}/${job.data.versionId}`;
      const normalizedKey = `${root}/normalized.json.gz`;
      const renderKey = `${root}/render.json.gz`;
      const previewKey = `${root}/preview.svg`;
      await storage().send(
        new PutObjectCommand({
          Bucket: config().S3_BUCKET,
          Key: normalizedKey,
          Body: gzipSync(JSON.stringify(serializeDxfJson(normalized)), { level: 6 }),
          ContentType: "application/json",
          ContentEncoding: "gzip",
          Metadata: { document: job.data.documentId, version: job.data.versionId },
        }),
      );
      await progress(job, 72);
      const overview = createOverview(normalized);
      await Promise.all([
        storage().send(
          new PutObjectCommand({
            Bucket: config().S3_BUCKET,
            Key: renderKey,
            Body: gzipSync(JSON.stringify(serializeDxfJson(overview)), { level: 6 }),
            ContentType: "application/json",
            ContentEncoding: "gzip",
          }),
        ),
        storage().send(
          new PutObjectCommand({
            Bucket: config().S3_BUCKET,
            Key: previewKey,
            Body: createDxfPreviewSvg(normalized),
            ContentType: "image/svg+xml",
          }),
        ),
      ]);
      await progress(job, 88);
      await transaction(async (client) => {
        await client.query(`DELETE FROM dxf_layers WHERE version_id=$1`, [job.data.versionId]);
        for (const [index, layer] of normalized.layers.entries())
          await client.query(
            `INSERT INTO dxf_layers(version_id,name,color,entity_count,sort_order) VALUES($1,$2,$3,$4,$5)`,
            [job.data.versionId, layer.name, layer.color, layer.entityCount, index],
          );
        await client.query(
          `UPDATE dxf_versions SET normalized_file_key=$2,render_file_key=$3,preview_file_key=$4,unit=$5,bounds=$6,
           entity_count=$7,supported_entity_count=$8,layer_count=$9,status='ready',progress=100,processed_at=now()
           WHERE id=$1`,
          [
            job.data.versionId,
            normalizedKey,
            renderKey,
            previewKey,
            normalized.unit,
            JSON.stringify(normalized.bounds),
            normalized.entityCount,
            normalized.supportedEntityCount,
            normalized.layers.length,
          ],
        );
        await client.query(`UPDATE dxf_documents SET updated_at=now() WHERE id=$1`, [job.data.documentId]);
      });
      await job.updateProgress(100);
      return {
        documentId: job.data.documentId,
        versionId: job.data.versionId,
        entityCount: normalized.entityCount,
        renderedSegments: normalized.segments.length,
        layerCount: normalized.layers.length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2000) : "DXF processing failed";
      await query(`UPDATE dxf_versions SET status='failed',error_message=$2 WHERE id=$1`, [
        job.data.versionId,
        message,
      ]);
      throw error;
    }
  },
  { connection: redis(), concurrency: 1, limiter: { max: 1, duration: 1000 } },
);

worker.on("completed", (job) => logger().info({ jobId: job.id }, "DXF job completed"));
worker.on("failed", (job, error) => logger().error({ jobId: job?.id, error }, "DXF job failed"));
logger().info({ queue: DXF_QUEUE }, "DXF worker started");
