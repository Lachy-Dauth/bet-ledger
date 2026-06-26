import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser, requireMembership } from "@/lib/auth";
import { computeBoard, type EntryDTO, type Member } from "@/lib/ledger";

type EntryWithUsers = {
  id: string;
  type: string;
  status: string;
  amountCents: number;
  description: string;
  createdAt: Date;
  resolvedAt: Date | null;
  createdBy: { id: string; name: string };
  payer: { id: string; name: string };
  payee: { id: string; name: string };
};

function toDTO(e: EntryWithUsers): EntryDTO {
  return {
    id: e.id,
    type: e.type as EntryDTO["type"],
    status: e.status as EntryDTO["status"],
    amountCents: e.amountCents,
    description: e.description,
    createdAt: e.createdAt.toISOString(),
    resolvedAt: e.resolvedAt ? e.resolvedAt.toISOString() : null,
    createdBy: e.createdBy,
    payer: e.payer,
    payee: e.payee,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { code } = await params;
  const m = await requireMembership(user.id, code.toUpperCase());
  if ("error" in m) return NextResponse.json({ error: m.error }, { status: m.status });
  const group = m.group;

  const memberships = await prisma.membership.findMany({
    where: { groupId: group.id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const members: Member[] = memberships.map((mm) => mm.user);

  const rawEntries = await prisma.entry.findMany({
    where: { groupId: group.id },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
      payer: { select: { id: true, name: true } },
      payee: { select: { id: true, name: true } },
    },
  });
  const entries = rawEntries.map(toDTO);

  return NextResponse.json({
    group: { id: group.id, name: group.name, code: group.code },
    members,
    entries,
    boards: {
      bets: computeBoard(members, entries, true),
      overall: computeBoard(members, entries, false),
    },
  });
}
