import { query } from "@/lib/db";
import { getCtx, rangeFrom } from "@/lib/api-helpers";
import { getProfitSummary, getProductProfitability, getExpenseBreakdown, getCodOutstanding, getSalesTrend, getLowStock } from "@/lib/profit";
import { errorResponse } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { D } from "@/lib/money";
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}
export async function GET(req: Request) {
  try {
    const ctx = await getCtx(req);
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "pl";
    const format = url.searchParams.get("format") || "json";
    const range = rangeFrom(url);
    let rows: Record<string, unknown>[] = []; let title = type;
    if (type === "pl") {
      const s = await getProfitSummary(ctx.workspaceId, range);
      rows = [{ period: `${range.from} to ${range.to}`, gross_sales: s.grossSales, discounts: s.discounts, refunds: s.refunds, net_sales: s.netSales, shipping_charged_separate: s.shippingCharged, cogs: s.cogs, gross_profit: s.grossProfit, variable_expenses: s.variableExpenses, operating_expenses: s.operatingExpenses, contribution_profit: s.contributionProfit, estimated_operating_profit: s.estimatedOperatingProfit, gross_margin_pct: s.grossMarginPct, operating_margin_pct: s.operatingMarginPct, incomplete_cost_data: s.incomplete }];
      title = "Profit and Loss";
    } else if (type === "sales") {
      const { rows: r } = await query("SELECT o.order_number, o.order_date, o.channel_name, o.status, o.payment_status, oi.sku_snapshot, oi.quantity, oi.unit_price, oi.discount, oi.refund_amount FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.workspace_id=$1 AND o.order_date BETWEEN $2 AND $3 AND o.voided=FALSE ORDER BY o.order_date", [ctx.workspaceId, range.from, range.to]);
      rows = r; title = "Sales report";
    } else if (type === "expenses") {
      const { rows: r } = await query("SELECT expense_date, category_name, payee, amount, payment_method, status FROM expenses WHERE workspace_id=$1 AND expense_date BETWEEN $2 AND $3 ORDER BY expense_date", [ctx.workspaceId, range.from, range.to]);
      rows = r; title = "Expense report";
    } else if (type === "products") {
      rows = await getProductProfitability(ctx.workspaceId, range); title = "Product profitability";
    } else if (type === "cod") {
      rows = await getCodOutstanding(ctx.workspaceId); title = "COD outstanding";
    } else if (type === "inventory") {
      const { rows: r } = await query("SELECT sku, name, on_hand, reorder_level, current_unit_cost, (on_hand * COALESCE(current_unit_cost,0)) AS est_value FROM products WHERE workspace_id=$1 ORDER BY sku", [ctx.workspaceId]);
      rows = r; title = "Inventory report";
    } else if (type === "tax") {
      const tax = (await query("SELECT * FROM tax_profiles WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 1", [ctx.workspaceId])).rows[0] || null;
      const exp = await getExpenseBreakdown(ctx.workspaceId, range);
      rows = [{ notice: "Estimates only — not tax or legal advice. Confirm with a qualified Pakistani tax professional.", tax_year: tax?.tax_year || null, business_type: tax?.business_type || null, configuration: JSON.stringify(tax?.configuration_json || {}), expense_breakdown: JSON.stringify(exp) }];
      title = "Tax summary (estimate only)";
    } else if (type === "trend") {
      rows = await getSalesTrend(ctx.workspaceId, range, "day"); title = "Sales trend";
    }
    await audit(ctx.workspaceId, ctx.user.id, "report_exported", "report", type, null, { format, range });
    if (format === "csv") return new Response(toCsv(rows), { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${type}.csv"` } });
    if (format === "xlsx") {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      wb.SheetNames.push(title);
      wb.Sheets[title] = XLSX.utils.json_to_sheet(rows);
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      return new Response(buf as any, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${type}.xlsx"` } });
    }
    if (format === "pdf") {
      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ margin: 40 });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
      doc.fontSize(16).text(`BusinessOS AI — ${title}`, { underline: true });
      doc.fontSize(10).text(`Workspace report • ${range.from} to ${range.to} • Generated ${new Date().toISOString().slice(0, 10)}`);
      doc.moveDown();
      if (type === "tax") doc.text("Estimates only — not tax or legal advice. Confirm with a qualified Pakistani tax professional.");
      for (const row of rows.slice(0, 200)) doc.fontSize(9).text(Object.entries(row).map(([k, v]) => `${k}: ${v}`).join(" | "));
      doc.end();
      const buf = await done;
      return new Response(buf as any, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${type}.pdf"` } });
    }
    return Response.json({ type, title, range, rows });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
