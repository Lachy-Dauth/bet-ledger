import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { approveEntry } from "@/lib/entries";

// Any group member can approve. The entry resolves to APPROVED once the group
// quorum (approvalsNeeded) of distinct members have approved.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { id } = await params;
    const entry = await prisma.entry.findUnique({ where: { id } });
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    const membership = await prisma.membership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId: entry.groupId } },
    });
    if (!membership) {
      return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
    }
    if (entry.status !== "PENDING") {
      return NextResponse.json({ error: "Entry is not pending" }, { status: 409 });
    }

    const { approvalCount, needed, resolved } = await approveEntry(id, user.id, entry.groupId);
    return NextResponse.json({
      ok: true,
      status: resolved ? "APPROVED" : "PENDING",
      approvalCount,
      needed,
    });
  } catch (e) {
    console.error("POST /api/entries/[id]/approve failed:", e);
    return NextResponse.json({ error: "Server error approving entry" }, { status: 500 });
  }
}
