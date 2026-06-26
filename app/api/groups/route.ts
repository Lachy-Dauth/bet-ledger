import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { uniqueGroupCode } from "@/lib/code";

// List the groups the signed-in user actually belongs to (source of truth, so
// the client can drop stale/deleted groups it had cached).
export async function GET(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    include: { group: { select: { id: true, name: true, code: true } } },
    orderBy: { joinedAt: "desc" },
  });

  return NextResponse.json({ groups: memberships.map((m) => m.group) });
}

// Create a group; the creator is auto-added as a member.
export async function POST(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 60) {
    return NextResponse.json({ error: "Group name must be 1–60 characters" }, { status: 400 });
  }

  const code = await uniqueGroupCode();
  const group = await prisma.group.create({
    data: {
      name,
      code,
      createdById: user.id,
      memberships: { create: { userId: user.id } },
    },
  });

  return NextResponse.json({ group: { id: group.id, name: group.name, code: group.code } });
}
