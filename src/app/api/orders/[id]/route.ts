import { query, withTx } from "@/lib/db";
import { getCtx, jsonBody } from "@/lib/api-helpers";
import { errorResponse, notFound, badRequest } from "@/lib/errors";
import { requireWrite } from "@/lib/tenant";
import { audit, scrub } from "@/lib/audit";
import { weightedAverageCost } from "@/lib/profit";
async function load(ctx: any, id: string) {
  const { rows } = await query("SELECT * FROM orders WHERE id=$1 AND workspace_id=$2", [id, ctx.workspaceId]);
  if (!rows[0]) throw notFound("Order not found in this workspace.");
  const items = (await query("SELECT * FROM order_items WHERE order_id=$1 AND workspace_id=$2", [id, ctx.workspaceId])).rows;
  const events = (await query("SELECT * FROM order_status_events WHERE order_id=$1 AND workspace_id=$2 ORDER BY event_at", [id, ctx.workspaceId])).rows;
  return { ...rows[0], items, events };
}
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try { const ctx = await getCtx(req); return Response.json({ order: await load(ctx, params.id) }); } catch (e) { return errorResponse(e); }
}
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const ctx = await getCtx(req);
    requireWrite(ctx.membership.role);
    const before = await load(ctx, params.id);
    const body: any = await jsonBody(req);
    const newStatus = body.status as string | undefined;
    const valid = ["Draft","Confirmed","Processing","Shipped","Delivered","Cancelled","Return Initiated","Returned","Partially Refunded","Refunded"];
    if (newStatus && !valid.includes(newStatus)) throw badRequest("Invalid order status.");
    await withTx(async (c) => {
      if (newStatus && newStatus !== before.status) {
        await c.query("UPDATE orders SET status=$1, updated_at=now() WHERE id=$2 AND workspace_id=$3", [newStatus, params.id, ctx.workspaceId]);
        await c.query("INSERT INTO order_status_events (workspace_id, order_id, old_status, new_status, source, actor_id) VALUES ($1,$2,$3,$4,'manual',$5)", [ctx.workspaceId, params.id, before.status, newStatus, ctx.user.id]);
        if (newStatus === "Shipped") {
          // Deduct on shipped (default). Idempotent: skip if a stock-out already exists for this order.
          const existing = (await c.query("SELECT id FROM inventory_movements WHERE workspace_id=$1 AND related_order_id=$2 AND movement_type='stock-out'", [ctx.workspaceId, params.id])).rows[0];
          if (!existing) {
            const ws = (await c.query("SELECT allow_negative_stock FROM workspaces WHERE id=$1", [ctx.workspaceId])).rows[0];
            for (const item of before.items) {
              if (!item.product_id) continue;
              const p = (await c.query("SELECT on_hand FROM products WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [item.product_id, ctx.workspaceId])).rows[0];
              if (!p) continue;
              const next = Number(p.on_hand) - Number(item.quantity);
              if (next < 0 && !ws.allow_negative_stock) throw badRequest(`Insufficient stock for ${item.sku_snapshot}: ${p.on_hand} on hand, ${item.quantity} needed. Enable the owner override in Settings or add stock first.`);
              await c.query("UPDATE products SET on_hand=$1 WHERE id=$2", [next, item.product_id]);
              await c.query("INSERT INTO inventory_movements (workspace_id, product_id, movement_type, quantity_delta, unit_cost, related_order_id, reason, created_by) VALUES ($1,$2,'stock-out',$3,$4,$5,'Order shipped',$6)", [ctx.workspaceId, item.product_id, -Number(item.quantity), item.unit_cost_snapshot, params.id, ctx.user.id]);
            }
          }
        }
      }
      if (body.payment_status && !["Unpaid","Partially Paid","Paid","Refunded"].includes(body.payment_status)) throw badRequest("Invalid payment status.");
    if (body.payment_status) await c.query("UPDATE orders SET payment_status=$1, updated_at=now() WHERE id=$2 AND workspace_id=$3", [body.payment_status, params.id, ctx.workspaceId]);
      if (body.voided === true) await c.query("UPDATE orders SET voided=TRUE, void_reason=$1, updated_at=now() WHERE id=$2 AND workspace_id=$3", [body.void_reason || "Voided", params.id, ctx.workspaceId]);
    });
    await audit(ctx.workspaceId, ctx.user.id, "order_updated", "order", params.id, scrub(before), scrub(body));
    return Response.json({ order: await load(ctx, params.id) });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
