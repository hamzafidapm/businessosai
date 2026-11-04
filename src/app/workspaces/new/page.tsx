"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function NewWorkspace() {
  const router = useRouter(); const [name, setName] = useState(""); const [businessType, setBusinessType] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, business_type: businessType || null }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error?.message || "Could not create workspace");
      localStorage.setItem("bos_ws", d.workspace.id); router.push("/dashboard");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (<main className="main" style={{ maxWidth: 560, margin: "0 auto" }}><h1>Create your business workspace</h1>
    <p className="muted">Step 1 of onboarding: business profile. Next, add products and costs, then orders or an import. Currency defaults to PKR, timezone Asia/Karachi.</p>
    {err && <div className="err">{err}</div>}
    <form onSubmit={submit} className="card">
      <div className="field"><label>Business name</label><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My Online Store" /></div>
      <div className="field"><label>Business type (optional)</label><input value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="Sole proprietor, partnership, company…" /></div>
      <div className="field"><label>Selling channels</label><select multiple aria-label="Selling channels"><option>Shopify</option><option>Daraz</option><option>Instagram</option><option>Facebook</option><option>WhatsApp</option><option>Own Website</option><option>Other</option></select><p className="muted">Channels are pre-created for every workspace; pick them when you add orders.</p></div>
      <button disabled={busy}>{busy ? "Creating…" : "Create workspace"}</button>
    </form>
  </main>);
}
