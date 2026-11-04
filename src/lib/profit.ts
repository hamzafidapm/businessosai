import Decimal from "decimal.js";
import { D, moneyStr } from "./money";
import { query } from "./db";

// ── THE single profit engine. Dashboard, reports and AI tools all call this file
// and nothing else for financial totals. Changing a formula here changes it everywhere.
// Definitions (PRD §7/§22, defaults documented in README):
//   line gross = qty × unit_price
//   line net   = line gross − line discount − line refund
//   net sales  = Σ line net − order discount (+ shipping charged ONLY if the workspace
//                flag shipping_in_net_sales is true; default false — shown separately)
//   COGS       = Σ sold qty × unit_cost_snapshot (historic snapshot, never current cost)
//   gross profit        = net sales − COGS
//   contribution profit  = gross profit − variable expenses (ads/courier/fees, posted,
//                          not flagged already_included_in_order_cost)
//   estimated operating profit = contribution profit − operating expenses (posted, same guard)
//   margin %   = profit ÷ net sales × 100; null when net sales is 0
// Cancelled and voided orders are excluded from sales. Draft orders are included in
// counts but excluded from profit totals (they are not yet sales) — see summary below.
// Voided expenses are excluded; Draft expenses are excluded (only Posted count).

export type OrderLineInput = {
  quantity: number; unit_price: string; discount?: string | null; refund_amount?: string | null;
  unit_cost_snapshot?: string | null; sku_snapshot?: string; product_name_snapshot?: string | null; product_id?: string | null;
};
export type OrderInput = {
  id?: string; order_number?: string; status: string; discount?: string | null;
  shipping_charged?: string | null; lines: OrderLineInput[];
};
export type ExpenseInput = { amount: string; category_type: string; already_included_in_order_cost?: boolean };

