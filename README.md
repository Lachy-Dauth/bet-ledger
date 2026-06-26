# 🎲 Bet Ledger

A private, shareable ledger for friend groups to track **bets** and informal
**transfers** (e.g. splitting food). Anyone in a group can record an entry; the
loser/ower approves or disputes it; two leaderboards keep score.

## Features

- **Name + PIN identity**, reused across groups and remembered on your device so
  you don't sign in again.
- **Create a group**, share it with a **6-letter code** or its URL; others join.
- **Bets** (head-to-head: winner vs loser, fixed amount). The **loser approves
  or disputes**. Recording a bet you lost auto-approves.
- **Transfers** (e.g. food) use the exact same approve/dispute flow.
- **Two leaderboards**: **Bets only** and **Overall** (bets + transfers), summed
  from approved entries.

## Stack

- Next.js (App Router, TypeScript) — UI + API routes in one app.
- Prisma + SQLite for dev. To deploy, point `DATABASE_URL` at Postgres and set
  the datasource `provider = "postgresql"` in `prisma/schema.prisma`.
- PINs hashed with bcrypt; session token kept in `localStorage`.

## Run locally

```bash
npm install
npx prisma migrate dev --name init   # creates prisma/dev.db
npm run dev                           # http://localhost:3000
```

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
