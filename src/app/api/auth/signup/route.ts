import { query } from "@/lib/db";
import { hashPassword, createSession, setSessionCookie, issueVerificationToken, devLogLink } from "@/lib/auth";
import { parseBody, signupSchema } from "@/lib/validation";
import { jsonBody } from "@/lib/api-helpers";
import { errorResponse, conflict, logEvent } from "@/lib/errors";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import crypto from "crypto";
export async function POST(req: Request) {
  try {
    if (!rateLimit(`auth:${clientIp(req)}`, Number(process.env.RATE_LIMIT_AUTH || 20))) return Response.json({ error: { code: "rate_limited", message: "Too many attempts. Please try again in a minute." } }, { status: 429 });
    const data = parseBody(signupSchema, await jsonBody(req));
    const email = data.email.toLowerCase();
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length) throw conflict("An account with this email already exists.");
    const hash = await hashPassword(data.password);
    const user = (await query("INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id, name, email", [data.name, email, hash])).rows[0];
    const token = await issueVerificationToken(user.id);
    devLogLink("email verification", `${process.env.APP_URL || "http://localhost:3000"}/verify?token=${token}`);
    // Accept any pending workspace invites for this email (invite token hashes are
    // stored, not the email link itself; expiry is enforced here).
    const invites = (await query("SELECT id, workspace_id, role FROM workspace_invites WHERE email = $1 AND accepted_at IS NULL AND expires_at > now()", [email])).rows;
    for (const inv of invites) {
      await query("INSERT INTO workspace_members (workspace_id, user_id, role, status, joined_at) VALUES ($1,$2,$3,'active',now()) ON CONFLICT DO NOTHING", [inv.workspace_id, user.id, inv.role]);
      await query("UPDATE workspace_invites SET accepted_at = now() WHERE id = $1", [inv.id]);
    }
    const session = await createSession(user.id);
    setSessionCookie(session);
    logEvent("signup_completed", { user_id: user.id });
    return Response.json({ user: { id: user.id, name: user.name, email: user.email, emailVerified: false } }, { status: 201 });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
