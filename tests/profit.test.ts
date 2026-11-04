import { describe, it, expect } from "vitest";
import { computeSummary, lineGross, lineNet, orderNetSales, weightedAverageCost, isSaleForProfit } from "../src/lib/profit";
import { moneyStr } from "../src/lib/money";

describe("profit engine (single source of truth)", () => {
  it("computes line gross/net with discount and refund", () => {
    const line = { quantity: 2, unit_price: "1000.00", discount: "200.00", refund_amount: "100.00" };
    expect(lineGross(line).toFixed(2)).toBe("2000.00");
    expect(lineNet(line).toFixed(2)).toBe("1700.00");
  });
  it("computes a full summary: net, COGS, gross, contribution, operating profit", () => {
    const orders = [
      { status: "Delivered", discount: "100.00", shipping_charged: "200.00", lines: [
        { quantity: 2, unit_price: "1500.00", discount: "0", refund_amount: "0", unit_cost_snapshot: "800.00" },
        { quantity: 1, unit_price: "900.00", discount: "100.00", refund_amount: "0", unit_cost_snapshot: "400.00" },
      ]},
    ];
    const expenses = [
      { amount: "5000.00", category_type: "variable" },
      { amount: "2000.00", category_type: "operating" },
    ];
    const s = computeSummary(orders as any, expenses, false);
    // gross 3900, line discount 100, order discount 100 => net 3700; shipping separate
    expect(s.grossSales).toBe("3900.00");
    expect(s.netSales).toBe("3700.00");
    expect(s.shippingCharged).toBe("200.00");
    expect(s.cogs).toBe("2000.00");
    expect(s.grossProfit).toBe("1700.00");
    expect(s.contributionProfit).toBe("-3300.00"); // 1700 - 5000 variable
    expect(s.estimatedOperatingProfit).toBe("-5300.00"); // -3300 - 2000 operating
    expect(s.incomplete).toBe(false);
  });
  it("excludes Draft and Cancelled orders and voided/draft expenses are caller's responsibility (only posted passed in)", () => {
    const s = computeSummary([
      { status: "Draft", discount: "0", shipping_charged: "0", lines: [{ quantity: 1, unit_price: "999.00", unit_cost_snapshot: "1.00" }] },
      { status: "Cancelled", discount: "0", shipping_charged: "0", lines: [{ quantity: 1, unit_price: "888.00", unit_cost_snapshot: "1.00" }] },
    ] as any, [], false);
    expect(s.netSales).toBe("0.00");
    expect(s.orderCount).toBe(0);
  });
  it("flags missing cost and excludes it from COGS (never invents a cost)", () => {
    const s = computeSummary([
      { status: "Delivered", discount: "0", shipping_charged: "0", lines: [{ quantity: 1, unit_price: "1000.00", unit_cost_snapshot: null }] },
    ] as any, [], false);
    expect(s.incomplete).toBe(true);
    expect(s.missingCostLines).toBe(1);
    expect(s.cogs).toBe("0.00");
  });
  it("margin is N/A (null) when net sales are zero", () => {
    const s = computeSummary([], [], false);
    expect(s.grossMarginPct).toBeNull();
    expect(s.operatingMarginPct).toBeNull();
    expect(s.estimatedOperatingProfit).toBe("0.00");
  });
  it("excludes expenses already included in order cost (double-count protection)", () => {
    const s = computeSummary([], [{ amount: "1000.00", category_type: "variable", already_included_in_order_cost: true }], false);
    expect(s.variableExpenses).toBe("0.00");
  });
  it("includes shipping in net sales only when the flag is on", () => {
    const order = { status: "Delivered", discount: "0", shipping_charged: "250.00", lines: [{ quantity: 1, unit_price: "1000.00" }] } as any;
    expect(orderNetSales(order, false).toFixed(2)).toBe("1000.00");
    expect(orderNetSales(order, true).toFixed(2)).toBe("1250.00");
  });
  it("never uses float arithmetic for money display", () => {
    expect(moneyStr("0.1")).toBe("0.10");
    expect(moneyStr("1234.567")).toBe("1234.57"); // half-up, 2dp
  });
  it("weighted average cost", () => {
    // (10 × 800 + 10 × 1000) / 20 = 900
    expect(weightedAverageCost(10, "800.00", 10, "1000.00")).toBe("900.00");
    expect(weightedAverageCost(0, "0.00", 5, "400.00")).toBe("400.00");
  });
  it("isSaleForProfit excludes Draft/Cancelled only", () => {
    expect(isSaleForProfit("Draft")).toBe(false);
    expect(isSaleForProfit("Cancelled")).toBe(false);
    expect(isSaleForProfit("Delivered")).toBe(true);
    expect(isSaleForProfit("Returned")).toBe(true);
  });
});
