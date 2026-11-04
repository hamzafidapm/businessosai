import { z } from "zod";

// All API input is validated here first. Rejecting early keeps bad data out of SQL
// (which is parameterised anyway) and out of financial totals.
const moneyString = z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must be a non-negative number with up to 2 decimals");
const moneyOptional = moneyString.optional().default("0");
const uuid = z.string().uuid();
const optionalText = z.string().max(500).optional().nullable();
export const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
});
export const loginSchema = z.object({ email: z.string().trim().email().max(200), password: z.string().min(1).max(200) });
export const workspaceSchema = z.object({
  name: z.string().trim().min(1).max(150),
  country: z.string().trim().max(100).default("Pakistan"),
  default_currency: z.string().length(3).default("PKR"),
  timezone: z.string().max(80).default("Asia/Karachi"),
  business_type: z.string().max(100).optional().nullable(),
});
export const productSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(200),
  category: z.string().max(100).optional().nullable(),
  selling_price: moneyString,
  current_unit_cost: moneyString.nullable().optional(),
  purchase_cost: moneyOptional,
  packaging_cost: moneyOptional,
  other_direct_cost: moneyOptional,
  opening_stock: z.number().int().min(0).default(0),
  on_hand: z.number().int().min(0).optional(),
  reorder_level: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  image_url: z.string().url().max(500).optional().nullable().or(z.literal("")),
  notes: optionalText,
});
export const orderItemSchema = z.object({
  product_id: uuid.optional().nullable(),
  sku: z.string().trim().min(1).max(80),
  product_name: z.string().max(200).optional().nullable(),
  quantity: z.number().int().min(1),
  unit_price: moneyString,
  discount: moneyOptional,
  refund_amount: moneyOptional,
  unit_cost: moneyString.nullable().optional(),
});
export const orderSchema = z.object({
  order_number: z.string().trim().min(1).max(80),
  channel_name: z.string().max(100).optional().nullable(),
  order_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["Draft","Confirmed","Processing","Shipped","Delivered","Cancelled","Return Initiated","Returned","Partially Refunded","Refunded"]).default("Draft"),
  payment_status: z.enum(["Unpaid","Partially Paid","Paid","Refunded"]).default("Unpaid"),
  payment_method: z.string().max(80).optional().nullable(),
  customer_name: z.string().max(150).optional().nullable(),
  customer_contact: z.string().max(100).optional().nullable(),
  discount: moneyOptional,
  shipping_charged: moneyOptional,
  currency: z.string().length(3).default("PKR"),
  courier_name: z.string().max(100).optional().nullable(),
  tracking_number: z.string().max(100).optional().nullable(),
  notes: optionalText,
  items: z.array(orderItemSchema).min(1).max(200),
});
export const expenseSchema = z.object({
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category_name: z.string().trim().min(1).max(100),
  category_type: z.enum(["operating","variable","tax","other"]).default("operating"),
  amount: moneyString,
  currency: z.string().length(3).default("PKR"),
  payee: z.string().max(150).optional().nullable(),
  payment_method: z.string().max(80).optional().nullable(),
  reference: z.string().max(150).optional().nullable(),
  notes: optionalText,
  status: z.enum(["Draft","Posted","Void"]).default("Draft"),
  is_recurring: z.boolean().default(false),
  already_included_in_order_cost: z.boolean().default(false),
});
export const inventoryMovementSchema = z.object({
  product_id: uuid,
  movement_type: z.enum(["stock-in","stock-out","adjustment","return-to-stock","damaged"]),
  quantity_delta: z.number().int().refine((n) => n !== 0, "Quantity change cannot be zero"),
  unit_cost: moneyString.nullable().optional(),
  reason: z.string().trim().min(1).max(300),
  related_order_id: uuid.optional().nullable(),
});
export const courierSchema = z.object({
  name: z.string().trim().min(1).max(150),
  account_reference_masked: z.string().max(100).optional().nullable(),
  contact_notes: optionalText,
  active: z.boolean().default(true),
});
export const shipmentSchema = z.object({
  order_id: uuid.optional().nullable(),
  courier_id: uuid.optional().nullable(),
  tracking_number: z.string().trim().min(1).max(100),
  expected_cod: moneyString,
  shipping_fee: moneyOptional,
  status: z.enum(["Pending","Shipped","Delivered","Returned","Cancelled"]).default("Pending"),
});
export const settlementSchema = z.object({
  courier_id: uuid.optional().nullable(),
  reference: z.string().trim().min(1).max(150),
  statement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  payout_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  gross_amount: moneyString,
  deductions: moneyOptional,
  net_amount: moneyString,
  bank_reference: z.string().max(150).optional().nullable(),
  lines: z.array(z.object({
    tracking_number: z.string().max(100).optional().nullable(),
    order_number: z.string().max(80).optional().nullable(),
    amount: moneyString,
    fee: moneyOptional,
  })).default([]),
});
export const taxProfileSchema = z.object({
  tax_year: z.string().trim().min(4).max(20),
  business_type: z.string().max(100).optional().nullable(),
  registration_status: z.string().max(100).optional().nullable(),
  configuration_json: z.record(z.unknown()).default({}),
});
export function parseBody<Out>(schema: z.ZodType<Out, any, any>, body: unknown): Out {
  const r = schema.safeParse(body);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new Error(`Validation failed: ${first.path.join(".") || "body"} — ${first.message}`);
  }
  return r.data;
}
export function escapeHtml(s: string): string {
  // Defence in depth: React escapes by default, but any string rendered as HTML must go through this.
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
