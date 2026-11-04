import { query, withTx, pageParams } from "@/lib/db";
import { getCtx, jsonBody } from "@/lib/api-helpers";
import { parseBody, inventoryMovementSchema } from "@/lib/validation";
import { errorResponse, badRequest } from "@/lib/errors";
import { requireWrite } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { weightedAverageCost } from "@/lib/profit";
export async function GET(req: Request) {
  try {
    const ctx = await getCtx(req);
    const { limit, offset, page } = pageParams(new URL(req.url).searchParams);
    const products = (await query("SELECT id, sku, name, on_hand, reorder_level, current_unit_cost, (on_hand * COALESCE(current_unit_cost,0)) AS est_value FROM products WHERE workspace_id=$1 ORDER BY sku", [ctx.workspaceId])).rows;
    const { rows: movements } = await query("SELECT m.*, p.sku FROM inventory_movements m JOIN products p ON p.id=m.product_id WHERE m.workspace_id=$1 ORDER BY m.movement_at DESC LIMIT $2 OFFSET $3", [ctx.workspaceId, limit, offset]);
    return Response.json({ products, movements, page, lowStock: products.filter((p: any) => Number(p.on_hand) <= Number(p.reorder_level)) });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const ctx = await getCtx(req);
    requireWrite(ctx.membership.role);
    const data = parseBody(inventoryMovementSchema, await jsonBody(req));
    const result = await withTx(async (c) => {
      const p = (await c.query("SELECT * FROM products WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [data.product_id, ctx.workspaceId])).rows[0];
      if (!p) throw badRequest("Product not found in this workspace.");
      const ws = (await c.query("SELECT allow_negative_stock FROM workspaces WHERE id=$1", [ctx.workspaceId])).rows[0];
      const next = Number(p.on_hand) + data.quantity_delta;
      const override = next < 0 && ws.allow_negative_stock;
      if (next < 0 && !override) throw badRequest(`This would take ${p.sku} below zero (${p.on_hand} on hand). Add stock first or enable the owner override in Settings.`);
      let newAvg = p.current_unit_cost === null ? null : String(p.current_unit_cost);
      if (data.movement_type === "stock-in" && data.unit_cost && data.quantity_delta > 0) {
        newAvg = weightedAverageCost(Number(p.on_hand), p.current_unit_cost === null ? "0" : String(p.current_unit_cost), data.quantity_delta, data.unit_cost);
        await c.query("UPDATE products SET on_hand=$1, current_unit_cost=$2 WHERE id=$3", [next, newAvg, data.product_id]);
        await c.query("INSERT INTO product_cost_history (workspace_id, product_id, unit_cost, source, created_by) VALUES ($1,$2,$3,'inventory',$4)", [ctx.workspaceId, data.product_id, newAvg, ctx.user.id]);
      } else {
        await c.query("UPDATE products SET on_hand=$1 WHERE id=$2", [next, data.product_id]);
      }
      const mov = (await c.query("INSERT INTO inventory_movements (workspace_id, product_id, variant_id, movement_type, quantity_delta, unit_cost, related_order_id, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [ctx.workspaceId, data.product_id, null, data.movement_type, data.quantity_delta, data.unit_cost || null, data.related_order_id || null, data.reason, ctx.user.id])).rows[0];
      return { movement: mov, onHand: next, newAvg, override };
    });
    await audit(ctx.workspaceId, ctx.user.id, "inventory_movement", "inventory_movement", result.movement.id, null, { product_id: data.product_id, type: data.movement_type, delta: data.quantity_delta, override: result.override });
    return Response.json(result, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
