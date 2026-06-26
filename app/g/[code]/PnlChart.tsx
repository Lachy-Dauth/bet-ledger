"use client";

import { computePnlSeries, formatCents, formatWhen, type EntryDTO, type Member } from "@/lib/ledger";

const COLORS = [
  "#5b8cff",
  "#3fbf7f",
  "#e8b34a",
  "#ef5f6b",
  "#b06bff",
  "#43c6d6",
  "#f08a5d",
  "#7ee081",
];

// Self-contained SVG line chart — cumulative PnL per member over approved bets.
// No charting dependency; equal x-spacing per bet (chronological), real dates
// labelled on the axis.
export function PnlChart({ members, entries }: { members: Member[]; entries: EntryDTO[] }) {
  const { labels, players } = computePnlSeries(members, entries);
  const n = labels.length;

  if (n <= 1) {
    return (
      <div className="panel muted">
        No approved bets yet — the PnL graph appears once bets are approved.
      </div>
    );
  }

  const W = 720;
  const H = 320;
  const padL = 52;
  const padR = 16;
  const padT = 16;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  let maxV = 0;
  let minV = 0;
  for (const p of players) {
    for (const v of p.values) {
      if (v > maxV) maxV = v;
      if (v < minV) minV = v;
    }
  }
  if (maxV === minV) {
    maxV += 100;
    minV -= 100;
  }

  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + (1 - (v - minV) / (maxV - minV)) * plotH;
  const zeroY = y(0);

  return (
    <div className="panel">
      <h2>PnL over time — bets only</h2>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cumulative profit and loss per player">
        {/* y guides */}
        <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="var(--border)" />
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--border)" strokeDasharray="4 4" />
        <text x={padL - 8} y={y(maxV) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
          {formatCents(maxV)}
        </text>
        <text x={padL - 8} y={zeroY + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
          $0
        </text>
        <text x={padL - 8} y={y(minV) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">
          {formatCents(minV)}
        </text>

        {/* x date labels: first and last bet */}
        <text x={padL} y={H - 14} textAnchor="start" fontSize="11" fill="var(--muted)">
          {formatWhen(labels[1] ?? labels[0])}
        </text>
        <text x={W - padR} y={H - 14} textAnchor="end" fontSize="11" fill="var(--muted)">
          {formatWhen(labels[n - 1])}
        </text>

        {/* one line per player */}
        {players.map((p, idx) => {
          const color = COLORS[idx % COLORS.length];
          const pts = p.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
          const lastX = x(n - 1);
          const lastY = y(p.values[n - 1]);
          return (
            <g key={p.id}>
              <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
              <circle cx={lastX} cy={lastY} r="3" fill={color} />
            </g>
          );
        })}
      </svg>

      <div className="legend">
        {players.map((p, idx) => (
          <span key={p.id} className="legend-item">
            <span className="swatch" style={{ background: COLORS[idx % COLORS.length] }} />
            {p.name}
            <span className={p.values[n - 1] > 0 ? "pos" : p.values[n - 1] < 0 ? "neg" : "muted"}>
              {" "}
              {formatCents(p.values[n - 1])}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
