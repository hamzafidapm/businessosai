"use client";
import { useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
function ResetInner() {
  const params = useSearchParams(); const token = params.get("token");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [msg, setMsg] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const url = token ? "/api/auth/reset-password" : "/api/auth/forgot-password";
    const body = token ? { token, password } : { email };
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setMsg(res.ok ? (token ? "Password reset. You can now log in." : "If an account exists for that email, a reset link has been requested (in development it is logged, not emailed).") : "Request failed.");
  }
  return (<main className="main" style={{ maxWidth: 520, margin: "0 auto" }}><h1>{token ? "Choose a new password" : "Reset your password"}</h1>
    {msg && <div className="ok">{msg}</div>}
    <form onSubmit={submit} className="card">
      {token ? (<div className="field"><label>New password (at least 8 characters)</label><input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>)
        : (<div className="field"><label>Email</label><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>)}
      <button>Submit</button>
    </form>
  </main>);
}
export default function Reset() { return (<Suspense><ResetInner /></Suspense>); }
