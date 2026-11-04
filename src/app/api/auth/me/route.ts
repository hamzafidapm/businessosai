import { getSessionUser } from "@/lib/auth";
import { listMemberships } from "@/lib/tenant";
import { errorResponse } from "@/lib/errors";
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return Response.json({ user: null, workspaces: [] });
    const workspaces = await listMemberships(user.id);
    return Response.json({ user: { id: user.id, name: user.name, email: user.email, emailVerified: Boolean(user.email_verified_at) }, workspaces });
  } catch (e) { return errorResponse(e); }
}
export const dynamic = "force-dynamic";
