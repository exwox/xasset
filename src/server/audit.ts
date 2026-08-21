import { query } from "./db";
import type { Session } from "./auth";

export async function writeAudit(input: { actor?: Session | null; action: string; resourceType: string; resourceId?: string; before?: unknown; after?: unknown; requestId?: string; ip?: string; userAgent?: string }) {
  await query(`INSERT INTO audit_logs(actor_user_id, action, resource_type, resource_id, before_data, after_data, request_id, ip_address, user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [input.actor?.userId ?? null, input.action, input.resourceType, input.resourceId ?? null, input.before ? JSON.stringify(input.before) : null, input.after ? JSON.stringify(input.after) : null, input.requestId ?? null, input.ip ?? null, input.userAgent ?? null]);
}
