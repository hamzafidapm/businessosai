"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api, getWs } from "@/lib/client";
export default function Settings() {
  const [data, setData] = useState<any>(null); const [err, setErr] = useState(""); const [ok, setOk] = useState("");
  const [inviteEmail, setInviteEmail] = useState(""); const [inviteRole, setInviteRole] = useState("viewer");
  const [tax, setTax] = useState({ tax_year: String(new Date().getFullYear()), business_type: "", registration_status: "", configuration_json: "{}" });
  const [logs, setLogs] = useState<any[]>([]);
  async function load() {
    const ws = getWs(); if (!ws) return;
    try {
      const d = await api(`/api/workspaces/${ws}`);
      setData(d);
      const a = await api(`/api/workspaces/${ws}/audit`);
      setLogs(a.logs);
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  async function saveSettings(patch: any) {
    const ws = getWs(); setErr(""); setOk("");
    try { const d = await api(`/api/workspaces/${ws}`, { method: "PATCH", body: JSON.stringify(patch) }); setData({ ...data, workspace: d.workspace }); setOk("Settings saved and audited."); } catch (e: any) { setErr(e.message); }
  }
  const w = data?.workspace;
  return (<Shell title="Settings">
    <p className="muted">Plan: entitlements placeholder only in v1 — no payment gateway. Current plan is shown for pilot admin override; prices are not finalised.</p>
    {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
    {w && (<>
      <div className="card"><h3>Business profile</h3><p>{w.name} — {w.country} — {w.default_currency} — {w.timezone} — Plan: free (placeholder)</p>
        <div className="row">
          <label><input type="checkbox" checked={Boolean(w.shipping_in_net_sales)} onChange={(e) => saveSettings({ shipping_in_net_sales: e.target.checked })} /> Include shipping charged in net sales (default: off — shown separately)</label>
          <label><input type="checkbox" checked={Boolean(w.allow_negative_stock)} onChange={(e) => saveSettings({ allow_negative_stock: e.target.checked })} /> Allow negative stock (owner override, audited)</label>
        </div>
        <p className="muted">Inventory costing: weighted-average cost. Tax: estimates only — see below.</p>
      </div>
      <form className="card" onSubmit={(e) => { e.preventDefault(); let cfg = {}; try { cfg = JSON.parse(tax.configuration_json); } catch { setErr("Tax configuration must be valid JSON."); return; } saveSettings({ taxProfile: { ...tax, configuration_json: cfg } }); }}>
        <h3>Tax settings (estimates only)</h3>
        <div className="warn">Estimates are informational, not tax or legal advice. Confirm obligations with a qualified Pakistani tax professional. No unverified rate is hard-coded; enter only rules you have validated.</div>
        <div className="row">
          <div className="field"><label>Tax year</label><input value={tax.tax_year} onChange={(e) => setTax({ ...tax, tax_year: e.target.value })} /></div>
          <div className="field"><label>Business type</label><input value={tax.business_type} onChange={(e) => setTax({ ...tax, business_type: e.target.value })} /></div>
          <div className="field"><label>Registration status</label><input value={tax.registration_status} onChange={(e) => setTax({ ...tax, registration_status: e.target.value })} /></div>
        </div>
        <div className="field"><label>Configuration (JSON, versioned on save)</label><textarea rows={4} value={tax.configuration_json} onChange={(e) => setTax({ ...tax, configuration_json: e.target.value })} placeholder='{"note": "Example only — enter validated rules"}' /></div>
        <button>Save tax profile</button>
        {data?.taxProfile && <p className="muted">Current: year {data.taxProfile.tax_year}, rules version {data.taxProfile.rules_version}</p>}
      </form>
      <form className="card" onSubmit={async (e) => { e.preventDefault(); const ws = getWs(); try { const d = await api(`/api/workspaces/${ws}/members`, { method: "POST", body: JSON.stringify({ email: inviteEmail, role: inviteRole }) }); setOk(d.added ? "Team member added." : "Invite recorded (pending until that user signs up)."); load(); } catch (e: any) { setErr(e.message); } }}>
        <h3>Team & roles</h3><p className="muted">Owner: full access. Admin: settings + team. Finance: records/reports/reconciliation. Operations: orders/products/inventory. Viewer: read-only. Server enforces roles on every route — hiding buttons is not security.</p>
        <ul>{(data?.members || []).map((m: any, i: number) => <li key={i}>{m.name} ({m.email}) — {m.role} — {m.status}</li>)}</ul>
        <div className="row">
          <div className="field"><label>Invite email</label><input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /></div>
          <div className="field"><label>Role</label><select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}><option value="admin">Admin</option><option value="finance">Finance</option><option value="operations">Operations</option><option value="viewer">Viewer</option></select></div>
        </div><button>Invite member</button>
      </form>
      <div className="card"><h3>Integrations (Phase 2/3 — not live)</h3><p className="muted">Shopify, Daraz, courier APIs and Meta Ads are documented placeholders only. CSV/manual import is the supported v1 workflow. No live connection is claimed.</p></div>
      <div className="card"><h3>Audit log</h3>{logs.length === 0 ? <p className="muted">No audited actions yet.</p> : logs.slice(0, 50).map((l: any) => (<div key={l.id}>{String(l.created_at).slice(0, 19)} — {l.actor_name || "—"} — {l.action} — {l.entity_type} {l.entity_id || ""}</div>))}</div>
    </>)}
  </Shell>);
}
