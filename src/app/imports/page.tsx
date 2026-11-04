"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api } from "@/lib/client";
const MODULES = ["products","orders","expenses","settlements"];
export default function Imports() {
  const [module, setModule] = useState("products"); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<any>(null); const [batches, setBatches] = useState<any[]>([]); const [templates, setTemplates] = useState<any>({});
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [courierName, setCourierName] = useState(""); const [settlementReference, setSettlementReference] = useState("");
  async function load() { try { const d = await api("/api/imports"); setBatches(d.batches); setTemplates(d.templates); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { load(); }, []);
  function downloadTemplate() {
    const cols = templates[module] || [];
    const blob = new Blob([cols.join(",") + "\n"], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${module}-template.csv`; a.click();
  }
  async function run(commit: boolean) {
    if (!file) { setErr("Choose a CSV or XLSX file first."); return; }
    setErr(""); setOk("");
    try {
      const buf = await file.arrayBuffer();
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const d = await api("/api/imports", { method: "POST", body: JSON.stringify({ module, filename: file.name, fileBase64: b64, commit, courierName, settlementReference }) });
      if (commit) { setOk(`Import committed: ${d.imported} row(s) imported, ${d.rejected} rejected. Rejected rows are listed below.`); setPreview({ rejectedRows: d.rejectedRows }); load(); }
      else setPreview(d);
    } catch (e: any) { setErr(e.message); }
  }
  return (<Shell title="Imports">
    <p className="muted">Wizard: upload → preview (valid / warning / error counts, duplicate flags) → commit. Commits are transactional and the same file cannot be imported twice for the same module. Max 5 MB. Download a template first if you are unsure of the columns.</p>
    {err && <div className="err">{err}</div>}{ok && <div className="ok">{ok}</div>}
    <div className="card">
      <div className="row">
        <div className="field"><label>Module</label><select value={module} onChange={(e) => setModule(e.target.value)}>{MODULES.map((m) => <option key={m}>{m}</option>)}</select></div>
        <div className="field"><label>File (CSV or XLSX)</label><input type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
      </div>
      {module === "settlements" && (<div className="row">
        <div className="field"><label>Courier name (for settlement import)</label><input value={courierName} onChange={(e) => setCourierName(e.target.value)} placeholder="e.g. TCS" /></div>
        <div className="field"><label>Settlement reference</label><input value={settlementReference} onChange={(e) => setSettlementReference(e.target.value)} /></div>
      </div>)}
      <div className="row"><button type="button" className="secondary" onClick={downloadTemplate}>Download {module} template</button><button type="button" className="secondary" onClick={() => run(false)}>Preview</button><button type="button" onClick={() => run(true)}>Commit import</button></div>
      {preview && !preview.rejectedRows && (<div style={{ marginTop: 12 }}><p>Preview: {preview.validCount} valid, {preview.errorCount} with errors/duplicates, {preview.total} total. Columns detected: {preview.headers?.join(", ")}</p>
        {(preview.preview || []).slice(0, 20).map((p: any) => (<div key={p.row}>Row {p.row}: {p.errors.length ? `Errors: ${p.errors.join("; ")}` : p.duplicate ? "Duplicate row — will be skipped" : "OK"}</div>))}</div>)}
      {preview?.rejectedRows?.length > 0 && (<div style={{ marginTop: 12 }}><h4>Rejected rows (download these reasons with your file)</h4>{preview.rejectedRows.map((p: any) => (<div key={p.row}>Row {p.row}: {p.errors.join("; ") || "Duplicate"}</div>))}</div>)}
    </div>
    <h3>Import history</h3>
    {batches.length === 0 ? <p className="muted">No imports yet.</p> : (
      <table><thead><tr><th>Module</th><th>File</th><th>Rows</th><th>Errors</th><th>Date</th></tr></thead><tbody>
        {batches.map((b: any) => (<tr key={b.id}><td>{b.module}</td><td>{b.filename}</td><td>{b.row_count}</td><td>{b.error_count}</td><td>{String(b.created_at).slice(0, 10)}</td></tr>))}
      </tbody></table>)}
  </Shell>);
}
