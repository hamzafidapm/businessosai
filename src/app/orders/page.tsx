"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api, fmtMoney, today } from "@/lib/client";
export default function Orders() {
  const [list, setList] = useState<any[]>([]); const [err, setErr] = useState(""); const [ok, setOk] = useState("");
  const [form, setForm] = useState({ order_number: "", order_date: today(), status: "Confirmed", payment_status: "Unpaid", customer_name: "", shipping_charged: "0", discount: "0" });
  const [items, setItems] = useState([{ sku: "", quantity: 1, unit_price: "", discount: "0", unit_cost: "" }]);
  async function load() { try { const d = await api("/api/orders"); setList(d.orders); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { load(); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setOk("");
    try {
      await api("/api/orders", { method: "POST", body: JSON.stringify({ ...form, items: items.map((i) => ({ sku: i.sku, quantity: i.quantity, unit_price: i.unit_price || "0", discount: i.discount || "0", unit_cost: i.unit_cost || null })) }) });
      setOk("Order saved. Delivery does not imply payment — payment status is tracked separately."); load();
    } catch (e: any) { setErr(e.message); }
  }
  async function setStatus(id: string, status: string) {
    try { await api(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setOk(`Order moved to ${status}. ${status === "Shipped" ? "Stock was deducted (if the product was found)." : ""}`); load(); } catch (e: any) { setErr(e.message); }
  }
  return (<Shell title="Orders">
    {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
    <form onSubmit={submit} className="card"><h3>Create order</h3>
      <div className="row">
        <div className="field"><label>Order number *</label><input required value={form.order_number} onChange={(e) => setForm({ ...form, order_number: e.target.value })} /></div>
        <div className="field"><label>Order date</label><input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} /></div>
        <div className="field"><label>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{["Draft","Confirmed","Processing","Shipped","Delivered","Cancelled","Return Initiated","Returned","Partially Refunded","Refunded"].map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label>Payment status</label><select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value })}>{["Unpaid","Partially Paid","Paid","Refunded"].map((s) => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label>Customer name (optional)</label><input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
        <div className="field"><label>Shipping charged (shown separately)</label><input value={form.shipping_charged} onChange={(e) => setForm({ ...form, shipping_charged: e.target.value })} /></div>
        <div className="field"><label>Order discount</label><input value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></div>
      </div>
      <h4>Items</h4>
      {items.map((it, i) => (<div className="row" key={i}>
        <div className="field"><label>SKU *</label><input required value={it.sku} onChange={(e) => { const c = [...items]; c[i].sku = e.target.value; setItems(c); }} /></div>
        <div className="field"><label>Qty</label><input type="number" min={1} value={it.quantity} onChange={(e) => { const c = [...items]; c[i].quantity = Number(e.target.value); setItems(c); }} /></div>
        <div className="field"><label>Unit price</label><input required value={it.unit_price} onChange={(e) => { const c = [...items]; c[i].unit_price = e.target.value; setItems(c); }} /></div>
        <div className="field"><label>Line discount</label><input value={it.discount} onChange={(e) => { const c = [...items]; c[i].discount = e.target.value; setItems(c); }} /></div>
        <div className="field"><label>Unit cost override (blank = product cost)</label><input value={it.unit_cost} onChange={(e) => { const c = [...items]; c[i].unit_cost = e.target.value; setItems(c); }} /></div>
      </div>))}
      <div className="row"><button type="button" className="secondary" onClick={() => setItems([...items, { sku: "", quantity: 1, unit_price: "", discount: "0", unit_cost: "" }])}>Add item</button><button>Create order</button></div>
    </form>
    {list.length === 0 ? <p className="muted">No orders yet.</p> : (
      <table><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Payment</th><th>Line net</th><th>Actions</th></tr></thead><tbody>
        {list.map((o: any) => (<tr key={o.id}><td>{o.order_number}</td><td>{String(o.order_date).slice(0, 10)}</td><td>{o.status}{o.voided ? " (voided)" : ""}</td><td>{o.payment_status}</td><td>{fmtMoney(o.line_net)}</td>
          <td><select defaultValue="" onChange={(e) => e.target.value && setStatus(o.id, e.target.value)}><option value="">Change status…</option>{["Confirmed","Processing","Shipped","Delivered","Cancelled","Returned"].map((s) => <option key={s} value={s}>{s}</option>)}</select></td></tr>))}
      </tbody></table>)}
  </Shell>);
}
