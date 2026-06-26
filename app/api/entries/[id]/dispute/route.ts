import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";

// Only the payer (loser / ower) may dispute a pending entry.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const entry = await prisma.entry.findUnique({ where: { id } });
  if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  if (entry.payerId !== user.id) {
    return NextResponse.json({ error: "Only the payer can dispute this" }, { status: 403 });
  }
  if (entry.status !== "PENDING") {
    return NextResponse.json({ error: "Entry is not pending" }, { status: 409 });
  }

  await prisma.entry.update({
    where: { id },
    data: { status: "DISPUTED", resolvedAt: new Date() },
  });
  return NextResponse.json({ ok: true, status: "DISPUTED" });
}
