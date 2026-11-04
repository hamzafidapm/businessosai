import { requireUser, type SessionUser } from "./auth";
import { requireMembership, type Membership } from "./tenant";
import { errorResponse } from "./errors";

export type Ctx = { user: SessionUser; membership: Membership; workspaceId: string };
export async function getCtx(req: Request): Promise<Ctx> {
  const user = await requireUser();
  const url = new URL(req.url);
  const ws = url.searchParams.get("ws") || "";
  if (!ws) throw new Error("workspace id (ws) is required");
  const membership = await requireMembership(user.id, ws);
  return { user, membership, workspaceId: ws };
}
export function withError(fn: (req: Request, ctx?: Ctx) => Promise<Response>) {
  return async (req: Request) => {
    try {
      // Routes that need a workspace pass ws; auth routes call fn directly without ctx.
      let ctx: Ctx | undefined;
      try {
        const url = new URL(req.url);
        if (url.searchParams.get("ws")) ctx = await getCtx(req);
      } catch (e: any) {
        // If ws was supplied but membership failed, surface that error.
        const url = new URL(req.url);
        if (url.searchParams.get("ws")) throw e;
      }
      return await fn(req, ctx);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
export async function jsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw new Error("Invalid JSON body"); }
}
export function rangeFrom(url: URL): { from: string; to: string } {
  const to = url.searchParams.get("to") || new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new Error("Invalid date range (use YYYY-MM-DD)");
  return { from, to };
}