export function lineGross(l: OrderLineInput): Decimal { return D(l.unit_price).times(l.quantity); }
export function lineNet(l: OrderLineInput): Decimal {
  return lineGross(l).minus(D(l.discount)).minus(D(l.refund_amount));
}
export function lineCogs(l: OrderLineInput, soldQty?: number): Decimal {
  if (l.unit_cost_snapshot === null || l.unit_cost_snapshot === undefined) return new Decimal(0);
  return D(l.unit_cost_snapshot).times(soldQty ?? l.quantity);
}
export function orderNetSales(o: OrderInput, shippingInNet: boolean): Decimal {
  let net = o.lines.reduce((acc, l) => acc.plus(lineNet(l)), new Decimal(0));
  net = net.minus(D(o.discount));
  if (shippingInNet) net = net.plus(D(o.shipping_charged));
  return net;
}
export function orderCogs(o: OrderInput): Decimal {
  // Returned orders: COGS is reversed only when goods are restocked. That reversal is
  // recorded as a return-to-stock inventory movement and handled by the caller passing
  // sold quantities; at summary level, Returned/Refunded orders keep their original COGS
  // but their refunds already reduce net sales, so profit falls by the refund — the
  // restock reversal is applied explicitly in inventory, not silently here.
  return o.lines.reduce((acc, l) => acc.plus(lineCogs(l)), new Decimal(0));
}
export function isSaleForProfit(status: string): boolean {
  // Draft/Cancelled are not sales yet / never were. Everything else that reached a
  // customer-facing stage counts; refunds reduce net via refund_amount.
  return !["Draft", "Cancelled"].includes(status);
}
export type Summary = {
  grossSales: string; netSales: string; shippingCharged: string; discounts: string; refunds: string;
  cogs: string; grossProfit: string; variableExpenses: string; operatingExpenses: string;
  contributionProfit: string; estimatedOperatingProfit: string;
  grossMarginPct: string | null; operatingMarginPct: string | null;
  orderCount: number; missingCostLines: number; incomplete: boolean;
};
export function computeSummary(orders: OrderInput[], expenses: ExpenseInput[], shippingInNet: boolean): Summary {
  let gross = new Decimal(0), net = new Decimal(0), shipping = new Decimal(0);
  let discounts = new Decimal(0), refunds = new Decimal(0), cogs = new Decimal(0), missing = 0, count = 0;
  for (const o of orders) {
    if (!isSaleForProfit(o.status)) continue;
    count += 1;
    shipping = shipping.plus(D(o.shipping_charged));
    for (const l of o.lines) {
      gross = gross.plus(lineGross(l));
      discounts = discounts.plus(D(l.discount));
      refunds = refunds.plus(D(l.refund_amount));
      if (l.unit_cost_snapshot === null || l.unit_cost_snapshot === undefined) missing += 1;
      else cogs = cogs.plus(lineCogs(l));
    }
    discounts = discounts.plus(D(o.discount));
    net = net.plus(orderNetSales(o, shippingInNet));
  }
  let variable = new Decimal(0), operating = new Decimal(0);
  for (const e of expenses) {
    if (e.already_included_in_order_cost) continue; // double-count protection (PRD §5.4)
    if (e.category_type === "variable") variable = variable.plus(D(e.amount));
    else operating = operating.plus(D(e.amount));
  }
  const grossProfit = net.minus(cogs);
  const contribution = grossProfit.minus(variable);
  const operatingProfit = contribution.minus(operating);
  const margin = (p: Decimal) => (net.isZero() ? null : p.div(net).times(100).toDecimalPlaces(2).toFixed(2));
  return {
    grossSales: moneyStr(gross), netSales: moneyStr(net), shippingCharged: moneyStr(shipping),
    discounts: moneyStr(discounts), refunds: moneyStr(refunds), cogs: moneyStr(cogs),
    grossProfit: moneyStr(grossProfit), variableExpenses: moneyStr(variable),
    operatingExpenses: moneyStr(operating), contributionProfit: moneyStr(contribution),
    estimatedOperatingProfit: moneyStr(operatingProfit),
    grossMarginPct: margin(grossProfit), operatingMarginPct: margin(operatingProfit),
    orderCount: count, missingCostLines: missing, incomplete: missing > 0,
  };
}
// Weighted-average cost (PRD §5.6): newAvg = (oldQty×oldAvg + inQty×inCost) / (oldQty+inQty).
export function weightedAverageCost(oldQty: number, oldAvg: string, inQty: number, inCost: string): string {
  const total = oldQty + inQty;
  if (total <= 0) return moneyStr(inCost);
  return moneyStr(D(oldAvg).times(oldQty).plus(D(inCost).times(inQty)).div(total));
}
// COD matching (PRD §5.5). Pure so it is unit-testable without a DB.
export type CodOutcome = "Matched" | "Partial" | "Unmatched" | "Short Paid" | "Overpaid" | "Duplicate Candidate";
export function classifyCod(expected: string, received: string, duplicate = false): { status: CodOutcome; difference: string } {
  const diff = D(received).minus(D(expected));
  if (duplicate) return { status: "Duplicate Candidate", difference: moneyStr(diff) };
  if (D(received).isZero()) return { status: "Unmatched", difference: moneyStr(diff) };
  if (diff.isZero()) return { status: "Matched", difference: "0.00" };
  return { status: diff.isNegative() ? "Short Paid" : "Overpaid", difference: moneyStr(diff) };
}
export function codAgingBucket(days: number): string {
  if (days <= 7) return "0–7 days";
  if (days <= 14) return "8–14 days";
  if (days <= 30) return "15–30 days";
  return "30+ days";
}

