import Link from "next/link";
export default function Home() {
  return (
    <main className="main" style={{ margin: "0 auto" }}>
      <h1>BusinessOS AI</h1>
      <p style={{ fontSize: 18 }}>Know your real profit. Sales, costs, expenses, courier COD and inventory in one trusted record — for Pakistani e-commerce sellers.</p>
      <div className="row"><Link href="/signup"><button>Sign up free</button></Link><Link href="/login"><button className="secondary">Log in</button></Link></div>
      <div className="grid">
        <div className="card"><h3>Profit, not just revenue</h3><p className="muted">Net sales, COGS from historic cost snapshots, and posted expenses in one tested formula.</p></div>
        <div className="card"><h3>COD reconciliation</h3><p className="muted">Import courier settlements by CSV/XLSX, match by tracking number, and see what is still outstanding.</p></div>
        <div className="card"><h3>AI Accountant (read-only)</h3><p className="muted">Answers grounded in your saved records, with date range and formula shown. It never edits records or invents totals.</p></div>
      </div>
      <div className="card"><h3>Pricing — placeholder</h3><p className="muted">Plans and prices are not finalised (PRD §15). Free trial, Starter, Growth and an AI add-on are planned; no payment gateway is built in v1. Contact us for pilot access.</p></div>
      <p className="muted">Tax summaries are estimates only and are not tax or legal advice. Confirm obligations with a qualified Pakistani tax professional. Marketplace and courier integrations are not live in v1 — CSV/manual import is the supported workflow.</p>
      <p><Link href="/login">Log in</Link> · Privacy: we collect the minimum needed to run your workspace; customer contact details are optional. Account export and deletion can be requested from Settings.</p>
    </main>
  );
}
