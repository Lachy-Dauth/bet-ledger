"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, ApiError, forgetGroup, getSession, rememberGroup, setSession, type Session } from "@/lib/client";
import { formatCents, formatWhen, type BoardRow, type EntryDTO, type Member } from "@/lib/ledger";
import { AuthForm } from "../../AuthForm";
import { PnlChart } from "./PnlChart";
import { PokerForm } from "./PokerForm";

type GroupData = {
  group: { id: string; name: string; code: string; createdById: string };
  members: Member[];
  entries: EntryDTO[];
  boards: { bets: BoardRow[]; overall: BoardRow[] };
};

type Tab = "ledger" | "add" | "poker" | "boards" | "pnl";

export default function GroupPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code || "").toUpperCase();

  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [data, setData] = useState<GroupData | null>(null);
  const [tab, setTab] = useState<Tab>("ledger");
  const [err, setErr] = useState("");
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);

  // Turn an API failure into the right UI: a stale session (401) drops us to the
  // sign-in form; a missing group (404) is forgotten so it stops haunting lists.
  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 401) {
        setMe(null);
        return;
      }
      if (e instanceof ApiError && e.status === 404) forgetGroup(code);
      setErr((e as Error).message);
    },
    [code]
  );

  // Just reload the group (membership already established).
  const load = useCallback(async () => {
    try {
      const d = await api<GroupData>(`/api/groups/${code}`);
      setData(d);
      rememberGroup({ code: d.group.code, name: d.group.name });
      setErr("");
    } catch (e) {
      handleError(e);
    }
  }, [code, handleError]);

  // The share link IS the invite: joining is idempotent, so for any signed-in
  // visitor we join (a no-op if already a member) then load the group.
  const joinAndLoad = useCallback(async () => {
    try {
      await api("/api/groups/join", { method: "POST", body: { code } });
      await load();
    } catch (e) {
      handleError(e);
    }
  }, [code, load, handleError]);

  useEffect(() => {
    const s = getSession();
    if (s) {
      setMe(s.user);
      joinAndLoad();
    }
    setReady(true);
  }, [joinAndLoad]);

  function onSignedIn(s: Session) {
    setSession(s);
    setMe(s.user);
    joinAndLoad();
  }

  if (!ready) return null;

  // Not signed in: let them log in or sign up right here, then auto-join.
  if (!me) {
    return (
      <>
        <h1>🎲 Bet Ledger</h1>
        <p className="muted">
          You&apos;ve been invited to group <span className="code-pill">{code}</span>. Log in or sign up to join.
        </p>
        <AuthForm onSignedIn={onSignedIn} subtitle={`Sign in to join group ${code}.`} />
        <p className="muted">
          <a href="/">← Home</a>
        </p>
      </>
    );
  }

  if (err && !data) {
    return (
      <>
        <p className="error">{err}</p>
        <a href="/">← Back home</a>
      </>
    );
  }
  if (!data) return <p className="muted">Joining…</p>;

  function copyLink() {
    const url = `${window.location.origin}/g/${code}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <a href="/" className="muted">
          ← Home
        </a>
        <span className="muted">Signed in as {me.name}</span>
      </div>

      <h1>{data.group.name}</h1>
      <div className="panel">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="muted">Share code</div>
            <span className="code-pill">{data.group.code}</span>
          </div>
          <button className="ghost" style={{ flex: "none" }} onClick={copyLink}>
            {copied ? "Copied!" : "Copy share link"}
          </button>
        </div>
        <div className="muted" style={{ marginTop: 10 }}>
          {data.members.length} member{data.members.length === 1 ? "" : "s"}:{" "}
          {data.members.map((m) => m.name).join(", ")}
        </div>
      </div>

      <div className="tabs">
        <button className={tab === "ledger" ? "active" : ""} onClick={() => setTab("ledger")}>
          Ledger
        </button>
        <button className={tab === "add" ? "active" : ""} onClick={() => setTab("add")}>
          Add
        </button>
        <button className={tab === "poker" ? "active" : ""} onClick={() => setTab("poker")}>
          Poker
        </button>
        <button className={tab === "boards" ? "active" : ""} onClick={() => setTab("boards")}>
          Leaderboards
        </button>
        <button className={tab === "pnl" ? "active" : ""} onClick={() => setTab("pnl")}>
          PnL Graph
        </button>
      </div>

      {err && <div className="error">{err}</div>}

      {tab === "ledger" && <Ledger data={data} meId={me.id} onChange={load} setErr={setErr} />}
      {tab === "add" && (
        <AddForm
          code={code}
          members={data.members}
          meId={me.id}
          onAdded={() => {
            setTab("ledger");
            load();
          }}
        />
      )}
      {tab === "poker" && (
        <PokerForm
          code={code}
          members={data.members}
          onResolved={() => {
            setTab("ledger");
            load();
          }}
        />
      )}
      {tab === "boards" && <Boards boards={data.boards} />}
      {tab === "pnl" && <PnlChart members={data.members} entries={data.entries} />}
    </>
  );
}

function Ledger({
  data,
  meId,
  onChange,
  setErr,
}: {
  data: GroupData;
  meId: string;
  onChange: () => void;
  setErr: (s: string) => void;
}) {
  async function act(id: string, path: string, body?: unknown) {
    try {
      await api(`/api/entries/${id}/${path}`, { method: "POST", body });
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (data.entries.length === 0) {
    return <div className="panel muted">No entries yet. Add a bet or transfer.</div>;
  }

  const amOwner = meId === data.group.createdById;
  const ownerName = data.members.find((m) => m.id === data.group.createdById)?.name ?? "the group creator";

  return (
    <div className="panel">
      {data.entries.map((e) => {
        const amParty = e.payer.id === meId || e.payee.id === meId;
        const isApproved = e.status === "APPROVED";
        const isDisputed = e.status === "DISPUTED";
        const isVoided = e.status === "VOIDED";
        return (
          <div key={e.id} className="entry">
            <div className="line">
              <div>
                <span className="badge type">{e.type}</span>{" "}
                <strong>{e.payer.name}</strong> {e.type === "BET" ? "loses to" : "owes"}{" "}
                <strong>{e.payee.name}</strong>{" "}
                <span
                  className={isApproved ? "pos" : ""}
                  style={isVoided ? { textDecoration: "line-through", opacity: 0.6 } : undefined}
                >
                  {formatCents(e.amountCents)}
                </span>
              </div>
              <span className={`badge ${e.status}`}>{e.status}</span>
            </div>
            {e.description && <div className="desc">“{e.description}”</div>}
            <div className="desc">
              {formatWhen(e.createdAt)} · added by {e.createdBy.name}
              {isDisputed && !amOwner && ` · awaiting ${ownerName} to resolve`}
            </div>
            {isApproved && amParty && (
              <div className="actions">
                <button className="red small" onClick={() => act(e.id, "dispute")}>
                  Dispute
                </button>
              </div>
            )}
            {isDisputed && amOwner && (
              <div className="actions">
                <button className="green small" onClick={() => act(e.id, "resolve", { outcome: "uphold" })}>
                  Uphold
                </button>
                <button className="red small" onClick={() => act(e.id, "resolve", { outcome: "void" })}>
                  Void
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AddForm({
  code,
  members,
  meId,
  onAdded,
}: {
  code: string;
  members: Member[];
  meId: string;
  onAdded: () => void;
}) {
  const others = members.filter((m) => m.id !== meId);
  const [type, setType] = useState<"BET" | "TRANSFER">("BET");
  // For a BET: who won, who lost. For a TRANSFER: who paid (payee), who owes (payer).
  const [loserId, setLoserId] = useState(meId);
  const [winnerId, setWinnerId] = useState(others[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setErr("Enter a positive amount");
      return;
    }
    if (loserId === winnerId) {
      setErr("Pick two different people");
      return;
    }
    setBusy(true);
    try {
      await api(`/api/groups/${code}/entries`, {
        method: "POST",
        body: { type, payerId: loserId, payeeId: winnerId, amountCents, description: desc },
      });
      onAdded();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (members.length < 2) {
    return (
      <div className="panel muted">
        You need at least 2 members to record anything. Share the code so someone can join.
      </div>
    );
  }

  const loserLabel = type === "BET" ? "Loser (pays)" : "Who owes (pays)";
  const winnerLabel = type === "BET" ? "Winner (gets paid)" : "Who paid (gets paid back)";

  return (
    <form className="panel" onSubmit={submit}>
      <h2>Record a {type === "BET" ? "bet" : "transfer"}</h2>
      <label>Type</label>
      <select value={type} onChange={(e) => setType(e.target.value as "BET" | "TRANSFER")}>
        <option value="BET">Bet</option>
        <option value="TRANSFER">Transfer (e.g. food)</option>
      </select>

      <div className="row">
        <div>
          <label>{loserLabel}</label>
          <select value={loserId} onChange={(e) => setLoserId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.id === meId ? " (you)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>{winnerLabel}</label>
          <select value={winnerId} onChange={(e) => setWinnerId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.id === meId ? " (you)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label>Amount ($)</label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="10.00"
        inputMode="decimal"
      />

      <label>Note (optional)</label>
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What was it for?" />

      <p className="muted" style={{ marginTop: 10 }}>
        Posts immediately and counts on the board. Either player can dispute it; the group creator
        resolves any disputes.
      </p>

      {err && <div className="error">{err}</div>}
      <div style={{ marginTop: 12 }}>
        <button disabled={busy}>{busy ? "…" : "Add to ledger"}</button>
      </div>
    </form>
  );
}

function Boards({ boards }: { boards: { bets: BoardRow[]; overall: BoardRow[] } }) {
  return (
    <div className="boards">
      <BoardTable title="Bets only" rows={boards.bets} />
      <BoardTable title="Overall (bets + transfers)" rows={boards.overall} />
    </div>
  );
}

function BoardTable({ title, rows }: { title: string; rows: BoardRow[] }) {
  return (
    <div className="panel">
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th className="num">Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td className={`num ${r.netCents > 0 ? "pos" : r.netCents < 0 ? "neg" : ""}`}>
                {formatCents(r.netCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ marginTop: 8 }}>
        Approved entries only.
      </p>
    </div>
  );
}
