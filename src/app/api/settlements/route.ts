import { query, withTx, pageParams } from "@/lib/db";
import { getCtx, jsonBody } from "@/lib/api-helpers";
import { parseBody, settlementSchema } from "@/lib/validation";
import { errorResponse } from "@/lib/errors";
import { requireWrite } from "@/lib/tenant";
import { audit } from "@/lib/audit";
import { classifyCod } from "@/lib/profit";
import { D, moneyStr } from "@/lib/money";
export async function GET(req: Request) {
  try {
    const ctx = await getCtx(req);
    const { limit, offset, page } = pageParams(new URL(req.url).searchParams);
    const { rows } = await query("SELECT s.*, c.name AS courier_name FROM settlements s LEFT JOIN couriers c ON c.id=s.courier_id WHERE s.workspace_id=$1 ORDER BY s.created_at DESC LIMIT $2 OFFSET $3", [ctx.workspaceId, limit, offset]);
    const withLines = [];
    for (const s of rows) {
      const lines = (await query("SELECT * FROM settlement_lines WHERE settlement_id=$1 AND workspace_id=$2", [s.id, ctx.workspaceId])).rows;
      withLines.push({ ...s, lines });
    }
    return Response.json({ settlements: withLines, page });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const ctx = await getCtx(req); requireWrite(ctx.membership.role);
    const data = parseBody(settlementSchema, await jsonBody(req));
    const settlement = await withTx(async (c) => {
      const s = (await c.query("INSERT INTO settlements (workspace_id, courier_id, reference, statement_date, payout_date, gross_amount, deductions, net_amount, bank_reference) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
        [ctx.workspaceId, data.courier_id || null, data.reference, data.statement_date || null, data.payout_date || null, data.gross_amount, data.deductions, data.net_amount, data.bank_reference || null])).rows[0];
      const seen = new Set<string>();
      for (const line of data.lines) {
        const key = `${line.tracking_number || ""}|${line.order_number || ""}`;
        const duplicate = seen.has(key) && key !== "|";
        seen.add(key);
        let shipment: any = null;
        if (line.tracking_number) shipment = (await c.query("SELECT * FROM shipments WHERE workspace_id=$1 AND tracking_number=$2", [ctx.workspaceId, line.tracking_number])).rows[0];
        if (!shipment && line.order_number) shipment = (await c.query("SELECT s.* FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.workspace_id=$1 AND o.order_number=$2", [ctx.workspaceId, line.order_number])).rows[0];
        const expected = shipment ? String(shipment.expected_cod) : "0";
        const cls = shipment ? classifyCod(expected, line.amount, duplicate) : { status: "Unmatched" as const, difference: moneyStr(D(line.amount).minus(0)) };
        await c.query("INSERT INTO settlement_lines (workspace_id, settlement_id, tracking_number, order_number, amount, fee, matched_shipment_id, match_status, difference) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
          [ctx.workspaceId, s.id, line.tracking_number || null, line.order_number || null, line.amount, line.fee, shipment?.id || null, cls.status, cls.difference]);
      }
      return s;
    });
    await audit(ctx.workspaceId, ctx.user.id, "settlement_created", "settlement", settlement.id, null, { reference: settlement.reference });
    const lines = (await query("SELECT * FROM settlement_lines WHERE settlement_id=$1", [settlement.id])).rows;
    return Response.json({ settlement: { ...settlement, lines } }, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
