import { describe, it, expect } from "vitest";
import { deductStockForOrder } from "../src/lib/inventory";

// Minimal in-memory stand-in for the transaction client used by withTx.
function fakeClient(opts: { onHand?: number; allowNegative?: boolean; alreadyDeducted?: boolean } = {}) {
  const products: Record<string, number> = { prod1: opts.onHand ?? 10 };
  const movements: any[] = opts.alreadyDeducted ? [{ id: "m1" }] : [];
  const client = {
    products,
    movements,
    async query(text: string, params: unknown[] = []) {
      if (text.includes("inventory_movements") && text.startsWith("SELECT")) {
        return { rows: movements };
      }
      if (text.includes("FROM workspaces")) {
        return { rows: [{ allow_negative_stock: opts.allowNegative ?? false }] };
      }
      if (text.includes("FROM order_items")) {
        return {
          rows: [{ product_id: "prod1", quantity: 2, sku_snapshot: "PILOT-001", unit_cost_snapshot: "800" }],
        };
      }
      if (text.includes("FROM products")) {
        return { rows: [{ on_hand: products.prod1 }] };
      }
      if (text.startsWith("UPDATE products")) {
        products.prod1 = Number(params[0]);
        return { rows: [] };
      }
      if (text.startsWith("INSERT INTO inventory_movements")) {
        movements.push({ quantity_delta: params[2] });
        return { rows: [] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
  return client;
}

describe("deductStockForOrder", () => {
  it("deducts once and records a stock-out movement", async () => {
    const c = fakeClient({ onHand: 10 });
    await deductStockForOrder(c, "ws1", "ord1", "user1");
    expect(c.products.prod1).toBe(8);
    expect(c.movements).toHaveLength(1);
    expect(c.movements[0].quantity_delta).toBe(-2);
  });

  it("is idempotent when a stock-out already exists", async () => {
    const c = fakeClient({ onHand: 8, alreadyDeducted: true });
    await deductStockForOrder(c, "ws1", "ord1", "user1");
    expect(c.products.prod1).toBe(8);
    expect(c.movements).toHaveLength(1);
  });

  it("refuses to go negative unless the owner override is enabled", async () => {
    const c = fakeClient({ onHand: 1 });
    await expect(deductStockForOrder(c, "ws1", "ord1", "user1")).rejects.toThrow("Insufficient stock");
    expect(c.products.prod1).toBe(1);
  });
});
