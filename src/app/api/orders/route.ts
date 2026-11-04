import { query, withTx, pageParams } from "@/lib/db";
import { getCtx, jsonBody } from "@/lib/api-helpers";
import { parseBody, orderSchema } from "@/lib/validation";
import { errorResponse } from "@/lib/errors";
import { requireWrite } from "@/lib/tenant";
import { audit, scrub } from "@/lib/audit";
export async function GET(req: Request) {
  try {
    const ctx = await getCtx(req);
    const url = new URL(req.url);
    const { limit, offset, page } = pageParams(url.searchParams);
    const q = (url.searchParams.get("q") || "").trim();
    const status = url.searchParams.get("status");
    const conds = ["workspace_id = $1"]; const params: unknown[] = [ctx.workspaceId];
    if (q) { params.push(`%${q}%`); conds.push(`(order_number ILIKE $${params.length} OR customer_name ILIKE $${params.length} OR tracking_number ILIKE $${params.length})`); }
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    const where = conds.join(" AND ");
    const { rows } = await query(`SELECT o.*, (SELECT COALESCE(SUM(quantity*unit_price-discount-refund_amount),0) FROM order_items WHERE order_id=o.id) AS line_net FROM orders o WHERE ${where} ORDER BY order_date DESC, created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    const total = (await query(`SELECT COUNT(*) AS n FROM orders WHERE ${where}`, params)).rows[0].n;
    return Response.json({ orders: rows, page, total: Number(total) });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const ctx = await getCtx(req);
    requireWrite(ctx.membership.role);
    const data = parseBody(orderSchema, await jsonBody(req));
    const order = await withTx(async (c) => {
      const o = (await c.query(`INSERT INTO orders (workspace_id, order_number, channel_name, order_date, status, payment_status, payment_method, customer_name, customer_contact, discount, shipping_charged, currency, courier_name, tracking_number, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
        [ctx.workspaceId, data.order_number, data.channel_name || null, data.order_date, data.status, data.payment_status, data.payment_method || null, data.customer_name || null, data.customer_contact || null, data.discount, data.shipping_charged, data.currency, data.courier_name || null, data.tracking_number || null, data.notes || null, ctx.user.id])).rows[0];
      for (const item of data.items) {
        let productId = item.product_id || null;
        let snapshotCost: string | null = item.unit_cost ?? null;
        if (productId) {
          const p = (await c.query("SELECT current_unit_cost FROM products WHERE id=$1 AND workspace_id=$2", [productId, ctx.workspaceId])).rows[0];
          if (p && snapshotCost === null) snapshotCost = p.current_unit_cost === null ? null : String(p.current_unit_cost);
        } else if (item.sku) {
          const p = (await c.query("SELECT id, current_unit_cost FROM products WHERE workspace_id=$1 AND sku=$2", [ctx.workspaceId, item.sku])).rows[0];
          if (p) { productId = p.id; if (snapshotCost === null) snapshotCost = p.current_unit_cost === null ? null : String(p.current_unit_cost); }
        }
        await c.query(`INSERT INTO order_items (workspace_id, order_id, product_id, sku_snapshot, product_name_snapshot, quantity, unit_price, discount, refund_amount, unit_cost_snapshot)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [ctx.workspaceId, o.id, productId, item.sku, item.product_name || null, item.quantity, item.unit_price, item.discount, item.refund_amount, snapshotCost]);
      }
      await c.query("INSERT INTO order_status_events (workspace_id, order_id, old_status, new_status, source, actor_id) VALUES ($1,$2,NULL,$3,'manual',$4)", [ctx.workspaceId, o.id, data.status, ctx.user.id]);
      return o;
    });
    await audit(ctx.workspaceId, ctx.user.id, "order_created", "order", order.id, null, scrub(order));
    return Response.json({ order }, { status: 201 });
  } catch (e: any) {
    if (e?.code === "23505") return Response.json({ error: { code: "duplicate_order_number", message: "An order with this number already exists in this workspace." } }, { status: 409 });
    return errorResponse(e);
  }
}
export const dynamic = "force-dynamic";
