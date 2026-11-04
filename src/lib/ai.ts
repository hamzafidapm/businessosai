import { getProfitSummary, getProductProfitability, getExpenseBreakdown, getCodOutstanding, getSalesTrend, getLowStock, getDataQualityIssues, type DateRange } from "./profit";

// AI Accountant — deterministic grounded layer (PRD §6). No external LLM call here.
// The chat endpoint classifies the question into ONE OR MORE allowlisted tools below,
// runs them tenant-scoped, and explains only those numbers. If no tool matches, it
// says so and lists what it can answer — it never invents a total.
// LLM adapter (src/lib/llm.ts) is disabled by default and, if ever enabled, may only
// rephrase these tool outputs; it has no SQL access and never computes numbers.
export type ToolName = "get_profit_summary" | "get_product_profitability" | "get_expense_breakdown" | "get_cod_outstanding" | "get_sales_trend" | "get_low_stock" | "get_data_quality_issues";
export type ToolTrace = { tool: ToolName; input: Record<string, unknown>; summary: string };
function defaultRange(): DateRange {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return { from, to };
}
function extractRange(q: string): DateRange {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (/last month/i.test(q)) {
    const firstThis = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstLast = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastLast = new Date(firstThis.getTime() - 86400000);
    return { from: iso(firstLast), to: iso(lastLast) };
  }
  if (/this month/i.test(q)) return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  if (/this quarter|last quarter/i.test(q)) {
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return /last quarter/i.test(q)
      ? { from: iso(new Date(qStart.getFullYear(), qStart.getMonth() - 3, 1)), to: iso(new Date(qStart.getTime() - 86400000)) }
      : { from: iso(qStart), to: iso(now) };
  }
  return defaultRange();
}
export function classifyQuestion(q: string): ToolName[] {
  const s = q.toLowerCase();
  const tools: ToolName[] = [];
  if (/profit|sales|revenue|margin|loss|p&l|pnl/.test(s)) tools.push("get_profit_summary");
  if (/product|best|top|sku/.test(s)) tools.push("get_product_profitability");
  if (/expense|spend|advert|ad spend|cost.*categor|where.*money/.test(s)) tools.push("get_expense_breakdown");
  if (/cod|courier|outstanding|owed|receiv/.test(s)) tools.push("get_cod_outstanding");
  if (/trend|over time|month by month|daily|weekly/.test(s)) tools.push("get_sales_trend");
  if (/stock|reorder|low/.test(s)) tools.push("get_low_stock");
  if (/missing|incomplete|data quality|duplicate|unmatched/.test(s)) tools.push("get_data_quality_issues");
  if (/fall|drop|decrease|why.*profit|compared|previous/.test(s) && !tools.includes("get_profit_summary")) tools.push("get_profit_summary");
  if (/hypothetical|if .*increase|what if|scenario/.test(s)) tools.push("get_profit_summary", "get_product_profitability");
  return [...new Set(tools)];
}
export async function answerQuestion(workspaceId: string, workspaceName: string, question: string): Promise<{ answer: string; tools: ToolTrace[]; links: string[] }> {
  // Prompt-injection guard: the question is treated as data. Classification is keyword
  // matching above; no part of the question is executed, and no imported notes are
  // ever interpolated into an instruction. Tool outputs are the only source of numbers.
  const range = extractRange(question);
  const tools = classifyQuestion(question);
  const traces: ToolTrace[] = [];
  const parts: string[] = [];
  const links = ["/reports", "/dashboard"];
  const isScenario = /hypothetical|if .*increase|what if|scenario/i.test(question);
  for (const tool of tools) {
    if (tool === "get_profit_summary") {
      const s = await getProfitSummary(workspaceId, range);
      traces.push({ tool, input: { range }, summary: `netSales=${s.netSales} profit=${s.estimatedOperatingProfit} incomplete=${s.incomplete}` });
      parts.push(`For ${workspaceName} from ${range.from} to ${range.to}: net sales ${s.currency} ${s.netSales}, COGS ${s.currency} ${s.cogs}, posted expenses ${s.currency} ${Number(s.variableExpenses) + Number(s.operatingExpenses)} (variable ${s.variableExpenses}, operating ${s.operatingExpenses}), estimated operating profit ${s.currency} ${s.estimatedOperatingProfit}. Formula: net sales − COGS − variable expenses − operating expenses. Shipping charged (${s.currency} ${s.shippingCharged}) is shown separately and ${s.shippingInNet ? "included" : "not included"} in net sales. ${s.incomplete ? `Warning — Incomplete cost data: ${s.missingCostLines} order line(s) have no unit cost, so COGS and profit are understated. Add unit costs to those products/orders.` : "Cost data is complete for this period."} ${s.operatingMarginPct === null ? "Margin is N/A because net sales are zero." : `Operating margin is ${s.operatingMarginPct}%.`}`);
    } else if (tool === "get_product_profitability") {
      const rows = await getProductProfitability(workspaceId, range);
      traces.push({ tool, input: { range }, summary: `${rows.length} products` });
      if (!rows.length) parts.push("No product sales were found in this period.");
      else {
        const top = rows[0];
        parts.push(`Top product by contribution profit in ${range.from}–${range.to} is ${top.name} (${top.sku}): ${top.units} units, revenue ${top.revenue}, COGS ${top.cogs}, contribution profit ${top.contributionProfit}${top.incomplete ? " — cost data incomplete for this product." : ""}. Full ranking is on the Reports → Product profitability page.`);
        if (isScenario) parts.push("Scenario note: this is a hypothetical — I have not changed any record. To model a change, tell me the new spend and the ROAS/margin assumption, and I will apply it to these verified totals and label it as a scenario, not an actual.");
      }
    } else if (tool === "get_expense_breakdown") {
      const rows = await getExpenseBreakdown(workspaceId, range);
      traces.push({ tool, input: { range }, summary: `${rows.length} categories` });
      parts.push(rows.length
        ? `Expenses (${range.from}–${range.to}, posted only): ${rows.map((r) => `${r.category} ${r.total}`).join("; ")}. Largest category: ${rows[0].category} at ${rows[0].total}.`
        : "No posted expenses were found in this period.");
    } else if (tool === "get_cod_outstanding") {
      const rows = await getCodOutstanding(workspaceId);
      const total = rows.reduce((a, r) => a + Number(r.outstanding), 0).toFixed(2);
      traces.push({ tool, input: {}, summary: `${rows.length} open shipments, outstanding=${total}` });
      const byCourier = new Map<string, number>();
      for (const r of rows) byCourier.set(r.courier || "Unknown", (byCourier.get(r.courier || "Unknown") || 0) + Number(r.outstanding));
      parts.push(`COD still outstanding: ${total} across ${rows.length} shipment(s). By courier: ${[...byCourier.entries()].map(([k, v]) => `${k} ${v.toFixed(2)}`).join("; ") || "none"}. Aging: ${rows.map((r) => `${r.trackingNumber} ${r.agingBucket}`).join(", ") || "none"}.`);
      links.push("/cod");
    } else if (tool === "get_sales_trend") {
      const rows = await getSalesTrend(workspaceId, range, "day");
      traces.push({ tool, input: { range }, summary: `${rows.length} periods` });
      parts.push(rows.length ? `Sales trend (${range.from}–${range.to}): ${rows.slice(-7).map((r) => `${r.period} net ${r.netSales}, profit ${r.profit}`).join("; ")}.` : "No sales trend data for this period.");
    } else if (tool === "get_low_stock") {
      const rows = await getLowStock(workspaceId);
      traces.push({ tool, input: {}, summary: `${rows.length} SKUs` });
      parts.push(rows.length ? `Below reorder level: ${rows.map((r) => `${r.name} (${r.sku}) — ${r.onHand} on hand, reorder at ${r.reorderLevel}`).join("; ")}.` : "No products are below their reorder level.");
      links.push("/inventory");
    } else if (tool === "get_data_quality_issues") {
      const d = await getDataQualityIssues(workspaceId, range);
      traces.push({ tool, input: { range }, summary: d.issues.join(" | ") || "clean" });
      parts.push(d.issues.length ? `Data quality issues: ${d.issues.join(" ")}` : "No data quality issues found for this period.");
    }
  }
  if (!tools.length) {
    return {
      answer: `I can only answer from your saved records in ${workspaceName}. I can answer about profit, product profitability, expenses, COD outstanding, sales trends, low stock, and data quality — for example “What was my net profit last month?” or “How much COD is outstanding?”. I cannot create, edit, or delete records, and I will not estimate a total that has no source record.`,
      tools: [], links: ["/reports", "/dashboard"],
    };
  }
  return {
    answer: parts.join("\n\n") + "\n\nThese figures come from your saved records only (not an external source), use the formulas on the Reports page, and are actuals unless labelled as a scenario. Tax figures, if any, are estimates only — confirm with a qualified tax professional.",
    tools: traces, links: [...new Set(links)],
  };
}
