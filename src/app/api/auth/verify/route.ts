import { query } from "@/lib/db";
import { jsonBody } from "@/lib/api-helpers";
import { errorResponse, badRequest } from "@/lib/errors";
import crypto from "crypto";
export async function POST(req: Request) {
  try {
    const body: any = await jsonBody(req);
    const token = String(body.token || "");
    if (!token) throw badRequest("Verification token is required.");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const { rows } = await query("SELECT user_id FROM email_verification_tokens WHERE token_hash = $1 AND expires_at > now() AND used_at IS NULL", [hash]);
    if (!rows[0]) throw badRequest("This verification link is invalid or expired.");
    await query("UPDATE email_verification_tokens SET used_at = now() WHERE token_hash = $1", [hash]);
    await query("UPDATE users SET email_verified_at = now() WHERE id = $1", [rows[0].user_id]);
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
