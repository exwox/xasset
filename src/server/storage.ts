import { S3Client } from "@aws-sdk/client-s3";
import { config } from "./config";

let client: S3Client | undefined;
let publicClient: S3Client | undefined;

function createClient(endpoint: string) {
  const env = config();
  return new S3Client({ endpoint, region: env.S3_REGION, forcePathStyle: env.S3_FORCE_PATH_STYLE, credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY } });
}

export function storage() {
  const env = config();
  client ??= createClient(env.S3_ENDPOINT);
  return client;
}

export function publicStorage() {
  const env = config();
  publicClient ??= createClient(env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT);
  return publicClient;
}
