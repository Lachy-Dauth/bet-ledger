import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";

// Create a new account. Name is the unique login handle.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

    if (name.length < 1 || name.length > 40) {
      return NextResponse.json({ error: "Name must be 1–40 characters" }, { status: 400 });
    }
    if (!/^\d{4,8}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be 4–8 digits" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json({ error: "That name is taken — log in instead" }, { status: 409 });
    }

    const pinHash = await bcrypt.hash(pin, 10);
    const user = await prisma.user.create({ data: { name, pinHash } });

    const token = await createSession(user.id);
    return NextResponse.json({ token, user: { id: user.id, name: user.name } });
  } catch (e) {
    console.error("POST /api/auth/signup failed:", e);
    return NextResponse.json(
      { error: "Server error — the database may not be initialized" },
      { status: 500 }
    );
  }
}
