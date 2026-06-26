import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser, requireMembership } from "@/lib/auth";

// Record a bet or transfer. payer = loser/ower, payee = winner/owed.
// If the creator is the payer (admitting it), it auto-approves; otherwise the
// payer must approve or dispute it.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { code } = await params;
  const m = await requireMembership(user.id, code.toUpperCase());
  if ("error" in m) return NextResponse.json({ error: m.error }, { status: m.status });
  const group = m.group;

  const body = await req.json().catch(() => null);
  const type = body?.type === "TRANSFER" ? "TRANSFER" : body?.type === "BET" ? "BET" : null;
  const payerId = typeof body?.payerId === "string" ? body.payerId : "";
  const payeeId = typeof body?.payeeId === "string" ? body.payeeId : "";
  const amountCents = Number.isFinite(body?.amountCents) ? Math.round(body.amountCents) : NaN;
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 200) : "";

  if (!type) return NextResponse.json({ error: "type must be BET or TRANSFER" }, { status: 400 });
  if (!payerId || !payeeId) return NextResponse.json({ error: "payer and payee required" }, { status: 400 });
  if (payerId === payeeId) return NextResponse.json({ error: "payer and payee must differ" }, { status: 400 });
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }

  // Both parties must be members of this group.
  const memberCount = await prisma.membership.count({
    where: { groupId: group.id, userId: { in: [payerId, payeeId] } },
  });
  if (memberCount !== 2) {
    return NextResponse.json({ error: "payer and payee must both be group members" }, { status: 400 });
  }

  const autoApprove = user.id === payerId;
  const entry = await prisma.entry.create({
    data: {
      groupId: group.id,
      type,
      createdById: user.id,
      payerId,
      payeeId,
      amountCents,
      description,
      status: autoApprove ? "APPROVED" : "PENDING",
      resolvedAt: autoApprove ? new Date() : null,
    },
  });

  return NextResponse.json({ id: entry.id, status: entry.status });
}
