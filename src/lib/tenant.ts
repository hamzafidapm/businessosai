import { query } from "./db";
import { forbidden, notFound } from "./errors";
export { forbidden } from "./errors";

export type Role = "owner" | "admin" | "finance" | "operations" | "viewer";
export type Membership = { workspace_id: string; role: Role; workspace_name: string; is_demo: boolean; plan_code: string };

// Every API route must call requireMembership before touching tenant data, and every
// SQL query must include workspace_id = $workspaceId. UI visibility is never a substitute.
export async function requireMembership(userId: string, workspaceId: string): Promise<Membership> {
  const { rows } = await query(
    `SELECT m.workspace_id, m.role, w.name AS workspace_name, w.is_demo,
            COALESCE((SELECT plan_code FROM subscriptions s WHERE s.workspace_id = w.id ORDER BY s.created_at DESC LIMIT 1), 'free') AS plan_code
     FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.user_id = $1 AND m.workspace_id = $2 AND m.status = 'active'`,
    [userId, workspaceId]);
  if (!rows[0]) throw forbidden("You are not a member of this workspace.");
  return rows[0] as Membership;
}
export async function listMemberships(userId: string): Promise<Membership[]> {
  const { rows } = await query(
    `SELECT m.workspace_id, m.role, w.name AS workspace_name, w.is_demo,
            COALESCE((SELECT plan_code FROM subscriptions s WHERE s.workspace_id = w.id ORDER BY s.created_at DESC LIMIT 1), 'free') AS plan_code
     FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.user_id = $1 AND m.status = 'active' ORDER BY w.created_at`,
    [userId]);
  return rows as Membership[];
}
// Write permissions by role (PRD §4). Viewer is read-only everywhere.
export function canWrite(role: Role): boolean { return role !== "viewer"; }
export function canManageSettings(role: Role): boolean { return role === "owner" || role === "admin"; }
export function canManageFinance(role: Role): boolean { return ["owner", "admin", "finance"].includes(role); }
export function canManageOperations(role: Role): boolean { return ["owner", "admin", "operations", "finance"].includes(role); }
export function requireWrite(role: Role) { if (!canWrite(role)) throw forbidden("Viewers cannot change records."); }
export async function assertWorkspaceRecord(workspaceId: string, table: string, id: string): Promise<void> {
  // Generic existence check used before updates/deletes so a cross-workspace id
  // returns 404 (not a leak) instead of succeeding. Table names are allowlisted by callers.
  const allowed = new Set(["products", "orders", "expenses", "couriers", "shipments", "settlements", "channels", "expense_categories"]);
  if (!allowed.has(table)) throw new Error("invalid table");
  const { rows } = await query(`SELECT id FROM ${table} WHERE id = $1 AND workspace_id = $2`, [id, workspaceId]);
  if (!rows[0]) throw notFound("Record not found in this workspace.");
}
