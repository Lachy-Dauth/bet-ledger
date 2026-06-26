# 🎲 Bet Ledger

A private, shareable ledger for friend groups to track **bets** and informal
**transfers** (e.g. splitting food). Anyone in a group can record an entry; it
resolves once a quorum of members approve it; two leaderboards keep score.

## Features

- **Name + PIN identity**, reused across groups and remembered on your device so
  you don't sign in again.
- **Create a group**, share it with a **6-letter code** or its URL; others join.
- **Bets** (head-to-head: winner vs loser, fixed amount). An entry **resolves
  once a quorum of members approve** it — the lower of 2 and half the players
  (so a 2-person group needs 1 approval, any larger group needs 2). Recording an
  entry counts as your approval; the payer can still **dispute** it.
- **Transfers** (e.g. food) use the exact same approval flow.
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

`npm run dev` and `npm start` run `prisma migrate deploy` first (via the
`predev` / `prestart` hooks), so the SQLite schema is created/applied
automatically before the server boots — no manual migrate step needed.

### Deploying

Point `DATABASE_URL` at your persistent database (a SQLite file on a mounted
volume, or a Postgres URL). `npm start` applies migrations on boot. If your
platform prunes devDependencies in production, run `npx prisma migrate deploy`
in your release/start command instead (the `prisma` CLI must be available).

## Smoke test

With the dev server running:

```bash
npm run smoke
```

This exercises sign-in → create group → join → bet (auto-approve) → bet
(approve) → transfer, and checks both leaderboards.

## How it works

- `prisma/schema.prisma` — `User`, `Session`, `Group`, `Membership`, `Entry`.
  An `Entry` models both a bet and a transfer (`payer` owes `payee`).
- `app/api/*` — auth, group create/join/read, entry create, approve/dispute.
- `lib/ledger.ts` — leaderboard math (net per member from approved entries).
- `app/page.tsx` — sign-in + group list. `app/g/[code]/page.tsx` — the group.

## Notes

- Low-stakes security: a PIN protects an account on a new device; there's no
  email or password reset. Not for real-money handling.
