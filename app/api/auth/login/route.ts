import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";

// Log in to an existing account. Name is the unique login handle.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

    if (!name) return NextResponse.json({ error: "Enter your name" }, { status: 400 });
    if (!pin) return NextResponse.json({ error: "Enter your PIN" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { name } });
    if (!user) {
      return NextResponse.json({ error: "No account with that name — sign up instead" }, { status: 401 });
    }
    const ok = await bcrypt.compare(pin, user.pinHash);
    if (!ok) {
      return NextResponse.json({ error: "Incorrect PIN for that name" }, { status: 401 });
    }

    const token = await createSession(user.id);
    return NextResponse.json({ token, user: { id: user.id, name: user.name } });
  } catch (e) {
    console.error("POST /api/auth/login failed:", e);
    return NextResponse.json(
      { error: "Server error — the database may not be initialized" },
      { status: 500 }
    );
  }
}
