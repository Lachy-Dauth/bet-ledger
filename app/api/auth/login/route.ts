import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { newToken } from "@/lib/auth";

// Login or register in one step: a new name creates an account; an existing
// name verifies the PIN. Name is the unique login handle.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

  if (name.length < 1 || name.length > 40) {
    return NextResponse.json({ error: "Name must be 1–40 characters" }, { status: 400 });
  }
  if (!/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be 4–8 digits" }, { status: 400 });
  }

  let user = await prisma.user.findUnique({ where: { name } });
  if (user) {
    const ok = await bcrypt.compare(pin, user.pinHash);
    if (!ok) {
      return NextResponse.json({ error: "Incorrect PIN for that name" }, { status: 401 });
    }
  } else {
    const pinHash = await bcrypt.hash(pin, 10);
    user = await prisma.user.create({ data: { name, pinHash } });
  }

  const token = newToken();
  await prisma.session.create({ data: { token, userId: user.id } });

  return NextResponse.json({ token, user: { id: user.id, name: user.name } });
}
