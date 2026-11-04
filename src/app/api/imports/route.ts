import { query, withTx } from "@/lib/db";
import { getCtx, jsonBody } from "@/lib/api-helpers";
import { parseCsv, fileHash, mapRow, autoMap, isValidMoney, isValidDate, xlsxRowsToCsv } from "@/lib/imports";
import { errorResponse, conflict, badRequest } from "@/lib/errors";
import { requireWrite } from "@/lib/tenant";
import { audit } from "@/lib/audit";
// Import wizard API (PRD §11): preview first, commit second. Commit is transactional —
// a failed import leaves no partial financial records. Duplicate files are rejected
// by (workspace, module, file_hash); duplicate rows inside a file are flagged.
const TEMPLATES: Record<string, string[]> = {
  products: ["sku","name","category","selling_price","unit_cost","opening_stock","reorder_level"],
  orders: ["order_number","order_date","channel_name","status","payment_status","customer_name","sku","quantity","unit_price","discount","unit_cost","shipping_charged"],
  expenses: ["expense_date","category_name","amount","payee","payment_method","reference"],
  settlements: ["tracking_number","order_number","amount","fee"],
};
export async function GET(req: Request) {
  try {
    const ctx = await getCtx(req);
    const { rows } = await query("SELECT * FROM import_batches WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 50", [ctx.workspaceId]);
    return Response.json({ batches: rows, templates: TEMPLATES });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const ctx = await getCtx(req);
    requireWrite(ctx.membership.role);
    const body: any = await jsonBody(req);
    const module = String(body.module || "");
    if (!TEMPLATES[module]) throw badRequest("Module must be products, orders, expenses, or settlements.");
    let text = String(body.csvText || "");
    if (body.fileBase64 && !text) {
      const buf = Buffer.from(String(body.fileBase64), "base64");
      if (buf.length > 5 * 1024 * 1024) throw badRequest("File is larger than the 5 MB limit.");
      if (String(body.filename || "").toLowerCase().endsWith(".xlsx")) {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "buffer" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
        text = xlsxRowsToCsv(aoa);
      } else text = buf.toString("utf8");
    }
    if (!text) throw badRequest("No file content supplied.");
    const parsed = parseCsv(text);
    if (parsed.length < 2) throw badRequest("File must have a header row and at least one data row.");
    const headers = parsed[0];
    const mapping = body.mapping && Object.keys(body.mapping).length ? body.mapping : autoMap(headers, TEMPLATES[module]);
    const rawRows = parsed.slice(1).map((r) => mapRow(headers, r, mapping));
    // Validate + duplicate-flag each row.
    const seen = new Set<string>();
    const preview = rawRows.map((row, i) => {
      const errors: string[] = [];
      if (module === "products") {
        if (!row.sku) errors.push("sku is required");
        if (!row.name) errors.push("name is required");
        if (row.selling_price && !isValidMoney(row.selling_price)) errors.push("selling_price must be a number");
      }
      if (module === "orders") {
        if (!row.order_number) errors.push("order_number is required");
        if (row.order_date && !isValidDate(row.order_date)) errors.push("order_date must be YYYY-MM-DD");
        if (!row.sku) errors.push("sku is required");
        if (!/^\d+$/.test(row.quantity || "")) errors.push("quantity must be a whole number");
        if (row.unit_price && !isValidMoney(row.unit_price)) errors.push("unit_price must be a number");
      }
      if (module === "expenses") {
        if (row.expense_date && !isValidDate(row.expense_date)) errors.push("expense_date must be YYYY-MM-DD");
        if (!row.amount || !isValidMoney(row.amount)) errors.push("amount must be a number");
        if (!row.category_name) errors.push("category_name is required");
      }
      if (module === "settlements") {
        if (!row.amount || !isValidMoney(row.amount)) errors.push("amount must be a number");
        if (!row.tracking_number && !row.order_number) errors.push("tracking_number or order_number is required");
      }
      const key = module === "products" ? row.sku : module === "orders" ? `${row.order_number}|${row.sku}` : module === "expenses" ? `${row.expense_date}|${row.amount}|${row.category_name}` : `${row.tracking_number}|${row.amount}`;
      const duplicate = key ? seen.has(key) : false;
      if (key) seen.add(key);
      return { row: i + 2, data: row, errors, duplicate };
    });
    const valid = preview.filter((p) => !p.errors.length && !p.duplicate);
    const rejected = preview.filter((p) => p.errors.length || p.duplicate);
    if (!body.commit) return Response.json({ preview: preview.slice(0, 100), validCount: valid.length, errorCount: rejected.length, total: preview.length, mapping, headers });
    // Commit path
    const hash = fileHash(text);
    const dupFile = (await query("SELECT id FROM import_batches WHERE workspace_id=$1 AND module=$2 AND file_hash=$3", [ctx.workspaceId, module, hash])).rows[0];
    if (dupFile) throw conflict("This exact file has already been imported for this module in this workspace.");
    const batch = await withTx(async (c) => {
      const b = (await c.query("INSERT INTO import_batches (workspace_id, module, filename, file_hash, status, row_count, error_count, mapping_json, errors_json, created_by) VALUES ($1,$2,$3,$4,'completed',$5,$6,$7::jsonb,$8::jsonb,$9) RETURNING *",
        [ctx.workspaceId, module, body.filename || "import.csv", hash, valid.length, rejected.length, JSON.stringify(mapping), JSON.stringify(rejected.slice(0, 100)), ctx.user.id])).rows[0];
      if (module === "products") {
        for (const p of valid) {
          await c.query(`INSERT INTO products (workspace_id, sku, name, category, selling_price, current_unit_cost, opening_stock, on_hand, reorder_level, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9) ON CONFLICT (workspace_id, sku) DO NOTHING`,
            [ctx.workspaceId, p.data.sku, p.data.name, p.data.category || null, p.data.selling_price || "0", p.data.unit_cost || null, Number(p.data.opening_stock || 0), Number(p.data.reorder_level || 0), ctx.user.id]);
        }
      } else if (module === "expenses") {
        for (const p of valid) {
          let cat = (await c.query("SELECT id FROM expense_categories WHERE workspace_id=$1 AND name=$2", [ctx.workspaceId, p.data.category_name])).rows[0];
          if (!cat) cat = (await c.query("INSERT INTO expense_categories (workspace_id, name, category_type) VALUES ($1,$2,'operating') RETURNING id", [ctx.workspaceId, p.data.category_name])).rows[0];
          await c.query("INSERT INTO expenses (workspace_id, expense_date, category_id, category_name, amount, currency, payee, payment_method, reference, status, created_by) VALUES ($1,$2,$3,$4,$5,'PKR',$6,$7,$8,'Posted',$9)",
            [ctx.workspaceId, p.data.expense_date || new Date().toISOString().slice(0, 10), cat.id, p.data.category_name, p.data.amount, p.data.payee || null, p.data.payment_method || null, p.data.reference || null, ctx.user.id]);
        }
      } else if (module === "orders") {
        const byOrder = new Map<string, any>();
        for (const p of valid) {
          const key = p.data.order_number;
          if (!byOrder.has(key)) byOrder.set(key, { header: p.data, lines: [] });
          byOrder.get(key).lines.push(p.data);
        }
        for (const [num, group] of byOrder) {
          const h = group.header;
          const o = (await c.query(`INSERT INTO orders (workspace_id, order_number, channel_name, order_date, status, payment_status, shipping_charged, currency, created_by, source, import_batch_id)
            VALUES ($1,$2,$3,$4,$5,$6,$7,'PKR',$8,'import',$9) ON CONFLICT (workspace_id, order_number) DO NOTHING RETURNING id`,
            [ctx.workspaceId, num, h.channel_name || null, h.order_date || new Date().toISOString().slice(0, 10), h.status || "Confirmed", h.payment_status || "Unpaid", h.shipping_charged || "0", ctx.user.id, b.id])).rows[0];
          if (!o) continue;
          for (const line of group.lines) {
            const prod = (await c.query("SELECT id, current_unit_cost FROM products WHERE workspace_id=$1 AND sku=$2", [ctx.workspaceId, line.sku])).rows[0];
            await c.query("INSERT INTO order_items (workspace_id, order_id, product_id, sku_snapshot, quantity, unit_price, discount, unit_cost_snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
              [ctx.workspaceId, o.id, prod?.id || null, line.sku, Number(line.quantity), line.unit_price || "0", line.discount || "0", line.unit_cost || (prod?.current_unit_cost === null || prod?.current_unit_cost === undefined ? null : String(prod.current_unit_cost))]);
          }
        }
      } else if (module === "settlements") {
        const courierName = String(body.courierName || "");
        let courierId: string | null = null;
        if (courierName) {
          const cur = (await c.query("SELECT id FROM couriers WHERE workspace_id=$1 AND name=$2", [ctx.workspaceId, courierName])).rows[0];
          courierId = cur?.id || (await c.query("INSERT INTO couriers (workspace_id, name) VALUES ($1,$2) RETURNING id", [ctx.workspaceId, courierName])).rows[0].id;
        }
        const total = valid.reduce((a, p) => a + Number(p.data.amount), 0).toFixed(2);
        const s = (await c.query("INSERT INTO settlements (workspace_id, courier_id, reference, statement_date, gross_amount, deductions, net_amount, import_batch_id) VALUES ($1,$2,$3,CURRENT_DATE,$4,0,$4,$5) RETURNING id",
          [ctx.workspaceId, courierId, body.settlementReference || body.filename || "import", total, b.id])).rows[0];
        for (const p of valid) {
          let shipment = p.data.tracking_number ? (await c.query("SELECT * FROM shipments WHERE workspace_id=$1 AND tracking_number=$2", [ctx.workspaceId, p.data.tracking_number])).rows[0] : null;
          if (!shipment && p.data.order_number) shipment = (await c.query("SELECT s.* FROM shipments s JOIN orders o ON o.id=s.order_id WHERE s.workspace_id=$1 AND o.order_number=$2", [ctx.workspaceId, p.data.order_number])).rows[0];
          const expected = shipment ? String(shipment.expected_cod) : "0";
          const diff = (Number(p.data.amount) - Number(expected)).toFixed(2);
          const status = !shipment ? "Unmatched" : diff === "0.00" ? "Matched" : Number(diff) < 0 ? "Short Paid" : "Overpaid";
          await c.query("INSERT INTO settlement_lines (workspace_id, settlement_id, tracking_number, order_number, amount, fee, matched_shipment_id, match_status, difference) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            [ctx.workspaceId, s.id, p.data.tracking_number || null, p.data.order_number || null, p.data.amount, p.data.fee || "0", shipment?.id || null, status, diff]);
        }
      }
      return b;
    });
    await audit(ctx.workspaceId, ctx.user.id, "import_committed", "import_batch", batch.id, null, { module, rows: valid.length, rejected: rejected.length });
    return Response.json({ batch, imported: valid.length, rejected: rejected.length, rejectedRows: rejected.slice(0, 100) }, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
