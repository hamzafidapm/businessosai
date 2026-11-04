"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api, fmtMoney } from "@/lib/client";
export default function Products() {
  const [list, setList] = useState<any[]>([]); const [q, setQ] = useState(""); const [err, setErr] = useState(""); const [ok, setOk] = useState("");
  const [form, setForm] = useState({ sku: "", name: "", category: "", selling_price: "", current_unit_cost: "", opening_stock: 0, reorder_level: 0 });
  async function load() { try { const d = await api(`/api/products?q=${encodeURIComponent(q)}`); setList(d.products); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { load(); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setOk("");
    try { await api("/api/products", { method: "POST", body: JSON.stringify({ ...form, selling_price: form.selling_price || "0", current_unit_cost: form.current_unit_cost || null }) }); setOk("Product saved. Cost history preserved from this point."); setForm({ sku: "", name: "", category: "", selling_price: "", current_unit_cost: "", opening_stock: 0, reorder_level: 0 }); load(); } catch (e: any) { setErr(e.message); }
  }
  return (<Shell title="Products">
    <p className="muted">SKU is unique per workspace. Changing unit cost later creates a cost-history entry; old orders keep their cost snapshot, so historic profit does not change.</p>
    {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
    <form onSubmit={submit} className="card"><h3>Add product</h3>
      <div className="row">
        <div className="field"><label>SKU *</label><input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
        <div className="field"><label>Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="field"><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
        <div className="field"><label>Selling price (PKR)</label><input required value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} placeholder="1500.00" /></div>
        <div className="field"><label>Unit cost (PKR, optional — leave blank to flag incomplete)</label><input value={form.current_unit_cost} onChange={(e) => setForm({ ...form, current_unit_cost: e.target.value })} placeholder="800.00" /></div>
        <div className="field"><label>Opening stock</label><input type="number" min={0} value={form.opening_stock} onChange={(e) => setForm({ ...form, opening_stock: Number(e.target.value) })} /></div>
        <div className="field"><label>Reorder level</label><input type="number" min={0} value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })} /></div>
      </div><button>Add product</button>
    </form>
    <div className="row" style={{ marginTop: 14 }}><div className="field"><label>Search SKU or name</label><input value={q} onChange={(e) => setQ(e.target.value)} /></div><div className="field"><label>&nbsp;</label><button className="secondary" onClick={load}>Search</button></div></div>
    {list.length === 0 ? <p className="muted">No products yet. Add your first product above, or import products from Imports.</p> : (
      <table><thead><tr><th>SKU</th><th>Name</th><th>Price</th><th>Cost</th><th>On hand</th><th>Reorder</th></tr></thead><tbody>
        {list.map((p: any) => (<tr key={p.id}><td>{p.sku}</td><td>{p.name}</td><td>{fmtMoney(p.selling_price)}</td><td>{p.current_unit_cost === null ? "Incomplete cost data" : fmtMoney(p.current_unit_cost)}</td><td>{p.on_hand}</td><td>{p.reorder_level}</td></tr>))}
      </tbody></table>)}
  </Shell>);
}
