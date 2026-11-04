"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, getWs, setWs } from "@/lib/client";
const NAV = [["/dashboard","Dashboard"],["/products","Products"],["/orders","Orders"],["/expenses","Expenses"],["/inventory","Inventory"],["/cod","COD & Couriers"],["/reports","Reports"],["/imports","Imports"],["/ai","AI Accountant"],["/settings","Settings"]];
export default function Shell({ children, title }: { children: ReactNode; title: string }) {
  const path = usePathname(); const router = useRouter();
  const [me, setMe] = useState<any>(null); const [err, setErr] = useState("");
  useEffect(() => {
    api("/api/auth/me").then((d) => {
      setMe(d);
      if (!d.user) router.push("/login");
      else if (d.workspaces?.length && !getWs()) setWs(d.workspaces[0].workspace_id);
      else if (!d.workspaces?.length) router.push("/workspaces/new");
    }).catch((e) => setErr(String(e.message)));
  }, []);
  const ws = me?.workspaces?.find((w: any) => w.workspace_id === getWs()) || me?.workspaces?.[0];
  return (
    <div className="layout">
      <nav className="sidebar" aria-label="Main navigation">
        <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 4 }}>BusinessOS AI</div>
        <div className="muted" style={{ color: "#9fb0c9", marginBottom: 14 }}>E-commerce Profit Intelligence</div>
        {NAV.map(([href, label]) => (<Link key={href} href={href} className={path === href ? "active" : ""}>{label}</Link>))}
        <div style={{ marginTop: 18 }}>
          <label style={{ color: "#9fb0c9" }}>Workspace</label>
          <select value={getWs() || ""} onChange={(e) => { setWs(e.target.value); location.reload(); }}>
            {(me?.workspaces || []).map((w: any) => (<option key={w.workspace_id} value={w.workspace_id}>{w.workspace_name}{w.is_demo ? " (DEMO)" : ""} — {w.role}</option>))}
          </select>
          {ws?.is_demo && <div style={{ marginTop: 8 }}><span className="badge demo">DEMO workspace — sample data only</span></div>}
          <div style={{ marginTop: 12 }}><button className="secondary" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); localStorage.removeItem("bos_ws"); router.push("/login"); }}>Log out</button></div>
        </div>
      </nav>
      <main className="main">
        <div className="topbar"><h1 style={{ margin: 0 }}>{title}</h1><span className="muted">{me?.user?.email || ""}</span></div>
        {err && <div className="err">{err}</div>}
        {children}
      </main>
    </div>
  );
}
