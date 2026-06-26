// Shared types + leaderboard math used by the API and the UI.

export type Member = { id: string; name: string };

export type EntryDTO = {
  id: string;
  type: "BET" | "TRANSFER";
  status: "APPROVED" | "DISPUTED" | "VOIDED";
  amountCents: number;
  description: string;
  createdAt: string;
  resolvedAt: string | null;
  createdBy: Member;
  payer: Member; // owes / loser
  payee: Member; // owed / winner
};

export type BoardRow = { id: string; name: string; netCents: number };

/**
 * Net position per member from APPROVED entries.
 * payee gains the amount, payer loses it.
 * `betsOnly` restricts to type === "BET" (the bet-only board); otherwise all
 * approved entries count (the overall board).
 */
export function computeBoard(
  members: Member[],
  entries: EntryDTO[],
  betsOnly: boolean
): BoardRow[] {
  const net = new Map<string, number>();
  for (const m of members) net.set(m.id, 0);

  for (const e of entries) {
    if (e.status !== "APPROVED") continue;
    if (betsOnly && e.type !== "BET") continue;
    net.set(e.payee.id, (net.get(e.payee.id) ?? 0) + e.amountCents);
    net.set(e.payer.id, (net.get(e.payer.id) ?? 0) - e.amountCents);
  }

  return members
    .map((m) => ({ id: m.id, name: m.name, netCents: net.get(m.id) ?? 0 }))
    .sort((a, b) => b.netCents - a.netCents);
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

export type PnlSeries = {
  // ISO timestamps: a baseline point followed by one per approved bet.
  labels: string[];
  players: { id: string; name: string; values: number[] }[];
};

/**
 * Cumulative profit/loss per member over time, from APPROVED BETs only,
 * ordered chronologically. Each player's `values` is a running net total: it
 * starts at 0 (baseline) and steps at every bet (payee +amount, payer -amount).
 * labels.length === each player's values.length.
 */
export function computePnlSeries(members: Member[], entries: EntryDTO[]): PnlSeries {
  const bets = entries
    .filter((e) => e.type === "BET" && e.status === "APPROVED")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const players = members.map((m) => ({ id: m.id, name: m.name, values: [0] }));
  const cum = new Map<string, number>(players.map((p) => [p.id, 0]));
  const labels: string[] = [bets.length ? bets[0].createdAt : ""];

  for (const e of bets) {
    cum.set(e.payee.id, (cum.get(e.payee.id) ?? 0) + e.amountCents);
    cum.set(e.payer.id, (cum.get(e.payer.id) ?? 0) - e.amountCents);
    labels.push(e.createdAt);
    for (const p of players) p.values.push(cum.get(p.id) ?? 0);
  }

  return { labels, players };
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
