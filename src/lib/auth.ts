import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import { query } from "./db";
import { unauthorized } from "./errors";

export type SessionUser = { id: string; name: string; email: string; email_verified_at: string | null };
const COOKIE = "businessos_session";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set to a long random value (see .env.example).");
  return s;
}
export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}
export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}
export function newToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, hash };
}
export function maskReference(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (ref.length <= 4) return "••••";
  return `••••${ref.slice(-4)}`;
}
export async function createSession(userId: string): Promise<string> {
  // Fail closed: sessions must never be issued without a long SESSION_SECRET.
  // (secret() was previously defined but never called, so the requirement
  // was unenforced; it is now checked on both issue and validation.)
  secret();
  const { token, hash } = newToken();
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await query("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1,$2,$3)", [userId, hash, expires.toISOString()]);
  return token;
}
export function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 3600,
  });
}
export function clearSessionCookie() {
  cookies().set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}
export async function getSessionUser(): Promise<SessionUser | null> {
  secret();
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.email_verified_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`, [hash]);
  return (rows[0] as SessionUser) || null;
}
export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw unauthorized();
  return u;
}
export async function destroySession() {
  const token = cookies().get(COOKIE)?.value;
  if (token) {
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    await query("DELETE FROM sessions WHERE token_hash = $1", [hash]).catch(() => undefined);
  }
  clearSessionCookie();
}
// Email verification / reset: signed time-limited token hashes stored in DB.
// With no SMTP configured, the caller logs the link in development only (see auth routes).
// Production must configure SMTP; the code never claims an email was sent when it was not.
export async function issueVerificationToken(userId: string): Promise<string> {
  const { token, hash } = newToken();
  await query("INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)",
    [userId, hash, new Date(Date.now() + 24 * 3600 * 1000).toISOString()]);
  return token;
}
export async function issueResetToken(userId: string): Promise<string> {
  const { token, hash } = newToken();
  await query("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)",
    [userId, hash, new Date(Date.now() + 3600 * 1000).toISOString()]);
  return token;
}
export function devLogLink(label: string, url: string) {
  if (!process.env.SMTP_HOST) {
    console.log(JSON.stringify({ level: "info", msg: `DEV ONLY — ${label} (no SMTP configured, email NOT sent)`, url }));
  }
}
export { secret };
