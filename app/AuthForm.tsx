"use client";

import { useState } from "react";
import { api, type Session } from "@/lib/client";

// Shared Log in / Sign up form. `subtitle` lets callers add context (e.g. when
// it's shown to join a group via a share link).
export function AuthForm({
  onSignedIn,
  subtitle,
}: {
  onSignedIn: (s: Session) => void;
  subtitle?: string;
}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next: "login" | "signup") {
    setMode(next);
    setErr("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const path = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const s = await api<Session>(path, { method: "POST", body: { name, pin } });
      onSignedIn(s);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="tabs">
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>
          Log in
        </button>
        <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")}>
          Sign up
        </button>
      </div>
      <p className="muted">
        {subtitle
          ? subtitle
          : mode === "login"
            ? "Welcome back — enter your name and PIN."
            : "New here? Pick a name and a PIN to create your account."}
      </p>
      <label>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alice" autoComplete="off" />
      <label>PIN (4–8 digits)</label>
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        placeholder="••••"
        inputMode="numeric"
        type="password"
      />
      {err && <div className="error">{err}</div>}
      <div style={{ marginTop: 14 }}>
        <button className="block" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </div>
    </form>
  );
}
