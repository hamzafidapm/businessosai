"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api, fmtMoney, monthAgo, today } from "@/lib/client";
export default function Dashboard() {
  const [data, setData] = useState<any>(null); const [from, setFrom] = useState(monthAgo()); const [to, setTo] = useState(today()); const [err, setErr] = useState(""); const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true); setErr("");
    try { setData(await api(`/api/dashboard?from=${from}&to=${to}`)); } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const s = data?.summary;
  return (<Shell title="Dashboard">
    <p className="muted">Figures are based on entered/imported data only. Date range is in Asia/Karachi display; records are stored in UTC.</p>
    <div className="row">
      <div className="field"><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      <div className="field"><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      <div className="field"><label>&nbsp;</label><button onClick={load}>Apply date range</button></div>
    </div>
    {loading && <p>Loading…</p>}
    {err && <div className="err">{err}</div>}
    {data?.alerts?.map((a: string, i: number) => (<div key={i} className="warn">{a}</div>))}
    {s && (<>
      <div className="grid">
        <div className="card"><div className="muted">Gross sales</div><div className="kpi">{fmtMoney(s.grossSales)}</div><p className="muted">Σ qty × unit price, before discounts/refunds.</p></div>
        <div className="card"><div className="muted">Net sales</div><div className="kpi">{fmtMoney(s.netSales)}</div><p className="muted">Gross − discounts − refunds − order discount. Shipping charged ({fmtMoney(s.shippingCharged)}) shown separately.</p></div>
        <div className="card"><div className="muted">Estimated operating profit</div><div className="kpi">{fmtMoney(s.estimatedOperatingProfit)}</div><p className="muted">Net − COGS − variable − operating expenses. Margin: {s.operatingMarginPct ?? "N/A (net sales are zero)"}.</p></div>
        <div className="card"><div className="muted">COD outstanding</div><div className="kpi">{fmtMoney(data.codOutstandingTotal)}</div><p className="muted">Expected COD − matched settlements. No double counting.</p></div>
        <div className="card"><div className="muted">Inventory value (estimate)</div><div className="kpi">{fmtMoney(data.inventoryValue)}</div><p className="muted">On-hand × weighted-average cost.</p></div>
        <div className="card"><div className="muted">Orders in period</div><div className="kpi">{s.orderCount}</div><p className="muted">{s.incomplete ? `Incomplete cost data: ${s.missingCostLines} line(s) missing unit cost.` : "Cost data complete for this period."}</p></div>
      </div>
      <div className="card"><h3>Order status</h3>{data.orderCounts?.length ? data.orderCounts.map((o: any) => (<span key={o.status} className="badge" style={{ marginRight: 8 }}>{o.status}: {o.n}</span>)) : <p className="muted">No orders yet. Add your first order or import a CSV to see profit here.</p>}</div>
      <div className="card"><h3>Top products by contribution profit</h3>{data.topProducts?.length ? (<table><thead><tr><th>Product</th><th>Units</th><th>Revenue</th><th>COGS</th><th>Contribution</th></tr></thead><tbody>{data.topProducts.map((p: any) => (<tr key={p.sku}><td>{p.name} ({p.sku}){p.incomplete && " — Incomplete cost data"}</td><td>{p.units}</td><td>{fmtMoney(p.revenue)}</td><td>{fmtMoney(p.cogs)}</td><td>{fmtMoney(p.contributionProfit)}</td></tr>))}</tbody></table>) : <p className="muted">No product sales in this period.</p>}</div>
      <div className="card"><h3>Daily trend (net sales / profit)</h3>{data.trend?.length ? data.trend.map((t: any) => (<div key={t.period}>{t.period}: net {fmtMoney(t.netSales)}, profit {fmtMoney(t.profit)}</div>)) : <p className="muted">No trend data yet.</p>}</div>
    </>)}
  </Shell>);
}
