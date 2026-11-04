import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseCsv, xlsxRowsToCsv, autoMap, mapRow, findDuplicates } from "../src/lib/imports";

// Regression tests for the XLSX import path (route: src/app/api/imports/route.ts).
// The route reads the first sheet with sheet_to_json({header:1}) and converts it
// to CSV text; these tests exercise exactly that conversion plus the shared
// CSV validation helpers, so CSV and XLSX cannot drift apart again.
function buildXlsx(aoa: unknown[][]): unknown[][] {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Products");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const back = XLSX.read(buf, { type: "buffer" });
  return XLSX.utils.sheet_to_json(back.Sheets[back.SheetNames[0]], { header: 1 }) as unknown[][];
}

describe("XLSX import round-trip", () => {
  it("converts a real .xlsx workbook to the same rows as the CSV template", () => {
    const aoa = buildXlsx([
      ["sku", "name", "category", "selling_price", "unit_cost", "opening_stock", "reorder_level"],
      ["XLSX-001", "Test XLSX Product", "Apparel", 2000, 1000, 10, 2],
      ["XLSX-001", "Test XLSX Product Duplicate", "Apparel", 2000, 1000, 10, 2],
      ["", "Bad Row", "Apparel", "abc", 100, 5, 1],
    ]);
    const rows = parseCsv(xlsxRowsToCsv(aoa));
    expect(rows.length).toBe(4);
    expect(rows[0]).toEqual(["sku", "name", "category", "selling_price", "unit_cost", "opening_stock", "reorder_level"]);
    // Numeric cells arrive as numbers from xlsx and must become plain strings.
    expect(rows[1]).toEqual(["XLSX-001", "Test XLSX Product", "Apparel", "2000", "1000", "10", "2"]);
    // The shared duplicate helper flags the second XLSX-001, and the bad row
    // is recognisable as invalid (empty sku, non-numeric price) by the route.
    const mapped = rows.slice(1).map((r) => mapRow(rows[0], r, autoMap(rows[0], ["sku", "name", "selling_price"])));
    expect(findDuplicates(mapped, (r) => r.sku).has(1)).toBe(true);
    expect(findDuplicates(mapped, (r) => r.sku).has(0)).toBe(false);
    expect(mapped[2].sku).toBe("");
    expect(mapped[2].selling_price).toBe("abc");
  });

  it("does not split a value containing a comma or quotes into extra columns", () => {
    const aoa = buildXlsx([
      ["sku", "name", "selling_price"],
      ["XLSX-002", 'Shirt, Cotton "Premium"', 1500],
    ]);
    const rows = parseCsv(xlsxRowsToCsv(aoa));
    expect(rows.length).toBe(2);
    expect(rows[1]).toEqual(["XLSX-002", 'Shirt, Cotton "Premium"', "1500"]);
  });
});
