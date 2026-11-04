import { query } from "@/lib/db";
import { issueResetToken, devLogLink } from "@/lib/auth";
import { jsonBody } from "@/lib/api-helpers";
import { errorResponse } from "@/lib/errors";
export async function POST(req: Request) {
  try {
    const body: any = await jsonBody(req);
    const email = String(body.email || "").toLowerCase();
    const { rows } = await query("SELECT id FROM users WHERE email = $1", [email]);
    // Always return ok so an attacker cannot enumerate accounts.
    if (rows[0]) {
      const token = await issueResetToken(rows[0].id);
      devLogLink("password reset", `${process.env.APP_URL || "http://localhost:3000"}/reset-password?token=${token}`);
    }
    return Response.json({ ok: true });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
