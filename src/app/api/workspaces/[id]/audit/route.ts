import { query, pageParams } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { requireMembership } from "@/lib/tenant";
import { errorResponse } from "@/lib/errors";
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    await requireMembership(user.id, params.id);
    const { limit, offset, page } = pageParams(new URL(req.url).searchParams);
    const { rows } = await query("SELECT a.*, u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.workspace_id=$1 ORDER BY a.created_at DESC LIMIT $2 OFFSET $3", [params.id, limit, offset]);
    const total = (await query("SELECT COUNT(*) AS n FROM audit_logs WHERE workspace_id=$1", [params.id])).rows[0].n;
    return Response.json({ logs: rows, page, total: Number(total) });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
