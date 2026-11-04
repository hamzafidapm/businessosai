import { query } from "@/lib/db";
import { getCtx, jsonBody } from "@/lib/api-helpers";
import { errorResponse, notFound } from "@/lib/errors";
import { requireWrite } from "@/lib/tenant";
import { audit, scrub } from "@/lib/audit";
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getCtx(req);
    requireWrite(ctx.membership.role);
    const before = (await query("SELECT * FROM expenses WHERE id=$1 AND workspace_id=$2", [params.id, ctx.workspaceId])).rows[0];
    if (!before) throw notFound("Expense not found in this workspace.");
    const body: any = await jsonBody(req);
    const updates: Record<string, unknown> = {};
    for (const k of ["amount","payee","payment_method","reference","notes","status","category_name"]) if (body[k] !== undefined) updates[k] = body[k];
    if (body.status === "Void" && !body.void_reason && !before.notes) updates.notes = "Voided";
    if (updates.category_name) {
      const cat = (await query("SELECT id FROM expense_categories WHERE workspace_id=$1 AND name=$2", [ctx.workspaceId, updates.category_name])).rows[0];
      updates.category_id = cat ? cat.id : (await query("INSERT INTO expense_categories (workspace_id, name, category_type) VALUES ($1,$2,'operating') RETURNING id", [ctx.workspaceId, updates.category_name])).rows[0].id;
    }
    if (Object.keys(updates).length) {
      const keys = Object.keys(updates);
      await query(`UPDATE expenses SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(", ")}, updated_at=now() WHERE id=$1 AND workspace_id=$2`, [params.id, ctx.workspaceId, ...keys.map((k) => updates[k])]);
    }
    await audit(ctx.workspaceId, ctx.user.id, body.status === "Void" ? "expense_voided" : "expense_updated", "expense", params.id, scrub(before), scrub(updates));
    const after = (await query("SELECT * FROM expenses WHERE id=$1 AND workspace_id=$2", [params.id, ctx.workspaceId])).rows[0];
    return Response.json({ expense: after });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
