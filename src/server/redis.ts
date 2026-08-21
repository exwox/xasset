import IORedis from "ioredis";
import { config } from "./config";

const globalForRedis = globalThis as unknown as { xassetRedis?: IORedis };
export function redis() { globalForRedis.xassetRedis ??= new IORedis(config().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true }); return globalForRedis.xassetRedis; }
