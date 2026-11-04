import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireMembership, canManageSettings, forbidden } from "@/lib/tenant";
import { jsonBody } from "@/lib/api-helpers";
import { errorResponse } from "@/lib/errors";
import { audit, scrub } from "@/lib/audit";
// GET workspace settings, PATCH settings (owner/admin only), POST invite handled in /members below.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const m = await requireMembership(user.id, params.id);
    const { rows } = await query("SELECT * FROM workspaces WHERE id = $1", [params.id]);
    const members = (await query("SELECT m.role, m.status, u.name, u.email FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 ORDER BY m.role", [params.id])).rows;
    const tax = (await query("SELECT * FROM tax_profiles WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 1", [params.id])).rows[0] || null;
    return Response.json({ workspace: rows[0], role: m.role, members, taxProfile: tax });
  } catch (e) { return errorResponse(e); }
}
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const m = await requireMembership(user.id, params.id);
    if (!canManageSettings(m.role)) throw forbidden("Only owners/admins can change workspace settings.");
    const body: any = await jsonBody(req);
    const before = (await query("SELECT * FROM workspaces WHERE id=$1", [params.id])).rows[0];
    const fields: Record<string, unknown> = {};
    if (typeof body.name === "string") fields.name = body.name.slice(0, 150);
    if (typeof body.shipping_in_net_sales === "boolean") fields.shipping_in_net_sales = body.shipping_in_net_sales;
    if (typeof body.allow_negative_stock === "boolean") fields.allow_negative_stock = body.allow_negative_stock;
    if (typeof body.timezone === "string") fields.timezone = body.timezone.slice(0, 80);
    const keys = Object.keys(fields);
    if (keys.length) {
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
      await query(`UPDATE workspaces SET ${sets}, updated_at = now() WHERE id = $1`, [params.id, ...keys.map((k) => fields[k])]);
    }
    if (body.taxProfile) {
      const t = body.taxProfile;
      await query("INSERT INTO tax_profiles (workspace_id, tax_year, business_type, registration_status, configuration_json, rules_version) VALUES ($1,$2,$3,$4,$5::jsonb, COALESCE((SELECT MAX(rules_version)+1 FROM tax_profiles WHERE workspace_id=$1),1))",
        [params.id, String(t.tax_year || new Date().getFullYear()), t.business_type || null, t.registration_status || null, JSON.stringify(t.configuration_json || {})]);
    }
    await audit(params.id, user.id, "workspace_settings_changed", "workspace", params.id, scrub(before), scrub(fields));
    const after = (await query("SELECT * FROM workspaces WHERE id=$1", [params.id])).rows[0];
    return Response.json({ workspace: after });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
