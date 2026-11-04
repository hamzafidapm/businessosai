"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
function VerifyInner() {
  const params = useSearchParams(); const [msg, setMsg] = useState("Verifying…");
  useEffect(() => {
    const token = params.get("token");
    if (!token) { setMsg("No verification token supplied."); return; }
    fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(async (r) => { const d = await r.json(); setMsg(r.ok ? "Email verified. You can now use BusinessOS AI." : (d?.error?.message || "Verification failed.")); });
  }, []);
  return (<main className="main" style={{ maxWidth: 560, margin: "0 auto" }}><h1>Email verification</h1><p>{msg}</p></main>);
}
export default function Verify() { return (<Suspense><VerifyInner /></Suspense>); }
