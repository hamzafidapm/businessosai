import { Pool, PoolClient } from "pg";

// Single pool. All queries go through query() with parameters — never string interpolation
// of user input into SQL. That is the primary SQL-injection defence, plus zod validation.
//
// Database URL resolution (in priority order):
//  1. DATABASE_URL — explicit, used locally and when set by hand in production.
//  2. POSTGRES_URL_NON_POOLING — injected by the Vercel Supabase integration.
//     Used for migrations and as the runtime fallback because Vercel marks
//     integration secrets "sensitive": they are available to deployments but
//     can never be read back via the Vercel API, so no code path here (or in
//     any operator tooling) may depend on copying that value into DATABASE_URL.
//  3. POSTGRES_URL — pooled Supabase URL, last resort for short-lived queries.
// This fallback is what makes a Supabase-attached Vercel deployment work
// without anyone ever handling the database password outside Vercel/Supabase.
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.DATABASE_URL || env.POSTGRES_URL_NON_POOLING || env.POSTGRES_URL;
}
// Supabase's Postgres endpoints present a self-signed certificate chain.
// Newer node-postgres treats sslmode=require as verify-full, so a plain
// connection string fails on Vercel with SELF_SIGNED_CERT_IN_CHAIN (seen in
// the 2026-11-04 build log, before any Next.js build output). Supabase's own
// pg guidance for its pooler is rejectUnauthorized: false: traffic stays
// encrypted, but the server certificate identity is not verified. That
// trade-off is scoped to Supabase hosts only; local and other hosts keep
// the previous behaviour (no SSL override).
export function resolvePoolSsl(url: string): { rejectUnauthorized: false } | undefined {
  try {
    const host = new URL(url).hostname;
    if (host.endsWith(".supabase.co") || host.endsWith(".pooler.supabase.com")) {
      return { rejectUnauthorized: false };
    }
  } catch {
    // Unparseable URL: let Pool surface its own error, as before.
  }
  return undefined;
}
let pool: Pool | null = null;
export function getPool(): Pool {
  if (!pool) {
    const url = resolveDatabaseUrl();
    if (!url) throw new Error("DATABASE_URL (or POSTGRES_URL_NON_POOLING / POSTGRES_URL) is not set. See .env.example.");
    pool = new Pool({ connectionString: url, max: 20, ssl: resolvePoolSsl(url) });
    pool.on("error", (err) => console.error(JSON.stringify({ level: "error", msg: "pg pool error", err: String(err) })));
  }
  return pool;
}
export async function query<T = any>(text: string, params: unknown[] = []): Promise<{ rows: T[]; rowCount: number }> {
  const res = await getPool().query(text, params as any);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}
export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
export function pageParams(search: URLSearchParams): { limit: number; offset: number; page: number } {
  const page = Math.max(1, Number(search.get("page") || 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(search.get("limit") || 50) || 50));
  return { limit, offset: (page - 1) * limit, page };
}
export function toNum(v: unknown): string {
  // pg returns NUMERIC as string; keep it a string so money never becomes a float.
  if (v === null || v === undefined) return "0";
  return String(v);
}
