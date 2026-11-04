import { query } from "@/lib/db";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";
import { parseBody, loginSchema } from "@/lib/validation";
import { jsonBody } from "@/lib/api-helpers";
import { errorResponse, unauthorized } from "@/lib/errors";
import { rateLimit, clientIp } from "@/lib/rate-limit";
export async function POST(req: Request) {
  try {
    if (!rateLimit(`auth:${clientIp(req)}`, Number(process.env.RATE_LIMIT_AUTH || 20))) return Response.json({ error: { code: "rate_limited", message: "Too many attempts. Please try again in a minute." } }, { status: 429 });
    const data = parseBody(loginSchema, await jsonBody(req));
    const { rows } = await query("SELECT id, name, email, password_hash, email_verified_at FROM users WHERE email = $1", [data.email.toLowerCase()]);
    const user = rows[0];
    if (!user || !(await verifyPassword(data.password, user.password_hash))) throw unauthorized("Email or password is incorrect.");
    const session = await createSession(user.id);
    setSessionCookie(session);
    return Response.json({ user: { id: user.id, name: user.name, email: user.email, emailVerified: Boolean(user.email_verified_at) } });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
