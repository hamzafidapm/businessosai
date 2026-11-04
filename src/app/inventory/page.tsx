"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api, fmtMoney } from "@/lib/client";
export default function Inventory() {
  const [data, setData] = useState<any>(null); const [err, setErr] = useState(""); const [ok, setOk] = useState("");
  const [form, setForm] = useState({ product_id: "", movement_type: "stock-in", quantity_delta: 1, unit_cost: "", reason: "" });
  async function load() { try { setData(await api("/api/inventory")); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { load(); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setOk("");
    try {
      const r = await api("/api/inventory", { method: "POST", body: JSON.stringify({ ...form, quantity_delta: form.movement_type === "stock-in" || form.movement_type === "return-to-stock" ? Math.abs(form.quantity_delta) : -Math.abs(form.quantity_delta), unit_cost: form.unit_cost || null }) });
      setOk(`Movement saved. New on-hand: ${r.onHand}${r.override ? " (negative-stock override used and audited)." : ""}`); load();
    } catch (e: any) { setErr(e.message); }
  }
  return (<Shell title="Inventory">
    <p className="muted">Costing: weighted-average cost, disclosed on the dashboard. Stock is deducted on Shipped and restored only by a return-to-stock movement. Negative stock is blocked unless the owner enables the override in Settings (audited).</p>
    {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
    {data?.lowStock?.length > 0 && <div className="warn">Low stock: {data.lowStock.map((p: any) => `${p.name} (${p.sku}) — ${p.on_hand} left`).join("; ")}</div>}
    <form onSubmit={submit} className="card"><h3>Record movement</h3>
      <div className="row">
        <div className="field"><label>Product *</label><select required value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}><option value="">Choose…</option>{(data?.products || []).map((p: any) => <option key={p.id} value={p.id}>{p.name} ({p.sku}) — {p.on_hand} on hand</option>)}</select></div>
        <div className="field"><label>Movement</label><select value={form.movement_type} onChange={(e) => setForm({ ...form, movement_type: e.target.value })}><option value="stock-in">Stock-in</option><option value="stock-out">Stock-out</option><option value="adjustment">Adjustment</option><option value="return-to-stock">Return-to-stock</option><option value="damaged">Damaged / unsellable</option></select></div>
        <div className="field"><label>Quantity</label><input type="number" min={1} value={form.quantity_delta} onChange={(e) => setForm({ ...form, quantity_delta: Number(e.target.value) })} /></div>
        <div className="field"><label>Unit cost (for stock-in)</label><input value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} /></div>
        <div className="field"><label>Reason *</label><input required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Supplier delivery" /></div>
      </div><button>Record movement</button>
    </form>
    <h3>Stock overview</h3>
    {(data?.products || []).length === 0 ? <p className="muted">No products yet.</p> : (
      <table><thead><tr><th>SKU</th><th>Name</th><th>On hand</th><th>Reorder</th><th>Unit cost</th><th>Est. value</th></tr></thead><tbody>
        {(data?.products || []).map((p: any) => (<tr key={p.id}><td>{p.sku}</td><td>{p.name}</td><td>{p.on_hand}</td><td>{p.reorder_level}</td><td>{p.current_unit_cost === null ? "—" : fmtMoney(p.current_unit_cost)}</td><td>{fmtMoney(p.est_value)}</td></tr>))}
      </tbody></table>)}
    <h3>Movement ledger</h3>
    {(data?.movements || []).map((m: any) => (<div key={m.id}>{String(m.movement_at).slice(0, 10)} — {m.sku}: {m.movement_type} {m.quantity_delta} — {m.reason}</div>))}
  </Shell>);
}
