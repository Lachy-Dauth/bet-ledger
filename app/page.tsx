"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  getSavedGroups,
  getSession,
  rememberGroup,
  setSession,
  type SavedGroup,
  type Session,
} from "@/lib/client";
import { AuthForm } from "./AuthForm";

export default function Home() {
  const router = useRouter();
  const [session, setSess] = useState<Session | null>(null);
  const [groups, setGroups] = useState<SavedGroup[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSess(getSession());
    setGroups(getSavedGroups());
    setReady(true);
  }, []);

  if (!ready) return null;

  function onSignedIn(s: Session) {
    setSession(s);
    setSess(s);
  }

  function signOut() {
    setSession(null);
    setSess(null);
  }

  function goToGroup(g: SavedGroup) {
    rememberGroup(g);
    router.push(`/g/${g.code}`);
  }

  return (
    <>
      <h1>🎲 Bet Ledger</h1>
      <p className="muted">Private group ledgers for bets and transfers between friends.</p>

      {!session ? (
        <AuthForm onSignedIn={onSignedIn} />
      ) : (
        <>
          <div className="panel">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                Signed in as <strong>{session.user.name}</strong>
              </div>
              <button className="ghost small" style={{ flex: "none" }} onClick={signOut}>
                Sign out
              </button>
            </div>
          </div>

          <GroupActions onJoined={goToGroup} />

          <div className="panel">
            <h2>Your groups</h2>
            {groups.length === 0 ? (
              <p className="muted">No groups yet. Create one or join with a code above.</p>
            ) : (
              groups.map((g) => (
                <div key={g.code} className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
                  <a href={`/g/${g.code}`} onClick={(e) => { e.preventDefault(); goToGroup(g); }}>
                    <strong>{g.name}</strong> <span className="muted">· {g.code}</span>
                  </a>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}

function GroupActions({ onJoined }: { onJoined: (g: SavedGroup) => void }) {
  const [newName, setNewName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const { group } = await api<{ group: SavedGroup }>("/api/groups", {
        method: "POST",
        body: { name: newName },
      });
      onJoined(group);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const { group } = await api<{ group: SavedGroup }>("/api/groups/join", {
        method: "POST",
        body: { code: code.toUpperCase() },
      });
      onJoined(group);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h2>Start or join a group</h2>
      <form onSubmit={create}>
        <label>Create a new group</label>
        <div className="row tight">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Group name" />
          <button style={{ flex: "none" }} disabled={busy || !newName.trim()}>
            Create
          </button>
        </div>
      </form>
      <form onSubmit={join}>
        <label>Join with a 6-letter code</label>
        <div className="row tight">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDEF"
            maxLength={6}
            style={{ letterSpacing: "0.2em", textTransform: "uppercase" }}
          />
          <button className="ghost" style={{ flex: "none" }} disabled={busy || code.length < 6}>
            Join
          </button>
        </div>
      </form>
      {err && <div className="error">{err}</div>}
    </div>
  );
}
