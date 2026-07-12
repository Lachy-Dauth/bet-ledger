// Poker game settlement math — pure functions shared by the API (authoritative
// entry creation) and the UI (live preview). All amounts are integer cents.

export type PokerPlayer = {
  id: string;
  name?: string;
  buyInCents: number;
  cashOutCents: number;
};

export type Settlement = { fromId: string; toId: string; amountCents: number };

/** net = cash-out − buy-in (positive = up, negative = down). */
export function netCents(p: PokerPlayer): number {
  return p.cashOutCents - p.buyInCents;
}

/**
 * How far off the table is: sum(cash-outs) − sum(buy-ins). Should be 0 — chips
 * are conserved. Non-zero means a miscount (or money left on the table).
 */
export function balanceCents(players: PokerPlayer[]): number {
  return players.reduce((s, p) => s + netCents(p), 0);
}

/**
 * Minimal set of loser→winner payments that settles every net to zero.
 * Greedy max-debtor / max-creditor matching → at most n−1 transactions.
 * Assumes the table balances (balanceCents === 0); callers should check first.
 */
export function computeSettlements(players: PokerPlayer[]): Settlement[] {
  const creditors = players
    .map((p) => ({ id: p.id, amt: netCents(p) }))
    .filter((x) => x.amt > 0)
    .sort((a, b) => b.amt - a.amt);
  const debtors = players
    .map((p) => ({ id: p.id, amt: -netCents(p) }))
    .filter((x) => x.amt > 0)
    .sort((a, b) => b.amt - a.amt);

  const settlements: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0) {
      settlements.push({ fromId: debtors[i].id, toId: creditors[j].id, amountCents: pay });
    }
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return settlements;
}
