"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/client";
import { formatCents, type Member } from "@/lib/ledger";
import { balanceCents, computeSettlements, type PokerPlayer } from "@/lib/poker";

type Row = { id: string; name: string; included: boolean; buyIn: string; cashOut: string };

function toCents(v: string): number {
  const n = Math.round(parseFloat(v) * 100);
  return Number.isFinite(n) ? n : 0;
}

// Resolve a poker game from buy-ins + cash-outs into settled bet entries.
// Marked experimental — the settlement is computed live and previewed before
// anything is written to the ledger.
export function PokerForm({
  code,
  members,
  onResolved,
}: {
  code: string;
  members: Member[];
  onResolved: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(
    members.map((m) => ({ id: m.id, name: m.name, included: true, buyIn: "", cashOut: "" }))
  );
  const [label, setLabel] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function update(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const players: PokerPlayer[] = useMemo(
    () =>
      rows
        .filter((r) => r.included)
        .map((r) => ({ id: r.id, name: r.name, buyInCents: toCents(r.buyIn), cashOutCents: toCents(r.cashOut) })),
    [rows]
  );

  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const off = balanceCents(players);
  const balanced = off === 0;
  const hasAction = players.some((p) => p.cashOutCents - p.buyInCents !== 0);
  const settlements = useMemo(
    () => (balanced && players.length >= 2 ? computeSettlements(players) : []),
    [balanced, players]
  );
  const canSubmit = players.length >= 2 && balanced && hasAction && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!canSubmit) return;
    setBusy(true);
    try {
      await api(`/api/groups/${code}/poker`, {
        method: "POST",
        body: {
          label,
          players: players.map((p) => ({ id: p.id, buyInCents: p.buyInCents, cashOutCents: p.cashOutCents })),
        },
      });
      onResolved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (members.length < 2) {
    return (
      <div className="panel muted">
        You need at least 2 members to resolve a poker game. Share the code so others can join.
      </div>
    );
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>Resolve a poker game</h2>
        <span className="badge type" title="This feature is experimental" style={{ flex: "none" }}>
          ⚗︎ Experimental
        </span>
      </div>
      <p className="muted">
        Enter each player&apos;s total buy-in and final chips ($). When the chips balance, we settle
        up with the fewest payments and post them as bets. <em>Experimental — double-check the
        preview before resolving.</em>
      </p>

      <label>Game label (optional)</label>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Friday night" />

      <div style={{ marginTop: 12 }}>
        {rows.map((r) => {
          const net = toCents(r.cashOut) - toCents(r.buyIn);
          return (
            <div key={r.id} className={`pk-row${r.included ? "" : " out"}`}>
              <label className="pk-head">
                <input
                  type="checkbox"
                  checked={r.included}
                  onChange={(e) => update(r.id, { included: e.target.checked })}
                />
                {r.name}
                <span className={`pk-net ${r.included && net > 0 ? "pos" : r.included && net < 0 ? "neg" : "muted"}`}>
                  {r.included ? formatCents(net) : "—"}
                </span>
              </label>
              <div className="pk-fields">
                <div className="pk-field">
                  <label>Buy-in $</label>
                  <input
                    value={r.buyIn}
                    onChange={(e) => update(r.id, { buyIn: e.target.value })}
                    disabled={!r.included}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>
                <div className="pk-field">
                  <label>Cash-out $</label>
                  <input
                    value={r.cashOut}
                    onChange={(e) => update(r.id, { cashOut: e.target.value })}
                    disabled={!r.included}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="muted" style={{ marginTop: 10 }}>
        {balanced ? (
          <span className="pos">✓ Chips balance</span>
        ) : (
          <span className="neg">
            Off by {formatCents(Math.abs(off))} — cash-outs must equal buy-ins ({off > 0 ? "too much" : "too little"}{" "}
            cashed out)
          </span>
        )}
      </div>

      {balanced && settlements.length > 0 && (
        <div className="panel" style={{ marginTop: 12, background: "var(--panel-2)" }}>
          <h2>Settlement preview</h2>
          {settlements.map((s, i) => (
            <div key={i} className="entry" style={{ padding: "6px 0" }}>
              <strong>{nameById.get(s.fromId)}</strong> pays <strong>{nameById.get(s.toId)}</strong>{" "}
              <span className="pos">{formatCents(s.amountCents)}</span>
            </div>
          ))}
          <p className="muted" style={{ marginTop: 8 }}>
            {settlements.length} payment{settlements.length === 1 ? "" : "s"} will be posted as approved bets.
            Anyone involved can dispute one, and the group creator resolves disputes.
          </p>
        </div>
      )}

      {err && <div className="error">{err}</div>}
      <div style={{ marginTop: 14 }}>
        <button className="block" disabled={!canSubmit}>
          {busy ? "…" : "Resolve game"}
        </button>
      </div>
    </form>
  );
}
