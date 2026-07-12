# 🎲 Bet Ledger

A private, shareable ledger for friend groups to track **bets** and informal
**transfers** (e.g. splitting food). Anyone in a group can record an entry; it
counts immediately unless someone disputes it; two leaderboards keep score.

## Features

- **Name + PIN identity**, reused across groups and remembered on your device so
  you don't sign in again.
- **Create a group**, share it with a **6-letter code** or its URL; others join.
- **Bets** (head-to-head: winner vs loser, fixed amount). Entries are
  **approved by default** and count right away. Either player can **dispute**
  one, which stops it counting; the **group creator resolves** the dispute by
  **upholding** (it counts again) or **voiding** it (it never counts).
- **Transfers** (e.g. food) use the exact same flow.
- **Join by link**: opening a group's share URL adds you to it — logging in or
  signing up first if needed.
- **Two leaderboards**: **Bets only** and **Overall** (bets + transfers), summed
  from approved entries.
- **Poker resolver** *(experimental)*: enter each player's buy-in and final
  chips; once the chips balance, it computes the minimal set of loser→winner
  payments and posts them as bets (so they flow into the Bets board + PnL).

## Stack

- Next.js (App Router, TypeScript) — UI + API routes in one app.
- Prisma + SQLite for dev. To deploy, point `DATABASE_URL` at Postgres and set
  the datasource `provider = "postgresql"` in `prisma/schema.prisma`.
- PINs hashed with bcrypt; session token kept in `localStorage`.

## Run locally

```bash
npm install
npm run dev    # http://localhost:3000
```

`npm run dev` runs `prisma migrate deploy` first (via the `predev` hook), and
`npm start` does the same inside `scripts/start.mjs`, so the SQLite schema is
applied automatically before the server boots — no manual migrate step needed.

### Deploying to Railway (SQLite)

SQLite stores everything in a single file, so it must live on **durable
storage**. Railway's container filesystem is **ephemeral** — without a volume,
the DB is wiped on every redeploy/restart (this is why state didn't persist).

1. In the Railway service: **Settings → Volumes → add a volume** and mount it at
   any path, e.g. `/data`.
2. Deploy. That's it — `scripts/start.mjs` detects the volume via
   `RAILWAY_VOLUME_MOUNT_PATH` and stores the DB at `<mount>/prod.db`, then runs
   `prisma migrate deploy` against it on every boot.

To override the location explicitly, set a `DATABASE_URL` service variable, e.g.
`DATABASE_URL=file:/data/prod.db` (an **absolute** path on the volume — don't use
the default `file:./dev.db`, which sits on the ephemeral disk).

> The `prisma` CLI is a runtime dependency (not just dev) so `migrate deploy`
> works in production even if devDependencies are pruned.

For other hosts, point `DATABASE_URL` at a SQLite file on a mounted disk (or a
Postgres URL after switching the datasource provider).

## Smoke test

With the dev server running:

```bash
npm run smoke
```

This exercises sign-in → create group → join → bets/transfers (approved by
default) → dispute → creator uphold/void → poker, and checks both leaderboards.

## How it works

- `prisma/schema.prisma` — `User`, `Session`, `Group`, `Membership`, `Entry`.
  An `Entry` models both a bet and a transfer (`payer` owes `payee`).
- `app/api/*` — auth, group create/join/read, entry create, approve/dispute.
- `lib/ledger.ts` — leaderboard math (net per member from approved entries).
- `app/page.tsx` — sign-in + group list. `app/g/[code]/page.tsx` — the group.

## Notes

- Low-stakes security: a PIN protects an account on a new device; there's no
  email or password reset. Not for real-money handling.
