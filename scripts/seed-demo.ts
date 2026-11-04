import "dotenv/config";
// Demo seed ONLY. Creates a clearly labelled demo workspace (is_demo=true) with
// realistic sample data, owned by a demo user. Never run against a real workspace
// and never mix this data into production records — the UI labels it DEMO everywhere.
import bcrypt from "bcryptjs";
import { getPool, query } from "../src/lib/db";
async function main() {
  const pool = getPool();
  const email = "demo@businessos.example";
  const hash = await bcrypt.hash("Demo1234!", 12);
  let user = (await query("SELECT id FROM users WHERE email = $1", [email])).rows[0];
  if (!user) user = (await query("INSERT INTO users (name, email, password_hash, email_verified_at) VALUES ($1,$2,$3,now()) RETURNING id", ["Demo Seller", email, hash])).rows[0];
  let ws = (await query("SELECT id FROM workspaces WHERE is_demo = TRUE AND owner_user_id = $1", [user.id])).rows[0];
  if (!ws) ws = (await query("INSERT INTO workspaces (name, owner_user_id, is_demo) VALUES ($1,$2,TRUE) RETURNING id", ["DEMO — Sample Store (demo data only)", user.id])).rows[0];
  await query("INSERT INTO workspace_members (workspace_id, user_id, role, status, joined_at) VALUES ($1,$2,'owner','active',now()) ON CONFLICT DO NOTHING", [ws.id, user.id]);
  await query("INSERT INTO subscriptions (workspace_id, plan_code) VALUES ($1,'free') ON CONFLICT DO NOTHING", [ws.id]);
  const cats = ["Advertising", "Courier/Shipping", "Packaging", "Rent", "Software/Subscriptions", "Bank/Payment Fees"];
  const catIds: Record<string, string> = {};
  for (const c of cats) {
    const r = await query("INSERT INTO expense_categories (workspace_id, name, category_type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id", [ws.id, c, c === "Advertising" || c === "Courier/Shipping" ? "variable" : "operating"]);
    catIds[c] = r.rows[0]?.id || (await query("SELECT id FROM expense_categories WHERE workspace_id=$1 AND name=$2", [ws.id, c])).rows[0].id;
  }
  const products: [string, string, string, string, number][] = [
    ["SKU-TEE-001", "Cotton T-Shirt", "1500", "800", 40],
    ["SKU-MUG-002", "Printed Mug", "900", "400", 25],
    ["SKU-HOOD-003", "Hoodie", "3200", "1800", 12],
  ];
  const prodIds: Record<string, string> = {};
  for (const [sku, name, price, cost, stock] of products) {
    const r = await query(`INSERT INTO products (workspace_id, sku, name, selling_price, current_unit_cost, opening_stock, on_hand, reorder_level, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$6,5,$7) ON CONFLICT (workspace_id, sku) DO UPDATE SET selling_price=EXCLUDED.selling_price RETURNING id`, [ws.id, sku, name, price, cost, stock, user.id]);
    prodIds[sku] = r.rows[0].id;
    await query("INSERT INTO product_cost_history (workspace_id, product_id, unit_cost, source, created_by) VALUES ($1,$2,$3,'seed',$4)", [ws.id, prodIds[sku], cost, user.id]);
  }
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 1; i <= 5; i++) {
    const num = `DEMO-100${i}`;
    const exists = await query("SELECT id FROM orders WHERE workspace_id=$1 AND order_number=$2", [ws.id, num]);
    if (exists.rows.length) continue;
    const order = (await query(`INSERT INTO orders (workspace_id, order_number, channel_name, order_date, status, payment_status, payment_method, customer_name, currency, created_by)
      VALUES ($1,$2,'Instagram',$3,'Delivered','Paid','COD','Demo Customer', 'PKR', $4) RETURNING id`, [ws.id, num, today, user.id])).rows[0];
    await query(`INSERT INTO order_items (workspace_id, order_id, product_id, sku_snapshot, product_name_snapshot, quantity, unit_price, unit_cost_snapshot)
      VALUES ($1,$2,$3,'SKU-TEE-001','Cotton T-Shirt',2,1500,800)`, [ws.id, order.id, prodIds["SKU-TEE-001"]]);
  }
  await query(`INSERT INTO expenses (workspace_id, expense_date, category_id, category_name, amount, currency, payee, status, created_by)
    VALUES ($1,$2,$3,'Advertising',5000,'PKR','Meta Ads','Posted',$4) ON CONFLICT DO NOTHING`, [ws.id, today, catIds["Advertising"], user.id]);
  console.log(JSON.stringify({ demo_user: email, demo_password: "Demo1234!", workspace_id: ws.id }));
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
