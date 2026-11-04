import { query, pageParams } from "@/lib/db";
import { getCtx, jsonBody } from "@/lib/api-helpers";
import { parseBody, shipmentSchema } from "@/lib/validation";
import { errorResponse } from "@/lib/errors";
import { requireWrite } from "@/lib/tenant";
import { audit } from "@/lib/audit";
export async function GET(req: Request) {
  try {
    const ctx = await getCtx(req);
    const { limit, offset, page } = pageParams(new URL(req.url).searchParams);
    const { rows } = await query("SELECT s.*, c.name AS courier_name, o.order_number FROM shipments s LEFT JOIN couriers c ON c.id=s.courier_id LEFT JOIN orders o ON o.id=s.order_id WHERE s.workspace_id=$1 ORDER BY s.created_at DESC LIMIT $2 OFFSET $3", [ctx.workspaceId, limit, offset]);
    return Response.json({ shipments: rows, page });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const ctx = await getCtx(req); requireWrite(ctx.membership.role);
    const data = parseBody(shipmentSchema, await jsonBody(req));
    if (data.courier_id) { const c = (await query("SELECT id FROM couriers WHERE id=$1 AND workspace_id=$2", [data.courier_id, ctx.workspaceId])).rows[0]; if (!c) throw new Error("Courier not found in this workspace."); }
    if (data.order_id) { const o = (await query("SELECT id FROM orders WHERE id=$1 AND workspace_id=$2", [data.order_id, ctx.workspaceId])).rows[0]; if (!o) throw new Error("Order not found in this workspace."); }
    const row = (await query("INSERT INTO shipments (workspace_id, order_id, courier_id, tracking_number, expected_cod, shipping_fee, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [ctx.workspaceId, data.order_id || null, data.courier_id || null, data.tracking_number, data.expected_cod, data.shipping_fee, data.status])).rows[0];
    await audit(ctx.workspaceId, ctx.user.id, "shipment_created", "shipment", row.id, null, { tracking: row.tracking_number });
    return Response.json({ shipment: row }, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
