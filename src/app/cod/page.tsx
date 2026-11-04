"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api, fmtMoney } from "@/lib/client";
export default function Cod() {
  const [couriers, setCouriers] = useState<any[]>([]); const [shipments, setShipments] = useState<any[]>([]); const [settlements, setSettlements] = useState<any[]>([]); const [cod, setCod] = useState<any[]>([]);
  const [err, setErr] = useState(""); const [ok, setOk] = useState("");
  const [courier, setCourier] = useState({ name: "", account_reference_masked: "" });
  const [ship, setShip] = useState({ courier_id: "", tracking_number: "", expected_cod: "", shipping_fee: "0", status: "Pending" });
  const [settle, setSettle] = useState({ courier_id: "", reference: "", gross_amount: "", deductions: "0", net_amount: "", linesText: "" });
  async function load() {
    try {
      const [c, s, st, d] = await Promise.all([api("/api/couriers"), api("/api/shipments"), api("/api/settlements"), api("/api/reports?type=cod")]);
      setCouriers(c.couriers); setShipments(s.shipments); setSettlements(st.settlements); setCod(d.rows);
    } catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { load(); }, []);
  return (<Shell title="COD & Couriers">
    <p className="muted">No live courier integration in v1. Use manual entry or settlement CSV/XLSX import (Imports page). Account references are masked in the UI.</p>
    {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
    <div className="card"><h3>COD outstanding</h3>
      {cod.length === 0 ? <p className="muted">No outstanding COD.</p> : (
        <table><thead><tr><th>Tracking</th><th>Courier</th><th>Order</th><th>Expected</th><th>Received</th><th>Outstanding</th><th>Aging</th></tr></thead><tbody>
          {cod.map((r: any, i: number) => (<tr key={i}><td>{r.trackingNumber}</td><td>{r.courier || "—"}</td><td>{r.orderNumber || "—"}</td><td>{fmtMoney(r.expected)}</td><td>{fmtMoney(r.received)}</td><td>{fmtMoney(r.outstanding)}</td><td>{r.agingBucket} ({r.ageDays}d)</td></tr>))}
        </tbody></table>)}
    </div>
    <div className="grid">
      <form className="card" onSubmit={async (e) => { e.preventDefault(); try { await api("/api/couriers", { method: "POST", body: JSON.stringify(courier) }); setOk("Courier saved."); setCourier({ name: "", account_reference_masked: "" }); load(); } catch (e: any) { setErr(e.message); } }}>
        <h3>Add courier</h3>
        <div className="field"><label>Name *</label><input required value={courier.name} onChange={(e) => setCourier({ ...courier, name: e.target.value })} placeholder="e.g. TCS, Leopards, M&P" /></div>
        <div className="field"><label>Account reference (masked on save)</label><input value={courier.account_reference_masked} onChange={(e) => setCourier({ ...courier, account_reference_masked: e.target.value })} /></div>
        <button>Add courier</button>
        <ul>{couriers.map((c: any) => <li key={c.id}>{c.name}{c.account_reference_masked ? ` (${c.account_reference_masked})` : ""}</li>)}</ul>
      </form>
      <form className="card" onSubmit={async (e) => { e.preventDefault(); try { await api("/api/shipments", { method: "POST", body: JSON.stringify(ship) }); setOk("Shipment saved."); load(); } catch (e: any) { setErr(e.message); } }}>
        <h3>Add shipment</h3>
        <div className="field"><label>Courier</label><select value={ship.courier_id} onChange={(e) => setShip({ ...ship, courier_id: e.target.value })}><option value="">Choose…</option>{couriers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Tracking / consignment *</label><input required value={ship.tracking_number} onChange={(e) => setShip({ ...ship, tracking_number: e.target.value })} /></div>
        <div className="field"><label>Expected COD (PKR) *</label><input required value={ship.expected_cod} onChange={(e) => setShip({ ...ship, expected_cod: e.target.value })} /></div>
        <div className="field"><label>Shipping fee</label><input value={ship.shipping_fee} onChange={(e) => setShip({ ...ship, shipping_fee: e.target.value })} /></div>
        <button>Add shipment</button>
      </form>
    </div>
    <form className="card" onSubmit={async (e) => {
      e.preventDefault(); setErr(""); setOk("");
      try {
        const lines = settle.linesText.split("\n").filter(Boolean).map((line) => { const [tracking_number, amount, fee] = line.split(",").map((s) => s.trim()); return { tracking_number, amount, fee: fee || "0" }; });
        await api("/api/settlements", { method: "POST", body: JSON.stringify({ courier_id: settle.courier_id || null, reference: settle.reference, gross_amount: settle.gross_amount, deductions: settle.deductions, net_amount: settle.net_amount, lines }) });
        setOk("Settlement saved and lines auto-matched by tracking number. Check Matched / Short Paid / Overpaid / Unmatched below."); load();
      } catch (e: any) { setErr(e.message); }
    }}>
      <h3>Record settlement manually</h3><p className="muted">Lines: one per row as <code>tracking_number,amount,fee</code>. For full imports with preview and duplicate checks, use Imports → settlements.</p>
      <div className="row">
        <div className="field"><label>Courier</label><select value={settle.courier_id} onChange={(e) => setSettle({ ...settle, courier_id: e.target.value })}><option value="">Choose…</option>{couriers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="field"><label>Reference *</label><input required value={settle.reference} onChange={(e) => setSettle({ ...settle, reference: e.target.value })} /></div>
        <div className="field"><label>Gross amount *</label><input required value={settle.gross_amount} onChange={(e) => setSettle({ ...settle, gross_amount: e.target.value })} /></div>
        <div className="field"><label>Deductions</label><input value={settle.deductions} onChange={(e) => setSettle({ ...settle, deductions: e.target.value })} /></div>
        <div className="field"><label>Net amount *</label><input required value={settle.net_amount} onChange={(e) => setSettle({ ...settle, net_amount: e.target.value })} /></div>
      </div>
      <div className="field"><label>Lines</label><textarea rows={4} value={settle.linesText} onChange={(e) => setSettle({ ...settle, linesText: e.target.value })} placeholder={"TRK123,1500,50\nTRK124,900,0"} /></div>
      <button>Record settlement</button>
    </form>
    <h3>Settlements</h3>
    {settlements.map((s: any) => (<div key={s.id} className="card"><strong>{s.reference}</strong> — {s.courier_name || "—"} — net {fmtMoney(s.net_amount)}
      <ul>{(s.lines || []).map((l: any, i: number) => <li key={i}>{l.tracking_number || l.order_number || "—"}: {fmtMoney(l.amount)} — {l.match_status} (difference {fmtMoney(l.difference)})</li>)}</ul></div>))}
    <h3>Shipments</h3>
    {shipments.map((s: any) => (<div key={s.id}>{s.tracking_number} — {s.courier_name || "—"} — expected {fmtMoney(s.expected_cod)} — {s.status}</div>))}
  </Shell>);
}
