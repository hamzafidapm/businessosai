"use client";
import { useState } from "react";
export function useAuthForm() {
  const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  return { err, setErr, ok, setOk, busy, setBusy };
}
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div className="field"><label>{label}</label>{children}</div>);
}
