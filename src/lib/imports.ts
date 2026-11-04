import crypto from "crypto";
// CSV parsing + import preview/duplicate logic. Pure (no DB) so it is unit-testable.
// XLSX is handled in the API route via the xlsx package and converted to rows first;
// this module then validates the same row shape, so CSV and XLSX share one code path.
export type RowResult<T> = { row: number; data: T | null; errors: string[]; duplicate: boolean };
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [], field = "", inQuotes = false;
  const pushField = () => { cur.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(cur); cur = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") pushField();
    else if (c === "\n") pushRow();
    else if (c !== "\r") field += c;
  }
  if (field !== "" || cur.length) pushRow();
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
// Convert an XLSX sheet (already read as an array of arrays) to CSV text.
// Cells are quoted when they contain a comma, quote, or newline — joining
// raw values with "," (the previous behaviour) silently split a value such
// as "Shirt, Cotton" into two columns and shifted every later field.
export function xlsxRowsToCsv(aoa: unknown[][]): string {
  const escape = (v: unknown): string => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return aoa.map((r) => (r as unknown[]).map(escape).join(",")).join("\n");
}
export function fileHash(content: Buffer | string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}
export function mapRow(headers: string[], row: string[], mapping: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [target, source] of Object.entries(mapping)) {
    const idx = headers.findIndex((h) => h.trim().toLowerCase() === source.trim().toLowerCase());
    out[target] = idx >= 0 ? (row[idx] || "").trim() : "";
  }
  return out;
}
export function autoMap(headers: string[], targets: string[]): Record<string, string> {
  // Case-insensitive exact match, plus a few common aliases — never silent guessing beyond this.
  const aliases: Record<string, string[]> = {
    order_number: ["order number", "order_no", "order id"],
    sku: ["product sku", "product_sku"],
    quantity: ["qty"],
    unit_price: ["price", "selling price", "unit price"],
    unit_cost: ["cost", "unit cost"],
    amount: ["total", "expense amount"],
    category_name: ["category"],
    tracking_number: ["tracking", "consignment", "cn"],
  };
  const out: Record<string, string> = {};
  const lower = headers.map((h) => h.trim().toLowerCase());
  for (const t of targets) {
    const candidates = [t, ...(aliases[t] || [])];
    const found = candidates.find((c) => lower.includes(c));
    if (found) out[t] = headers[lower.indexOf(found)];
  }
  return out;
}
export function isValidMoney(s: string): boolean { return /^-?\d+(\.\d{1,2})?$/.test(s.trim()); }
export function isValidDate(s: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) && !isNaN(Date.parse(s)); }
export function findDuplicates<T>(rows: T[], key: (r: T) => string): Set<number> {
  const seen = new Map<string, number>();
  const dups = new Set<number>();
  rows.forEach((r, i) => {
    const k = key(r);
    if (!k) return;
    if (seen.has(k)) dups.add(i); else seen.set(k, i);
  });
  return dups;
}
