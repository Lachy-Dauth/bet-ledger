// Shared types + leaderboard math used by the API and the UI.

export type Member = { id: string; name: string };

export type EntryDTO = {
  id: string;
  type: "BET" | "TRANSFER";
  status: "PENDING" | "APPROVED" | "DISPUTED";
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
