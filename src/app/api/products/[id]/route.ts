import { query } from "@/lib/db";
import { getCtx, jsonBody } from "@/lib/api-helpers";
import { errorResponse, notFound } from "@/lib/errors";
import { requireWrite } from "@/lib/tenant";
import { audit, scrub } from "@/lib/audit";
async function load(ctx: any, id: string) {
  const { rows } = await query("SELECT * FROM products WHERE id=$1 AND workspace_id=$2", [id, ctx.workspaceId]);
  if (!rows[0]) throw notFound("Product not found in this workspace.");
  return rows[0];
}
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getCtx(req);
    const product = await load(ctx, params.id);
    const history = (await query("SELECT * FROM product_cost_history WHERE workspace_id=$1 AND product_id=$2 ORDER BY effective_from DESC LIMIT 50", [ctx.workspaceId, params.id])).rows;
    const variants = (await query("SELECT * FROM product_variants WHERE workspace_id=$1 AND product_id=$2", [ctx.workspaceId, params.id])).rows;
    return Response.json({ product, costHistory: history, variants });
  } catch (e) { return errorResponse(e); }
}
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getCtx(req);
    requireWrite(ctx.membership.role);
    const before = await load(ctx, params.id);
    const body: any = await jsonBody(req);
    const allowed = ["name","category","selling_price","current_unit_cost","reorder_level","active","image_url","notes"];
    const updates: Record<string, unknown> = {};
    for (const k of allowed) if (body[k] !== undefined) updates[k] = body[k];
    if (Object.keys(updates).length) {
      const keys = Object.keys(updates);
      await query(`UPDATE products SET ${keys.map((k, i) => `${k} = $${i + 3}`).join(", ")}, updated_at = now() WHERE id = $1 AND workspace_id = $2`, [params.id, ctx.workspaceId, ...keys.map((k) => updates[k])]);
      if (updates.current_unit_cost !== undefined && updates.current_unit_cost !== null && String(updates.current_unit_cost) !== String(before.current_unit_cost)) {
        await query("INSERT INTO product_cost_history (workspace_id, product_id, unit_cost, source, created_by) VALUES ($1,$2,$3,'manual',$4)", [ctx.workspaceId, params.id, updates.current_unit_cost, ctx.user.id]);
      }
    }
    await audit(ctx.workspaceId, ctx.user.id, "product_updated", "product", params.id, scrub(before), scrub(updates));
    const after = await load(ctx, params.id);
    return Response.json({ product: after });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
