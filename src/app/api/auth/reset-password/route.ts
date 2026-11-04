import { query } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { jsonBody } from "@/lib/api-helpers";
import { errorResponse, badRequest } from "@/lib/errors";
import crypto from "crypto";
export async function POST(req: Request) {
  try {
    const body: any = await jsonBody(req);
    const token = String(body.token || "");
    const password = String(body.password || "");
    if (!token || password.length < 8) throw badRequest("A valid token and a password of at least 8 characters are required.");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const { rows } = await query("SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL", [hash]);
    if (!rows[0]) throw badRequest("This reset link is invalid or expired.");
    await query("UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1", [hash]);
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [await hashPassword(password), rows[0].user_id]);
    await query("DELETE FROM sessions WHERE user_id = $1", [rows[0].user_id]);
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
