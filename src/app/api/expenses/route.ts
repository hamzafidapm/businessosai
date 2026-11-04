import { query, pageParams } from "@/lib/db";
import { getCtx, jsonBody } from "@/lib/api-helpers";
import { parseBody, expenseSchema } from "@/lib/validation";
import { errorResponse } from "@/lib/errors";
import { requireWrite } from "@/lib/tenant";
import { audit, scrub } from "@/lib/audit";
async function categoryId(ctx: any, name: string, type: string) {
  const existing = (await query("SELECT id FROM expense_categories WHERE workspace_id=$1 AND name=$2", [ctx.workspaceId, name])).rows[0];
  if (existing) return existing.id;
  return (await query("INSERT INTO expense_categories (workspace_id, name, category_type) VALUES ($1,$2,$3) RETURNING id", [ctx.workspaceId, name, type])).rows[0].id;
}
export async function GET(req: Request) {
  try {
    const ctx = await getCtx(req);
    const url = new URL(req.url);
    const { limit, offset, page } = pageParams(url.searchParams);
    const status = url.searchParams.get("status");
    const conds = ["workspace_id = $1"]; const params: unknown[] = [ctx.workspaceId];
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    const where = conds.join(" AND ");
    const { rows } = await query(`SELECT * FROM expenses WHERE ${where} ORDER BY expense_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    const total = (await query(`SELECT COUNT(*) AS n FROM expenses WHERE ${where}`, params)).rows[0].n;
    return Response.json({ expenses: rows, page, total: Number(total) });
  } catch (e) { return errorResponse(e); }
}
export async function POST(req: Request) {
  try {
    const ctx = await getCtx(req);
    requireWrite(ctx.membership.role);
    const data = parseBody(expenseSchema, await jsonBody(req));
    const catId = await categoryId(ctx, data.category_name, data.category_type ?? "operating");
    const row = (await query(`INSERT INTO expenses (workspace_id, expense_date, category_id, category_name, amount, currency, payee, payment_method, reference, notes, status, is_recurring, already_included_in_order_cost, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [ctx.workspaceId, data.expense_date, catId, data.category_name, data.amount, data.currency, data.payee || null, data.payment_method || null, data.reference || null, data.notes || null, data.status, data.is_recurring, data.already_included_in_order_cost, ctx.user.id])).rows[0];
    await audit(ctx.workspaceId, ctx.user.id, "expense_created", "expense", row.id, null, scrub(row));
    return Response.json({ expense: row }, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
