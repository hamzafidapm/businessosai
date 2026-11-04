export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const badRequest = (msg: string) => new ApiError(400, "bad_request", msg);
export const unauthorized = (msg = "Please sign in.") => new ApiError(401, "unauthorized", msg);
export const forbidden = (msg = "You do not have permission for this workspace action.") => new ApiError(403, "forbidden", msg);
export const notFound = (msg = "Not found.") => new ApiError(404, "not_found", msg);
export const conflict = (msg: string) => new ApiError(409, "conflict", msg);
export function errorResponse(e: unknown): Response {
  if (e instanceof ApiError) {
    return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  }
  // Never leak stack traces / DB errors to the client; log server-side only.
  console.error(JSON.stringify({ level: "error", msg: "unhandled api error", err: e instanceof Error ? e.message : String(e) }));
  return Response.json({ error: { code: "internal_error", message: "Something went wrong. Please try again." } }, { status: 500 });
}
export function logEvent(event: string, fields: Record<string, unknown> = {}) {
  // Structured log without PII or secrets: callers must not pass raw emails, tokens, or amounts.
  console.log(JSON.stringify({ level: "info", event, ...fields, ts: new Date().toISOString() }));
}
