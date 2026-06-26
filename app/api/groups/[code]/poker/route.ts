import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser, requireMembership } from "@/lib/auth";
import { approvalsNeeded } from "@/lib/ledger";
import { balanceCents, computeSettlements, type PokerPlayer } from "@/lib/poker";

// Resolve a poker game: take each player's buy-in + cash-out, verify the table
// balances, compute the minimal loser->winner payments, and record them as BET
// entries (so they flow into the Bets leaderboard + PnL). Each entry follows the
// same approval rule as a manual bet: if the creator is the payer it auto-
// approves, otherwise the payer must approve/dispute.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { code } = await params;
    const m = await requireMembership(user.id, code.toUpperCase());
    if ("error" in m) return NextResponse.json({ error: m.error }, { status: m.status });
    const group = m.group;

    const body = await req.json().catch(() => null);
    const label = typeof body?.label === "string" ? body.label.trim().slice(0, 60) : "";
    const rawPlayers = Array.isArray(body?.players) ? body.players : [];

    const players: PokerPlayer[] = [];
    for (const p of rawPlayers) {
      const id = typeof p?.id === "string" ? p.id : "";
      const buyInCents = Math.round(Number(p?.buyInCents));
      const cashOutCents = Math.round(Number(p?.cashOutCents));
      if (!id || !Number.isFinite(buyInCents) || !Number.isFinite(cashOutCents)) {
        return NextResponse.json({ error: "Each player needs an id, buy-in and cash-out" }, { status: 400 });
      }
      if (buyInCents < 0 || cashOutCents < 0) {
        return NextResponse.json({ error: "Buy-in and cash-out cannot be negative" }, { status: 400 });
      }
      players.push({ id, buyInCents, cashOutCents });
    }

    if (players.length < 2) {
      return NextResponse.json({ error: "Need at least 2 players" }, { status: 400 });
    }
    const ids = players.map((p) => p.id);
    if (new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "A player is listed twice" }, { status: 400 });
    }

    // All players must be members of this group.
    const playersInGroup = await prisma.membership.count({
      where: { groupId: group.id, userId: { in: ids } },
    });
    if (playersInGroup !== ids.length) {
      return NextResponse.json({ error: "All players must be group members" }, { status: 400 });
    }

    const off = balanceCents(players);
    if (off !== 0) {
      return NextResponse.json(
        { error: "Chips don't balance: cash-outs must equal buy-ins", offByCents: off },
        { status: 400 }
      );
    }

    const settlements = computeSettlements(players);
    if (settlements.length === 0) {
      return NextResponse.json({ error: "Nobody won or lost — nothing to settle" }, { status: 400 });
    }

    // Recording the game counts as the creator's approval on each payment; a
    // payment resolves once the group quorum (approvalsNeeded) approves it.
    const groupMemberCount = await prisma.membership.count({ where: { groupId: group.id } });
    const needed = approvalsNeeded(groupMemberCount);
    const resolved = needed <= 1;
    const description = label ? `Poker · ${label}` : "Poker game";
    const now = new Date();
    const created = await prisma.$transaction(
      settlements.map((s) =>
        prisma.entry.create({
          data: {
            groupId: group.id,
            type: "BET",
            createdById: user.id,
            payerId: s.fromId,
            payeeId: s.toId,
            amountCents: s.amountCents,
            description,
            status: resolved ? "APPROVED" : "PENDING",
            resolvedAt: resolved ? now : null,
            approvals: { create: { userId: user.id } },
          },
        })
      )
    );

    return NextResponse.json({ created: created.length, needed, settlements });
  } catch (e) {
    console.error("POST /api/groups/[code]/poker failed:", e);
    return NextResponse.json({ error: "Server error resolving the poker game" }, { status: 500 });
  }
}
