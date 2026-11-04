export function getWs(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("bos_ws");
}
export function setWs(id: string) { localStorage.setItem("bos_ws", id); }
export async function api(path: string, opts: RequestInit = {}): Promise<any> {
  const ws = getWs();
  const sep = path.includes("?") ? "&" : "?";
  const url = ws && !path.includes("ws=") && !path.startsWith("/api/auth") && !path.startsWith("/api/workspaces") ? `${path}${sep}ws=${encodeURIComponent(ws)}` : path;
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Request failed (${res.status})`);
  return data;
}
export function fmtMoney(v: string | number | null | undefined, currency = "PKR"): string {
  const n = Number(v ?? 0);
  return `${currency} ${n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function today(): string { return new Date().toISOString().slice(0, 10); }
export function monthAgo(): string { return new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10); }
