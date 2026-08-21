import { collectDefaultMetrics, Registry } from "prom-client";
const globalMetrics = globalThis as unknown as { xassetRegistry?: Registry };
export function registry() { if (!globalMetrics.xassetRegistry) { globalMetrics.xassetRegistry = new Registry(); collectDefaultMetrics({ register: globalMetrics.xassetRegistry, prefix: "xasset_" }); } return globalMetrics.xassetRegistry; }
