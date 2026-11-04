"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
export default function Signup() {
  const router = useRouter(); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message || "Sign up failed");
      router.push("/workspaces/new");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (<main className="main" style={{ maxWidth: 520, margin: "0 auto" }}><h1>Create your account</h1>
    {err && <div className="err">{err}</div>}
    <form onSubmit={submit} className="card">
      <div className="field"><label>Full name</label><input required value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="field"><label>Email</label><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div className="field"><label>Password (at least 8 characters)</label><input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <button disabled={busy}>{busy ? "Creating…" : "Sign up"}</button>
    </form>
    <p>Already have an account? <Link href="/login">Log in</Link></p>
    <p className="muted">Email verification: if no email service is configured, the verification link is logged in development only and is not claimed as sent. See README.</p>
  </main>);
}
