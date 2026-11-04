import { query, pageParams } from "@/lib/db";
import { getCtx, jsonBody } from "@/lib/api-helpers";
import { parseBody, productSchema } from "@/lib/validation";
import { errorResponse } from "@/lib/errors";
import { requireWrite } from "@/lib/tenant";
import { audit, scrub } from "@/lib/audit";
export async function GET(req: Request) {
  try {
    const ctx = await getCtx(req);
    const url = new URL(req.url);
    const { limit, offset, page } = pageParams(url.searchParams);
    const q = (url.searchParams.get("q") || "").trim();
    const active = url.searchParams.get("active");
    const conds = ["workspace_id = $1"]; const params: unknown[] = [ctx.workspaceId];
    if (q) { params.push(`%${q}%`); conds.push(`(sku ILIKE $${params.length} OR name ILIKE $${params.length})`); }
    if (active === "true" || active === "false") { params.push(active === "true"); conds.push(`active = $${params.length}`); }
    const where = conds.join(" AND ");
    const { rows } = await query(`SELECT * FROM products WHERE ${where} ORDER BY name LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    const total = (await query(`SELECT COUNT(*) AS n FROM products WHERE ${where}`, params)).rows[0].n;
    return Response.json({ products: rows, page, total: Number(total) });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const ctx = await getCtx(req);
    requireWrite(ctx.membership.role);
    const data = parseBody(productSchema, await jsonBody(req));
    const onHand = data.on_hand ?? data.opening_stock ?? 0;
    const unitCost = data.current_unit_cost ?? (Number(data.purchase_cost) + Number(data.packaging_cost) + Number(data.other_direct_cost) || null);
    const row = (await query(`INSERT INTO products (workspace_id, sku, name, category, selling_price, current_unit_cost, purchase_cost, packaging_cost, other_direct_cost, opening_stock, on_hand, reorder_level, active, image_url, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [ctx.workspaceId, data.sku, data.name, data.category || null, data.selling_price, unitCost, data.purchase_cost, data.packaging_cost, data.other_direct_cost, data.opening_stock, onHand, data.reorder_level, data.active, data.image_url || null, data.notes || null, ctx.user.id])).rows[0];
    if (unitCost !== null) await query("INSERT INTO product_cost_history (workspace_id, product_id, unit_cost, source, created_by) VALUES ($1,$2,$3,'manual',$4)", [ctx.workspaceId, row.id, unitCost, ctx.user.id]);
    if (onHand > 0) await query("INSERT INTO inventory_movements (workspace_id, product_id, movement_type, quantity_delta, unit_cost, reason, created_by) VALUES ($1,$2,'stock-in',$3,$4,'Opening stock',$5)", [ctx.workspaceId, row.id, onHand, unitCost, ctx.user.id]);
    await audit(ctx.workspaceId, ctx.user.id, "product_created", "product", row.id, null, scrub(row));
    return Response.json({ product: row }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "23505") return Response.json({ error: { code: "duplicate_sku", message: "A product with this SKU already exists in this workspace." } }, { status: 409 });
    return errorResponse(e);
  }
}
export const dynamic = "force-dynamic";
