"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, getSession, rememberGroup } from "@/lib/client";
import { formatCents, formatWhen, type BoardRow, type EntryDTO, type Member } from "@/lib/ledger";
import { PnlChart } from "./PnlChart";
import { PokerForm } from "./PokerForm";

type GroupData = {
  group: { id: string; name: string; code: string };
  members: Member[];
  entries: EntryDTO[];
  boards: { bets: BoardRow[]; overall: BoardRow[] };
};

type Tab = "ledger" | "add" | "poker" | "boards" | "pnl";

export default function GroupPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = (params.code || "").toUpperCase();

  const [me, setMe] = useState<{ id: string; name: string } | null>(null);
  const [data, setData] = useState<GroupData | null>(null);
  const [tab, setTab] = useState<Tab>("ledger");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<GroupData>(`/api/groups/${code}`);
      setData(d);
      rememberGroup({ code: d.group.code, name: d.group.name });
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [code]);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace("/");
      return;
    }
    setMe(s.user);
    load();
  }, [load, router]);

  if (!me) return null;
  if (err && !data) {
    return (
      <>
        <p className="error">{err}</p>
        <a href="/">← Back home</a>
      </>
    );
  }
  if (!data) return <p className="muted">Loading…</p>;

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
  async function resolve(id: string, action: "approve" | "dispute") {
    try {
      await api(`/api/entries/${id}/${action}`, { method: "POST" });
      onChange();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (data.entries.length === 0) {
    return <div className="panel muted">No entries yet. Add a bet or transfer.</div>;
  }

  return (
    <div className="panel">
      {data.entries.map((e) => {
        const canResolve = e.status === "PENDING" && e.payer.id === meId;
        return (
          <div key={e.id} className="entry">
            <div className="line">
              <div>
                <span className="badge type">{e.type}</span>{" "}
                <strong>{e.payer.name}</strong> {e.type === "BET" ? "loses to" : "owes"}{" "}
                <strong>{e.payee.name}</strong>{" "}
                <span className={e.status === "APPROVED" ? "pos" : ""}>{formatCents(e.amountCents)}</span>
              </div>
              <span className={`badge ${e.status}`}>{e.status}</span>
            </div>
            {e.description && <div className="desc">“{e.description}”</div>}
            <div className="desc">
              {formatWhen(e.createdAt)} · added by {e.createdBy.name}
              {e.status === "PENDING" && e.payer.id !== meId && ` · awaiting ${e.payer.name}'s approval`}
            </div>
            {canResolve && (
              <div className="actions">
                <button className="green small" onClick={() => resolve(e.id, "approve")}>
                  Approve
                </button>
                <button className="red small" onClick={() => resolve(e.id, "dispute")}>
                  Dispute
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
        {loserId === meId
          ? "You're the payer, so this is approved immediately."
          : `${members.find((m) => m.id === loserId)?.name ?? "The payer"} will need to approve or dispute it.`}
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
