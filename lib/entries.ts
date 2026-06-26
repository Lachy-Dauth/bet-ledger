import { prisma } from "./db";
import { approvalsNeeded } from "./ledger";

/**
 * Record `userId`'s approval of an entry (idempotent) and flip it to APPROVED
 * once enough distinct members have approved — the quorum from approvalsNeeded.
 * Returns the running count and the threshold. The status update is conditional
 * on the entry still being PENDING, so a dispute can't be overridden.
 */
export async function approveEntry(entryId: string, userId: string, groupId: string) {
  await prisma.approval.upsert({
    where: { entryId_userId: { entryId, userId } },
    create: { entryId, userId },
    update: {},
  });

  const [approvalCount, memberCount] = await Promise.all([
    prisma.approval.count({ where: { entryId } }),
    prisma.membership.count({ where: { groupId } }),
  ]);
  const needed = approvalsNeeded(memberCount);

  let resolved = false;
  if (approvalCount >= needed) {
    const res = await prisma.entry.updateMany({
      where: { id: entryId, status: "PENDING" },
      data: { status: "APPROVED", resolvedAt: new Date() },
    });
    resolved = res.count > 0;
  }
  return { approvalCount, needed, resolved };
}
