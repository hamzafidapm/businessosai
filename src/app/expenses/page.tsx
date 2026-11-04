"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api, fmtMoney, today } from "@/lib/client";
export default function Expenses() {
  const [list, setList] = useState<any[]>([]); const [err, setErr] = useState(""); const [ok, setOk] = useState("");
  const [form, setForm] = useState({ expense_date: today(), category_name: "Advertising", category_type: "variable", amount: "", payee: "", payment_method: "", status: "Posted" });
  async function load() { try { const d = await api("/api/expenses"); setList(d.expenses); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { load(); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setOk("");
    try { await api("/api/expenses", { method: "POST", body: JSON.stringify(form) }); setOk("Expense saved. Only Posted expenses count in reports; Draft and Void do not."); load(); } catch (e: any) { setErr(e.message); }
  }
  async function voidIt(id: string) { try { await api(`/api/expenses/${id}`, { method: "PATCH", body: JSON.stringify({ status: "Void" }) }); load(); } catch (e: any) { setErr(e.message); } }
  return (<Shell title="Expenses">
    <p className="muted">Voided expenses are kept for audit but excluded from totals. Tick “already included” only via API/import if a courier charge is already in an order — otherwise the same cost would be counted twice.</p>
    {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
    <form onSubmit={submit} className="card"><h3>Add expense</h3>
      <div className="row">
        <div className="field"><label>Date</label><input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
        <div className="field"><label>Category *</label><input required value={form.category_name} onChange={(e) => setForm({ ...form, category_name: e.target.value })} /></div>
        <div className="field"><label>Category type</label><select value={form.category_type} onChange={(e) => setForm({ ...form, category_type: e.target.value })}><option value="variable">Variable (ads/courier/fees)</option><option value="operating">Operating</option><option value="tax">Tax</option><option value="other">Other</option></select></div>
        <div className="field"><label>Amount (PKR) *</label><input required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="5000.00" /></div>
        <div className="field"><label>Payee / vendor</label><input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} /></div>
        <div className="field"><label>Payment method</label><input value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} /></div>
        <div className="field"><label>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>Draft</option><option>Posted</option></select></div>
      </div><button>Add expense</button>
    </form>
    {list.length === 0 ? <p className="muted">No expenses yet.</p> : (
      <table><thead><tr><th>Date</th><th>Category</th><th>Payee</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>
        {list.map((x: any) => (<tr key={x.id}><td>{String(x.expense_date).slice(0, 10)}</td><td>{x.category_name}</td><td>{x.payee || "—"}</td><td>{fmtMoney(x.amount)}</td><td>{x.status}</td><td>{x.status !== "Void" && <button className="secondary" onClick={() => voidIt(x.id)}>Void</button>}</td></tr>))}
      </tbody></table>)}
  </Shell>);
}