// ── DB-backed queries. All are workspace-scoped; date range is inclusive on order_date / expense_date.
export type DateRange = { from: string; to: string };
export async function workspaceFlags(workspaceId: string): Promise<{ shippingInNet: boolean; currency: string }> {
  const { rows } = await query("SELECT shipping_in_net_sales, default_currency FROM workspaces WHERE id = $1", [workspaceId]);
  return { shippingInNet: rows[0]?.shipping_in_net_sales ?? false, currency: rows[0]?.default_currency ?? "PKR" };
}
export async function fetchOrdersWithLines(workspaceId: string, range: DateRange) {
  const { rows: orders } = await query(
    `SELECT id, order_number, status, discount, shipping_charged FROM orders
     WHERE workspace_id = $1 AND order_date BETWEEN $2 AND $3 AND voided = FALSE ORDER BY order_date`,
    [workspaceId, range.from, range.to]);
  if (!orders.length) return [];
  const { rows: lines } = await query(
    `SELECT order_id, product_id, sku_snapshot, product_name_snapshot, quantity, unit_price, discount, refund_amount, unit_cost_snapshot
     FROM order_items WHERE workspace_id = $1 AND order_id = ANY($2::uuid[])`,
    [workspaceId, orders.map((o: any) => o.id)]);
  const byOrder = new Map<string, any[]>();
  for (const l of lines) {
    const arr = byOrder.get(l.order_id) || [];
    arr.push({ quantity: Number(l.quantity), unit_price: String(l.unit_price), discount: String(l.discount), refund_amount: String(l.refund_amount), unit_cost_snapshot: l.unit_cost_snapshot === null ? null : String(l.unit_cost_snapshot), sku_snapshot: l.sku_snapshot, product_name_snapshot: l.product_name_snapshot, product_id: l.product_id });
    byOrder.set(l.order_id, arr);
  }
  return orders.map((o: any) => ({
    id: o.id, order_number: o.order_number, status: o.status,
    discount: String(o.discount), shipping_charged: String(o.shipping_charged),
    lines: byOrder.get(o.id) || [],
  }));
}
export async function fetchPostedExpenses(workspaceId: string, range: DateRange) {
  const { rows } = await query(
    `SELECT amount, COALESCE(ec.category_type, 'operating') AS category_type, already_included_in_order_cost
     FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.workspace_id = $1 AND e.expense_date BETWEEN $2 AND $3 AND e.status = 'Posted'`,
    [workspaceId, range.from, range.to]);
  return rows.map((r: any) => ({ amount: String(r.amount), category_type: r.category_type, already_included_in_order_cost: r.already_included_in_order_cost }));
}
export async function getProfitSummary(workspaceId: string, range: DateRange): Promise<Summary & { currency: string; shippingInNet: boolean }> {
  const flags = await workspaceFlags(workspaceId);
  const orders = await fetchOrdersWithLines(workspaceId, range);
  const expenses = await fetchPostedExpenses(workspaceId, range);
  return { ...computeSummary(orders as OrderInput[], expenses, flags.shippingInNet), currency: flags.currency, shippingInNet: flags.shippingInNet };
}
export async function getProductProfitability(workspaceId: string, range: DateRange) {
  const { rows } = await query(
    `SELECT oi.sku_snapshot AS sku, COALESCE(oi.product_name_snapshot, oi.sku_snapshot) AS name,
            SUM(oi.quantity) AS units,
            SUM(oi.quantity * oi.unit_price - oi.discount - oi.refund_amount) AS revenue,
            SUM(oi.discount) AS discounts, SUM(oi.refund_amount) AS refunds,
            SUM(CASE WHEN oi.unit_cost_snapshot IS NULL THEN 0 ELSE oi.quantity * oi.unit_cost_snapshot END) AS cogs,
            COUNT(*) FILTER (WHERE oi.unit_cost_snapshot IS NULL) AS missing_cost_lines
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.workspace_id = $1 AND o.order_date BETWEEN $2 AND $3 AND o.voided = FALSE AND o.status NOT IN ('Draft','Cancelled')
     GROUP BY oi.sku_snapshot, oi.product_name_snapshot ORDER BY (SUM(oi.quantity * oi.unit_price - oi.discount - oi.refund_amount) - SUM(CASE WHEN oi.unit_cost_snapshot IS NULL THEN 0 ELSE oi.quantity * oi.unit_cost_snapshot END)) DESC`,
    [workspaceId, range.from, range.to]);
  return rows.map((r: any) => {
    const revenue = D(r.revenue), cogs = D(r.cogs), profit = revenue.minus(cogs);
    return {
      sku: r.sku, name: r.name, units: Number(r.units), revenue: moneyStr(revenue),
      discounts: moneyStr(r.discounts), refunds: moneyStr(r.refunds), cogs: moneyStr(cogs),
      contributionProfit: moneyStr(profit),
      marginPct: revenue.isZero() ? null : profit.div(revenue).times(100).toDecimalPlaces(2).toFixed(2),
      missingCostLines: Number(r.missing_cost_lines), incomplete: Number(r.missing_cost_lines) > 0,
    };
  });
}
export async function getExpenseBreakdown(workspaceId: string, range: DateRange) {
  const { rows } = await query(
    `SELECT category_name, COALESCE(ec.category_type,'operating') AS category_type, SUM(amount) AS total, COUNT(*) AS n
     FROM expenses e LEFT JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.workspace_id = $1 AND e.expense_date BETWEEN $2 AND $3 AND e.status = 'Posted' AND e.already_included_in_order_cost = FALSE
     GROUP BY category_name, ec.category_type ORDER BY total DESC`,
    [workspaceId, range.from, range.to]);
  return rows.map((r: any) => ({ category: r.category_name, categoryType: r.category_type, total: moneyStr(r.total), count: Number(r.n) }));
}
export async function getCodOutstanding(workspaceId: string) {
  const { rows } = await query(
    `SELECT s.id, s.tracking_number, s.expected_cod, s.status, s.shipped_at,
            COALESCE((SELECT SUM(amount) FROM settlement_lines sl WHERE sl.matched_shipment_id = s.id AND sl.match_status IN ('Matched','Partial','Short Paid','Overpaid')), 0) AS received,
            c.name AS courier_name, o.order_number
     FROM shipments s LEFT JOIN couriers c ON c.id = s.courier_id LEFT JOIN orders o ON o.id = s.order_id
     WHERE s.workspace_id = $1 AND s.status IN ('Shipped','Delivered','Pending')`,
    [workspaceId]);
  const now = new Date();
  return rows.map((r: any) => {
    const expected = D(r.expected_cod), received = D(r.received), outstanding = expected.minus(received);
    const shipped = r.shipped_at ? new Date(r.shipped_at) : null;
    const ageDays = shipped ? Math.max(0, Math.floor((now.getTime() - shipped.getTime()) / 86400000)) : 0;
    return {
      id: r.id, trackingNumber: r.tracking_number, courier: r.courier_name, orderNumber: r.order_number,
      status: r.status, expected: moneyStr(expected), received: moneyStr(received),
      outstanding: moneyStr(outstanding), ageDays, agingBucket: codAgingBucket(ageDays),
    };
  }).filter((r: any) => !D(r.outstanding).isZero() || D(r.received).isZero());
}
export async function getSalesTrend(workspaceId: string, range: DateRange, granularity: "day" | "week" | "month" = "day") {
  const trunc = granularity === "month" ? "month" : granularity === "week" ? "week" : "day";
  // Order discount is counted once per order (not once per line): aggregate per order first.
  const { rows } = await query(
    `SELECT date_trunc($4, per_order.order_date::timestamptz)::date AS period,
            SUM(per_order.net_sales) AS net_sales, SUM(per_order.cogs) AS cogs FROM (
       SELECT o.order_date, SUM(oi.quantity * oi.unit_price - oi.discount - oi.refund_amount) - o.discount AS net_sales,
              SUM(CASE WHEN oi.unit_cost_snapshot IS NULL THEN 0 ELSE oi.quantity * oi.unit_cost_snapshot END) AS cogs
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
       WHERE o.workspace_id = $1 AND o.order_date BETWEEN $2 AND $3 AND o.voided = FALSE AND o.status NOT IN ('Draft','Cancelled')
       GROUP BY o.id, o.order_date, o.discount
     ) per_order GROUP BY period ORDER BY period`,
    [workspaceId, range.from, range.to, trunc]);
  return rows.map((r: any) => ({
    period: String(r.period).slice(0, 10), netSales: moneyStr(r.net_sales),
    cogs: moneyStr(r.cogs), profit: moneyStr(D(r.net_sales).minus(D(r.cogs))),
  }));
}
export async function getLowStock(workspaceId: string) {
  const { rows } = await query(
    "SELECT id, sku, name, on_hand, reorder_level, current_unit_cost FROM products WHERE workspace_id = $1 AND active = TRUE AND on_hand <= reorder_level ORDER BY sku",
    [workspaceId]);
  return rows.map((r: any) => ({ id: r.id, sku: r.sku, name: r.name, onHand: Number(r.on_hand), reorderLevel: Number(r.reorder_level), unitCost: r.current_unit_cost === null ? null : moneyStr(r.current_unit_cost) }));
}
export async function getDataQualityIssues(workspaceId: string, range: DateRange) {
  const { rows: missing } = await query(
    `SELECT COUNT(*) AS n FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE oi.workspace_id = $1 AND o.order_date BETWEEN $2 AND $3 AND oi.unit_cost_snapshot IS NULL AND o.status NOT IN ('Draft','Cancelled')`,
    [workspaceId, range.from, range.to]);
  const { rows: dup } = await query(
    `SELECT order_number, COUNT(*) AS n FROM orders WHERE workspace_id = $1 GROUP BY order_number HAVING COUNT(*) > 1`,
    [workspaceId]);
  const { rows: unmatched } = await query(
    "SELECT COUNT(*) AS n FROM settlement_lines WHERE workspace_id = $1 AND match_status = 'Unmatched'", [workspaceId]);
  const issues: string[] = [];
  if (Number(missing[0]?.n) > 0) issues.push(`${missing[0].n} order line(s) have no unit cost — profit for those lines is marked incomplete.`);
  if (dup.length) issues.push(`${dup.length} order number(s) appear more than once — check for duplicate imports.`);
  if (Number(unmatched[0]?.n) > 0) issues.push(`${unmatched[0].n} settlement line(s) are unmatched — COD outstanding may be overstated.`);
  return { issues, missingCostLines: Number(missing[0]?.n || 0), duplicateOrderNumbers: dup.length, unmatchedSettlementLines: Number(unmatched[0]?.n || 0) };
}
