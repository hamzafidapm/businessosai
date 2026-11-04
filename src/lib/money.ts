import Decimal from "decimal.js";

// Money layer: every amount is a Decimal constructed from a STRING (pg NUMERIC or
// validated input). No JS number arithmetic on money anywhere in the app.
// Display: PKR amounts are shown with 2 decimals; the minor-unit conversion is only
// for systems that need integer pence/paise and is never used for calculation.
export const D = (v: string | number | Decimal | null | undefined): Decimal => {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  if (v instanceof Decimal) return v;
  return new Decimal(String(v));
};
export const moneyStr = (v: string | number | Decimal | null | undefined): string =>
  D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
export const moneyMinor = (v: string | number | Decimal): number =>
  D(v).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
export const fromMinor = (minor: number): string => new Decimal(minor).div(100).toFixed(2);
export function formatPKR(v: string | number | Decimal, currency = "PKR"): string {
  const n = D(v);
  const abs = n.abs().toFixed(2);
  const grouped = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency} ${n.isNegative() ? "-" : ""}${grouped}`;
}
export function parseMoneyInput(v: unknown): string | null {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return null;
    return moneyStr(v);
  }
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d{1,4})?$/.test(s)) return null;
  try {
    return moneyStr(s);
  } catch {
    return null;
  }
}
