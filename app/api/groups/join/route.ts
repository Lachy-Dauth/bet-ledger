import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/auth";

// Join a group by its 6-letter code (idempotent if already a member).
export async function POST(req: Request) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

  const group = await prisma.group.findUnique({ where: { code } });
  if (!group) return NextResponse.json({ error: "No group with that code" }, { status: 404 });

  await prisma.membership.upsert({
    where: { userId_groupId: { userId: user.id, groupId: group.id } },
    create: { userId: user.id, groupId: group.id },
    update: {},
  });

  return NextResponse.json({ group: { id: group.id, name: group.name, code: group.code } });
}
