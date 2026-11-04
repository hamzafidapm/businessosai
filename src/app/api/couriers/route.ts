import { query } from "@/lib/db";
import { getCtx, jsonBody } from "@/lib/api-helpers";
import { parseBody, courierSchema } from "@/lib/validation";
import { errorResponse } from "@/lib/errors";
import { requireWrite } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { maskReference } from "@/lib/auth";
export async function GET(req: Request) {
  try { const ctx = await getCtx(req); const { rows } = await query("SELECT * FROM couriers WHERE workspace_id=$1 ORDER BY name", [ctx.workspaceId]); return Response.json({ couriers: rows }); } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const ctx = await getCtx(req); requireWrite(ctx.membership.role);
    const data = parseBody(courierSchema, await jsonBody(req));
    const row = (await query("INSERT INTO couriers (workspace_id, name, account_reference_masked, contact_notes, active) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [ctx.workspaceId, data.name, data.account_reference_masked ? maskReference(data.account_reference_masked) : null, data.contact_notes || null, data.active])).rows[0];
    await audit(ctx.workspaceId, ctx.user.id, "courier_created", "courier", row.id, null, { name: row.name });
    return Response.json({ courier: row }, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
