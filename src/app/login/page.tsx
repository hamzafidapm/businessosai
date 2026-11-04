"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
export default function Login() {
  const router = useRouter(); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message || "Login failed");
      const me = await (await fetch("/api/auth/me")).json();
      if (me.workspaces?.length) { localStorage.setItem("bos_ws", me.workspaces[0].workspace_id); router.push("/dashboard"); }
      else router.push("/workspaces/new");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (<main className="main" style={{ maxWidth: 520, margin: "0 auto" }}><h1>Log in to BusinessOS AI</h1>
    {err && <div className="err">{err}</div>}
    <form onSubmit={submit} className="card">
      <div className="field"><label>Email</label><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label>Password</label><input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <button disabled={busy}>{busy ? "Signing in…" : "Log in"}</button>
    </form>
    <p><Link href="/signup">Create an account</Link> · <Link href="/reset-password">Forgot password?</Link></p>
    <p className="muted">Demo workspace (seeded separately, clearly labelled): demo@businessos.example / Demo1234! — only if the demo seed was run.</p>
  </main>);
}
