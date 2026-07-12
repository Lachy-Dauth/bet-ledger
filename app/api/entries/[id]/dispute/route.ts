import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";

// Either party (payer or payee) can dispute an approved entry. It stops counting
// until the group creator resolves it.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { id } = await params;
    const entry = await prisma.entry.findUnique({ where: { id } });
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    if (entry.payerId !== user.id && entry.payeeId !== user.id) {
      return NextResponse.json({ error: "Only the people involved can dispute this" }, { status: 403 });
    }
    if (entry.status !== "APPROVED") {
      return NextResponse.json({ error: "Only an approved entry can be disputed" }, { status: 409 });
    }

    await prisma.entry.update({
      where: { id },
      data: { status: "DISPUTED", resolvedAt: null },
    });
    return NextResponse.json({ ok: true, status: "DISPUTED" });
  } catch (e) {
    console.error("POST /api/entries/[id]/dispute failed:", e);
    return NextResponse.json({ error: "Server error disputing entry" }, { status: 500 });
  }
}
