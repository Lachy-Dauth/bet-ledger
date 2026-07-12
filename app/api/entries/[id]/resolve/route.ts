import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";

// The group creator resolves a disputed entry: "uphold" puts it back to
// APPROVED (it counts again), "void" sets it to VOIDED (it never counts).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { id } = await params;
    const entry = await prisma.entry.findUnique({
      where: { id },
      include: { group: { select: { createdById: true } } },
    });
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    if (entry.group.createdById !== user.id) {
      return NextResponse.json({ error: "Only the group creator can resolve disputes" }, { status: 403 });
    }
    if (entry.status !== "DISPUTED") {
      return NextResponse.json({ error: "Entry is not disputed" }, { status: 409 });
    }

    const body = await req.json().catch(() => null);
    const outcome = body?.outcome === "void" ? "void" : body?.outcome === "uphold" ? "uphold" : null;
    if (!outcome) {
      return NextResponse.json({ error: "outcome must be 'uphold' or 'void'" }, { status: 400 });
    }

    const status = outcome === "uphold" ? "APPROVED" : "VOIDED";
    await prisma.entry.update({
      where: { id },
      data: { status, resolvedAt: new Date() },
    });
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    console.error("POST /api/entries/[id]/resolve failed:", e);
    return NextResponse.json({ error: "Server error resolving entry" }, { status: 500 });
  }
}
