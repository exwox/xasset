import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(32),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(28800),
  S3_ENDPOINT: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("ap-southeast-1"),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.string().default("true").transform((value) => value === "true"),
  LOG_LEVEL: z.enum(["silent", "fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

let cached: z.infer<typeof schema> | undefined;

export function config() {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}
