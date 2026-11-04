import { describe, it, expect } from "vitest";
import { classifyCod, codAgingBucket } from "../src/lib/profit";
import { parseCsv, mapRow, autoMap, findDuplicates, isValidMoney, isValidDate, fileHash } from "../src/lib/imports";
import { productSchema, orderSchema, expenseSchema } from "../src/lib/validation";
import { canWrite, canManageSettings, canManageFinance } from "../src/lib/tenant";
import { escapeHtml } from "../src/lib/validation";

describe("COD matching", () => {
  it("Matched when equal, Short Paid when less, Overpaid when more, Unmatched when zero", () => {
    expect(classifyCod("1500.00", "1500.00").status).toBe("Matched");
    expect(classifyCod("1500.00", "1200.00").status).toBe("Short Paid");
    expect(classifyCod("1500.00", "1200.00").difference).toBe("-300.00");
    expect(classifyCod("1500.00", "1600.00").status).toBe("Overpaid");
    expect(classifyCod("1500.00", "0.00").status).toBe("Unmatched");
    expect(classifyCod("1500.00", "1500.00", true).status).toBe("Duplicate Candidate");
  });
  it("aging buckets", () => {
    expect(codAgingBucket(3)).toBe("0–7 days");
    expect(codAgingBucket(10)).toBe("8–14 days");
    expect(codAgingBucket(20)).toBe("15–30 days");
    expect(codAgingBucket(45)).toBe("30+ days");
  });
});
describe("CSV import helpers", () => {
  it("parses quoted fields and commas", () => {
    const rows = parseCsv('sku,name,price\n"SKU-1","Shirt, Cotton",1500\nSKU-2,Mug,900');
    expect(rows).toEqual([["sku", "name", "price"], ["SKU-1", "Shirt, Cotton", "1500"], ["SKU-2", "Mug", "900"]]);
  });
  it("auto-maps common aliases and maps rows case-insensitively", () => {
    const headers = ["Order Number", "Qty", "Price"];
    const mapping = autoMap(headers, ["order_number", "quantity", "unit_price"]);
    expect(mapping.order_number).toBe("Order Number");
    expect(mapping.quantity).toBe("Qty");
    expect(mapRow(headers, ["ORD-1", "2", "1500"], mapping)).toEqual({ order_number: "ORD-1", quantity: "2", unit_price: "1500" });
  });
  it("finds duplicate rows by key", () => {
    const dups = findDuplicates([{ sku: "A" }, { sku: "B" }, { sku: "A" }], (r) => r.sku);
    expect(dups.has(2)).toBe(true);
    expect(dups.has(0)).toBe(false);
  });
  it("validates money and dates strictly", () => {
    expect(isValidMoney("1500.00")).toBe(true);
    expect(isValidMoney("1,500")).toBe(false);
    expect(isValidMoney("abc")).toBe(false);
    expect(isValidDate("2026-11-04")).toBe(true);
    expect(isValidDate("04/11/2026")).toBe(false);
  });
  it("file hash is stable and changes with content", () => {
    expect(fileHash("a")).toBe(fileHash("a"));
    expect(fileHash("a")).not.toBe(fileHash("b"));
  });
});
describe("validation (rejects bad input before it reaches SQL)", () => {
  it("rejects negative prices, bad SKUs, empty order items", () => {
    expect(productSchema.safeParse({ sku: "X", name: "Y", selling_price: "-5" }).success).toBe(false);
    expect(orderSchema.safeParse({ order_number: "O1", order_date: "2026-11-04", items: [] }).success).toBe(false);
    expect(expenseSchema.safeParse({ expense_date: "2026-11-04", category_name: "Ads", amount: "not-a-number" }).success).toBe(false);
  });
  it("accepts a valid order with multiple items", () => {
    const r = orderSchema.safeParse({ order_number: "O1", order_date: "2026-11-04", items: [{ sku: "A", quantity: 2, unit_price: "100.00" }, { sku: "B", quantity: 1, unit_price: "50.00" }] });
    expect(r.success).toBe(true);
  });
  it("escapes HTML for any string rendered as HTML", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });
});
describe("role enforcement (pure rules used by every API route)", () => {
  it("viewer cannot write; only owner/admin manage settings", () => {
    expect(canWrite("viewer")).toBe(false);
    expect(canWrite("finance")).toBe(true);
    expect(canManageSettings("viewer")).toBe(false);
    expect(canManageSettings("admin")).toBe(true);
    expect(canManageFinance("operations")).toBe(false);
    expect(canManageFinance("finance")).toBe(true);
  });
});
