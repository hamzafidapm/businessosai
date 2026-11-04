import { query } from "@/lib/db";
import { getCtx, jsonBody } from "@/lib/api-helpers";
import { errorResponse, badRequest } from "@/lib/errors";
import { answerQuestion } from "@/lib/ai";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
// POST: ask a question (read-only). GET: conversation history for this workspace.
export async function POST(req: Request) {
  try {
    const ctx = await getCtx(req);
    if (!rateLimit(`ai:${clientIp(req)}:${ctx.workspaceId}`, Number(process.env.RATE_LIMIT_AI || 30))) return Response.json({ error: { code: "rate_limited", message: "AI rate limit reached. Please try again shortly." } }, { status: 429 });
    const body: any = await jsonBody(req);
    const question = String(body.question || "").trim();
    if (!question || question.length > 2000) throw badRequest("Please ask a question (up to 2000 characters).");
    const result = await answerQuestion(ctx.workspaceId, ctx.membership.workspace_name, question);
    // Log tool calls + metric identifiers only — never the full customer PII, and the
    // question itself is stored only in the user's own conversation history.
    const conv = (await query("INSERT INTO ai_conversations (workspace_id, user_id, title) VALUES ($1,$2,$3) RETURNING id", [ctx.workspaceId, ctx.user.id, question.slice(0, 100)])).rows[0];
    await query("INSERT INTO ai_messages (conversation_id, role, content, tool_trace_json) VALUES ($1,'user',$2,$3::jsonb)", [conv.id, question, JSON.stringify({ tools: result.tools.map((t) => t.tool) })]);
    const msg = (await query("INSERT INTO ai_messages (conversation_id, role, content, tool_trace_json) VALUES ($1,'assistant',$2,$3::jsonb) RETURNING id", [conv.id, result.answer, JSON.stringify(result.tools)])).rows[0];
    await audit(ctx.workspaceId, ctx.user.id, "ai_question_asked", "ai_message", msg.id, null, { tools: result.tools.map((t) => t.tool) });
    return Response.json({ answer: result.answer, tools: result.tools, links: result.links, messageId: msg.id, conversationId: conv.id });
  } catch (e) { return errorResponse(e); }
}
export async function GET(req: Request) {
  try {
    const ctx = await getCtx(req);
    const { rows } = await query("SELECT c.id, c.title, c.created_at, m.role, m.content, m.feedback, m.id AS message_id FROM ai_conversations c JOIN ai_messages m ON m.conversation_id=c.id WHERE c.workspace_id=$1 ORDER BY c.created_at DESC, m.created_at LIMIT 100", [ctx.workspaceId]);
    return Response.json({ history: rows });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
