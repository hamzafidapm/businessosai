import { query, withTx, pageParams } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { parseBody, workspaceSchema } from "@/lib/validation";
import { jsonBody } from "@/lib/api-helpers";
import { errorResponse } from "@/lib/errors";
import { audit } from "@/lib/audit";
const DEFAULT_CATEGORIES = [
  ["Advertising","variable"],["Courier/Shipping","variable"],["Packaging","operating"],["Rent","operating"],
  ["Salaries/Contractors","operating"],["Software/Subscriptions","operating"],["Utilities","operating"],
  ["Bank/Payment Fees","variable"],["Taxes/Fees","tax"],["Other","other"],
];
const DEFAULT_CHANNELS = ["Shopify","Daraz","Instagram","Facebook","WhatsApp","Own Website","Other"];
export async function GET() {
  try {
    const user = await requireUser();
    const { rows } = await query(`SELECT w.*, COALESCE((SELECT plan_code FROM subscriptions s WHERE s.workspace_id=w.id ORDER BY s.created_at DESC LIMIT 1),'free') AS plan_code,
      (SELECT role FROM workspace_members WHERE workspace_id=w.id AND user_id=$1) AS role
      FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE m.user_id=$1 AND m.status='active' ORDER BY w.created_at`, [user.id]);
    return Response.json({ workspaces: rows });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const data = parseBody(workspaceSchema, await jsonBody(req));
    const ws = await withTx(async (c) => {
      const w = (await c.query("INSERT INTO workspaces (name, country, default_currency, timezone, business_type, owner_user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *", [data.name, data.country, data.default_currency, data.timezone, data.business_type || null, user.id])).rows[0];
      await c.query("INSERT INTO workspace_members (workspace_id, user_id, role, status, joined_at) VALUES ($1,$2,'owner','active',now())", [w.id, user.id]);
      await c.query("INSERT INTO subscriptions (workspace_id, plan_code) VALUES ($1,'free')", [w.id]);
      for (const [name, type] of DEFAULT_CATEGORIES) await c.query("INSERT INTO expense_categories (workspace_id, name, category_type) VALUES ($1,$2,$3)", [w.id, name, type]);
      for (const ch of DEFAULT_CHANNELS) await c.query("INSERT INTO channels (workspace_id, name, channel_type) VALUES ($1,$2,$3)", [w.id, ch, ch]);
      return w;
    });
    await audit(ws.id, user.id, "workspace_created", "workspace", ws.id, null, { name: ws.name });
    return Response.json({ workspace: ws }, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
