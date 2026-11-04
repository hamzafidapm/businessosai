import { query } from "./db";
// Audit log: important actions only, never passwords, tokens, or full customer contacts.
export async function audit(
  workspaceId: string | null, actorId: string | null, action: string,
  entityType: string, entityId: string | null, before: unknown = null, after: unknown = null,
) {
  await query(
    "INSERT INTO audit_logs (workspace_id, actor_id, action, entity_type, entity_id, before_json, after_json) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)",
    [workspaceId, actorId, action, entityType, entityId,
     before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null],
  ).catch((e) => console.error(JSON.stringify({ level: "error", msg: "audit log failed", err: String(e) })));
}
export function scrub(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (["password", "token", "password_hash", "customer_contact"].includes(k)) continue;
    out[k] = v;
  }
  return out;
}
