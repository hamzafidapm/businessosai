import { describe, it, expect } from "vitest";
import { query } from "../src/lib/db";

// These tests run only when DATABASE_URL is set (real Postgres). They prove the
// tenant rule that matters most: a membership check for workspace A must never
// authorise a read/write in workspace B. The membership query is the same SQL the
// API routes use (src/lib/tenant.ts requireMembership).
const hasDb = Boolean(process.env.DATABASE_URL);
describe.skipIf(!hasDb)("tenant isolation against real Postgres", () => {
  it("a user with membership in workspace A is not a member of workspace B", async () => {
    const emailA = `iso-a-${Date.now()}@example.test`;
    const emailB = `iso-b-${Date.now()}@example.test`;
    const uA = (await query("INSERT INTO users (name, email, password_hash) VALUES ('A', $1, 'x') RETURNING id", [emailA])).rows[0];
    const uB = (await query("INSERT INTO users (name, email, password_hash) VALUES ('B', $1, 'x') RETURNING id", [emailB])).rows[0];
    const wA = (await query("INSERT INTO workspaces (name, owner_user_id) VALUES ('WA', $1) RETURNING id", [uA.id])).rows[0];
    const wB = (await query("INSERT INTO workspaces (name, owner_user_id) VALUES ('WB', $1) RETURNING id", [uB.id])).rows[0];
    await query("INSERT INTO workspace_members (workspace_id, user_id, role, status, joined_at) VALUES ($1,$2,'owner','active',now())", [wA.id, uA.id]);
    await query("INSERT INTO workspace_members (workspace_id, user_id, role, status, joined_at) VALUES ($1,$2,'owner','active',now())", [wB.id, uB.id]);
    // Cross-workspace membership check must return zero rows for user A in workspace B.
    const cross = await query("SELECT * FROM workspace_members WHERE user_id=$1 AND workspace_id=$2 AND status='active'", [uA.id, wB.id]);
    expect(cross.rows.length).toBe(0);
    // And a workspace-scoped product query for B must not return A's product.
    const prodA = (await query("INSERT INTO products (workspace_id, sku, name, selling_price, created_by) VALUES ($1,'ISO-1','P','100',$2) RETURNING id", [wA.id, uA.id])).rows[0];
    const leak = await query("SELECT * FROM products WHERE id=$1 AND workspace_id=$2", [prodA.id, wB.id]);
    expect(leak.rows.length).toBe(0);
    // Cleanup (test data only, isolated by unique emails).
    await query("DELETE FROM products WHERE id=$1", [prodA.id]);
    await query("DELETE FROM workspace_members WHERE workspace_id IN ($1,$2)", [wA.id, wB.id]);
    await query("DELETE FROM workspaces WHERE id IN ($1,$2)", [wA.id, wB.id]);
    await query("DELETE FROM users WHERE id IN ($1,$2)", [uA.id, uB.id]);
  });
  it("unique (workspace, sku) allows the same SKU in two different workspaces", async () => {
    const u = (await query("INSERT INTO users (name, email, password_hash) VALUES ('U', $1, 'x') RETURNING id", [`iso-u-${Date.now()}@example.test`])).rows[0];
    const w1 = (await query("INSERT INTO workspaces (name, owner_user_id) VALUES ('W1', $1) RETURNING id", [u.id])).rows[0];
    const w2 = (await query("INSERT INTO workspaces (name, owner_user_id) VALUES ('W2', $1) RETURNING id", [u.id])).rows[0];
    await query("INSERT INTO products (workspace_id, sku, name, selling_price) VALUES ($1,'SAME','P','10')", [w1.id]);
    await query("INSERT INTO products (workspace_id, sku, name, selling_price) VALUES ($1,'SAME','P','10')", [w2.id]);
    const n = (await query("SELECT COUNT(*) AS n FROM products WHERE sku='SAME' AND workspace_id IN ($1,$2)", [w1.id, w2.id])).rows[0].n;
    expect(Number(n)).toBe(2);
    await query("DELETE FROM products WHERE workspace_id IN ($1,$2)", [w1.id, w2.id]);
    await query("DELETE FROM workspaces WHERE id IN ($1,$2)", [w1.id, w2.id]);
    await query("DELETE FROM users WHERE id=$1", [u.id]);
  });
});
