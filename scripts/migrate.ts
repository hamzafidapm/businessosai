import "dotenv/config";
import fs from "fs";
import path from "path";
import { getPool } from "../src/lib/db";
async function main() {
  const dir = path.join(process.cwd(), "db/migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const pool = getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  for (const f of files) {
    const done = await pool.query("SELECT version FROM schema_migrations WHERE version = $1", [f]);
    if (done.rows.length) { console.log(`skip ${f}`); continue; }
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations (version) VALUES ($1)", [f]);
    console.log(`applied ${f}`);
  }
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
