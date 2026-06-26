import { randomBytes } from "crypto";
import { prisma } from "./db";

export type AuthedUser = { id: string; name: string };

export function newToken(): string {
  return randomBytes(24).toString("hex");
}

/** Resolve a bearer token from a request to a user, or null. */
export async function getUser(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name };
}

/** Assert the user is a member of the group with the given code. */
export async function requireMembership(userId: string, code: string) {
  const group = await prisma.group.findUnique({ where: { code } });
  if (!group) return { error: "Group not found", status: 404 as const };
  const membership = await prisma.membership.findUnique({
    where: { userId_groupId: { userId, groupId: group.id } },
  });
  if (!membership) return { error: "Not a member of this group", status: 403 as const };
  return { group };
}
