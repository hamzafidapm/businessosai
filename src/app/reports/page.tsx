"use client";
import { useState } from "react";
import Shell from "@/components/Shell";
import { api, getWs, fmtMoney, monthAgo, today } from "@/lib/client";
const TYPES = [["pl","Profit & Loss"],["sales","Sales"],["expenses","Expenses"],["products","Product profitability"],["cod","COD outstanding"],["inventory","Inventory"],["tax","Tax summary (estimate only)"],["trend","Sales trend"]];
export default function Reports() {
  const [type, setType] = useState("pl"); const [from, setFrom] = useState(monthAgo()); const [to, setTo] = useState(today()); const [rows, setRows] = useState<any[]>([]); const [err, setErr] = useState("");
  async function load() { try { const d = await api(`/api/reports?type=${type}&from=${from}&to=${to}`); setRows(d.rows); } catch (e: any) { setErr(e.message); } }
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const exportUrl = (fmt: string) => `/api/reports?type=${type}&from=${from}&to=${to}&format=${fmt}&ws=${encodeURIComponent(getWs() || "")}`;
  return (<Shell title="Reports">
    <p className="muted">All reports use the same profit engine as the dashboard and AI. Exports respect your workspace and the selected filters.</p>
    <div className="row">
      <div className="field"><label>Report</label><select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="field"><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
      <div className="field"><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      <div className="field"><label>&nbsp;</label><button onClick={load}>Run report</button></div>
    </div>
    <div className="row" style={{ marginTop: 10 }}>
      <a href={exportUrl("csv")}><button type="button" className="secondary">Export CSV</button></a>
      <a href={exportUrl("xlsx")}><button type="button" className="secondary">Export XLSX</button></a>
      <a href={exportUrl("pdf")}><button type="button" className="secondary">Export PDF</button></a>
    </div>
    {err && <div className="err">{err}</div>}
    {type === "tax" && <div className="warn">Tax summary is an estimate only — not tax or legal advice. Confirm with a qualified Pakistani tax professional. Rates are configurable in Settings; no unverified rate is hard-coded.</div>}
    {rows.length === 0 ? <p className="muted">Run a report to see rows. Formulas: net sales = gross − discounts − refunds − order discount (shipping shown separately by default); gross profit = net − COGS; contribution = gross − variable expenses; operating profit = contribution − operating expenses; margin = profit ÷ net sales (N/A when net sales are zero).</p> : (
      <table><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>
        {rows.map((r: any, i: number) => (<tr key={i}>{headers.map((h) => <td key={h}>{typeof r[h] === "object" ? JSON.stringify(r[h]) : String(r[h] ?? "")}</td>)}</tr>))}
      </tbody></table>)}
  </Shell>);
}
