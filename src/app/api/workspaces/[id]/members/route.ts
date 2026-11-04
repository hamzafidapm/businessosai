import { query } from "@/lib/db";
import { requireUser, newToken } from "@/lib/auth";
import { requireMembership, canManageSettings, forbidden } from "@/lib/tenant";
import { jsonBody } from "@/lib/api-helpers";
import { errorResponse } from "@/lib/errors";
import { audit } from "@/lib/audit";
// Invite by email: if the user already exists they are added directly; otherwise a
// pending invite is stored (token hash only). No role escalation: invite role cannot be owner.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireUser();
    const m = await requireMembership(user.id, params.id);
    if (!canManageSettings(m.role)) throw forbidden("Only owners/admins can invite team members.");
    const body: any = await jsonBody(req);
    const email = String(body.email || "").toLowerCase();
    const role = String(body.role || "viewer");
    if (!email.includes("@") || !["admin","finance","operations","viewer"].includes(role)) throw new Error("Valid email and role (admin/finance/operations/viewer) are required.");
    const existing = (await query("SELECT id FROM users WHERE email=$1", [email])).rows[0];
    if (existing) {
      await query("INSERT INTO workspace_members (workspace_id, user_id, role, status, invited_by, joined_at) VALUES ($1,$2,$3,'active',$4,now()) ON CONFLICT (workspace_id, user_id) DO UPDATE SET role=EXCLUDED.role, status='active'", [params.id, existing.id, role, user.id]);
    } else {
      const { hash } = newToken();
      await query("INSERT INTO workspace_invites (workspace_id, email, role, invited_by, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5, now() + interval '7 days')", [params.id, email, role, user.id, hash]);
    }
    await audit(params.id, user.id, "member_invited", "workspace_member", email, null, { role });
    return Response.json({ ok: true, added: Boolean(existing) });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
