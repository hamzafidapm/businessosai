"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { api } from "@/lib/client";
const SUGGESTED = ["What was my net profit last month?", "Which product had the highest contribution profit this quarter?", "How much COD is still outstanding with each courier?", "Which expense category increased the most this month?", "Which products are below their reorder level?", "Show me orders with missing product costs that make profit incomplete."];
export default function Ai() {
  const [q, setQ] = useState(""); const [answer, setAnswer] = useState(""); const [tools, setTools] = useState<any[]>([]); const [links, setLinks] = useState<string[]>([]); const [messageId, setMessageId] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [feedback, setFeedback] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  async function loadHistory() { try { const d = await api("/api/ai"); setHistory(d.history); } catch { /* ignore */ } }
  useEffect(() => { loadHistory(); }, []);
  async function ask(question: string) {
    setErr(""); setBusy(true); setFeedback("");
    try {
      const d = await api("/api/ai", { method: "POST", body: JSON.stringify({ question }) });
      setAnswer(d.answer); setTools(d.tools); setLinks(d.links); setMessageId(d.messageId); loadHistory();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function sendFeedback(f: string) {
    if (!messageId) return;
    await api(`/api/ai/${messageId}/feedback`, { method: "POST", body: JSON.stringify({ feedback: f }) });
    setFeedback(f);
  }
  return (<Shell title="AI Accountant">
    <p className="muted">Read-only. Answers come from your saved records via allowlisted tools only — the assistant cannot create, edit, delete, pay, or change settings. It shows the date range and formula for every financial answer and says when data is missing. Imported notes are treated as data, never as instructions.</p>
    {err && <div className="err">{err}</div>}
    <form className="card" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
      <div className="field"><label>Ask about your business</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What was my net profit last month?" /></div>
      <button disabled={busy}>{busy ? "Checking your records…" : "Ask"}</button>
      <div style={{ marginTop: 12 }}>{SUGGESTED.map((s) => (<button key={s} type="button" className="secondary" style={{ marginRight: 8, marginBottom: 8 }} onClick={() => { setQ(s); ask(s); }}>{s}</button>))}</div>
    </form>
    {answer && (<div className="card" style={{ marginTop: 14 }}><h3>Answer</h3><p style={{ whiteSpace: "pre-wrap" }}>{answer}</p>
      <p className="muted">Tools used: {tools.map((t) => t.tool).join(", ") || "none"} · Sources: {links.join(", ")}</p>
      <div className="row"><button type="button" className="secondary" onClick={() => sendFeedback("helpful")}>👍 Helpful</button><button type="button" className="secondary" onClick={() => sendFeedback("not_helpful")}>👎 Not helpful</button>{feedback && <span className="ok">Thanks — feedback recorded.</span>}</div>
    </div>)}
    <h3>Conversation history</h3>
    {history.length === 0 ? <p className="muted">No questions yet.</p> : history.slice(0, 20).map((h: any, i: number) => (<div key={i}><strong>{h.role}:</strong> {h.content}</div>))}
  </Shell>);
}
