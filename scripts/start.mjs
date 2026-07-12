// Production start: ensure the SQLite database lives on durable storage, apply
// migrations, then launch Next.
//
// Railway (and similar) give the app an EPHEMERAL filesystem — anything written
// under the app directory (like the default ./prisma/dev.db) is wiped on every
// redeploy/restart, which is why state didn't persist. When a Railway Volume is
// attached, its mount path is exposed as RAILWAY_VOLUME_MOUNT_PATH; we put the
// SQLite file there so it survives. Set DATABASE_URL yourself to override.
import { spawnSync } from "node:child_process";
import path from "node:path";

if (!process.env.DATABASE_URL && process.env.RAILWAY_VOLUME_MOUNT_PATH) {
  process.env.DATABASE_URL = `file:${process.env.RAILWAY_VOLUME_MOUNT_PATH}/prod.db`;
}

const bin = (name) => path.join(process.cwd(), "node_modules", ".bin", name);
const run = (cmd, args) => spawnSync(cmd, args, { stdio: "inherit", env: process.env });

console.log(`[start] DATABASE_URL=${process.env.DATABASE_URL ?? "(loaded from .env)"}`);

const migrate = run(bin("prisma"), ["migrate", "deploy"]);
if (migrate.status !== 0) {
  console.error("[start] migrations failed");
  process.exit(migrate.status ?? 1);
}

const next = run(bin("next"), ["start"]);
process.exit(next.status ?? 0);
