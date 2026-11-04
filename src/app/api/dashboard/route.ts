import { query } from "@/lib/db";
import { getCtx, rangeFrom } from "@/lib/api-helpers";
import { getProfitSummary, getProductProfitability, getSalesTrend, getCodOutstanding, getLowStock, getDataQualityIssues } from "@/lib/profit";
import { errorResponse } from "@/lib/errors";
import { D, moneyStr } from "@/lib/money";
export async function GET(req: Request) {
  try {
    const ctx = await getCtx(req);
    const range = rangeFrom(new URL(req.url));
    const [summary, topProducts, trend, cod, lowStock, quality] = await Promise.all([
      getProfitSummary(ctx.workspaceId, range),
      getProductProfitability(ctx.workspaceId, range),
      getSalesTrend(ctx.workspaceId, range, "day"),
      getCodOutstanding(ctx.workspaceId),
      getLowStock(ctx.workspaceId),
      getDataQualityIssues(ctx.workspaceId, range),
    ]);
    const orderCounts = (await query("SELECT status, COUNT(*) AS n FROM orders WHERE workspace_id=$1 AND order_date BETWEEN $2 AND $3 GROUP BY status", [ctx.workspaceId, range.from, range.to])).rows;
    const inv = (await query("SELECT COALESCE(SUM(on_hand * COALESCE(current_unit_cost,0)),0) AS v FROM products WHERE workspace_id=$1 AND active=TRUE", [ctx.workspaceId])).rows[0];
    const codTotal = cod.reduce((a: any, r: any) => a + Number(r.outstanding), 0).toFixed(2);
    const alerts: string[] = [];
    if (summary.incomplete) alerts.push(`Incomplete cost data: ${summary.missingCostLines} order line(s) have no unit cost. Profit is understated until costs are added.`);
    if (lowStock.length) alerts.push(`${lowStock.length} product(s) at or below reorder level.`);
    if (quality.unmatchedSettlementLines) alerts.push(`${quality.unmatchedSettlementLines} settlement line(s) unmatched.`);
    if (Number(codTotal) > 0) alerts.push(`PKR ${codTotal} COD outstanding.`);
    return Response.json({ summary, topProducts: topProducts.slice(0, 10), trend, codOutstandingTotal: codTotal, cod, inventoryValue: moneyStr(inv.v), inventoryValueLabel: "Estimate (on-hand × weighted-average cost)", orderCounts, lowStock, dataQuality: quality, alerts, range, currency: summary.currency, note: "Figures are based on entered/imported data only." });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
