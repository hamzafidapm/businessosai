import { query } from "@/lib/db";
import { getCtx, jsonBody } from "@/lib/api-helpers";
import { errorResponse, badRequest } from "@/lib/errors";
export async function POST(req: Request, { params }: { params: { messageId: string } }) {
  try {
    const ctx = await getCtx(req);
    const body: any = await jsonBody(req);
    if (!["helpful","not_helpful"].includes(body.feedback)) throw badRequest("Feedback must be helpful or not_helpful.");
    const { rows } = await query("UPDATE ai_messages SET feedback=$1 WHERE id=$2 AND conversation_id IN (SELECT id FROM ai_conversations WHERE workspace_id=$3) RETURNING id", [body.feedback, params.messageId, ctx.workspaceId]);
    if (!rows[0]) throw badRequest("Message not found in this workspace.");
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
