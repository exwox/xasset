import { Queue } from "bullmq";
import { redis } from "./redis";
export const DXF_QUEUE = "dxf-processing";
let queue: Queue | undefined;
export function dxfQueue() { queue ??= new Queue(DXF_QUEUE, { connection: redis() }); return queue; }
