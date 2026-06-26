// End-to-end smoke test against a running dev server.
// Usage: npm run dev (in one shell), then: npm run smoke
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}`);
  }
}

async function call(path, { token, method = "GET", body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function rnd() {
  return Math.random().toString(36).slice(2, 8);
}

async function main() {
  const alice = "Alice_" + rnd();
  const bob = "Bob_" + rnd();

  console.log("Auth");
  const a = await call("/api/auth/signup", { method: "POST", body: { name: alice, pin: "1234" } });
  check("Alice signs up", a.status === 200 && a.data.token);
  const b = await call("/api/auth/signup", { method: "POST", body: { name: bob, pin: "9999" } });
  check("Bob signs up", b.status === 200 && b.data.token);
  const dup = await call("/api/auth/signup", { method: "POST", body: { name: alice, pin: "1234" } });
  check("duplicate signup rejected (409)", dup.status === 409);
  const unknown = await call("/api/auth/login", { method: "POST", body: { name: "Ghost_" + rnd(), pin: "1234" } });
  check("login unknown name rejected (401)", unknown.status === 401);
  const badPin = await call("/api/auth/login", { method: "POST", body: { name: alice, pin: "0000" } });
  check("login wrong PIN rejected (401)", badPin.status === 401);
  const relogin = await call("/api/auth/login", { method: "POST", body: { name: alice, pin: "1234" } });
  check("login correct PIN works", relogin.status === 200 && relogin.data.token);

  const aTok = a.data.token;
  const bTok = b.data.token;
  const aId = a.data.user.id;
  const bId = b.data.user.id;

  console.log("Group");
  const g = await call("/api/groups", { method: "POST", body: { name: "Test Group" }, token: aTok });
  check("Alice creates group", g.status === 200 && /^[A-Z]{6}$/.test(g.data.group.code));
  const code = g.data.group.code;

  const join = await call("/api/groups/join", { method: "POST", body: { code }, token: bTok });
  check("Bob joins by code", join.status === 200);

  const noMember = await call(`/api/groups/${code}`, { token: undefined });
  check("unauth read rejected", noMember.status === 401);

  console.log("Entries (2-person group: quorum = 1, resolves on creation)");
  // In a 2-person group the quorum is a single approval, so creating an entry
  // (which counts as the creator's approval) resolves it immediately.
  const bet1 = await call(`/api/groups/${code}/entries`, {
    method: "POST",
    token: aTok,
    body: { type: "BET", payerId: aId, payeeId: bId, amountCents: 1000, description: "lost a wager" },
  });
  check("own-loss bet resolves on creation", bet1.data.status === "APPROVED");

  const bet2 = await call(`/api/groups/${code}/entries`, {
    method: "POST",
    token: aTok,
    body: { type: "BET", payerId: bId, payeeId: aId, amountCents: 500 },
  });
  check("bet for other resolves on creation (quorum 1)", bet2.data.status === "APPROVED");

  const tr = await call(`/api/groups/${code}/entries`, {
    method: "POST",
    token: aTok,
    body: { type: "TRANSFER", payerId: bId, payeeId: aId, amountCents: 2000, description: "pizza" },
  });
  check("transfer resolves on creation (quorum 1)", tr.data.status === "APPROVED");

  console.log("Leaderboards");
  const view = await call(`/api/groups/${code}`, { token: aTok });
  const bets = Object.fromEntries(view.data.boards.bets.map((r) => [r.name, r.netCents]));
  const overall = Object.fromEntries(view.data.boards.overall.map((r) => [r.name, r.netCents]));
  // Bets only: Alice -1000 +500 = -500 ; Bob +500.
  check("bets board: Alice -500", bets[alice] === -500);
  check("bets board: Bob +500", bets[bob] === 500);
  // Overall adds the 2000 transfer (Bob -> Alice): Alice -500 +2000 = 1500 ; Bob -1500.
  check("overall board: Alice +1500", overall[alice] === 1500);
  check("overall board: Bob -1500", overall[bob] === -1500);

  console.log("Quorum (3-person group: quorum = 2)");
  const dan = "Dan_" + rnd();
  const d = await call("/api/auth/signup", { method: "POST", body: { name: dan, pin: "2222" } });
  const dTok = d.data.token;
  const qg = (await call("/api/groups", { method: "POST", body: { name: "Trio" }, token: aTok })).data.group;
  await call("/api/groups/join", { method: "POST", body: { code: qg.code }, token: bTok });
  // Cara joins below via her own token; create her first.
  const caraQ = "CaraQ_" + rnd();
  const cq = await call("/api/auth/signup", { method: "POST", body: { name: caraQ, pin: "3333" } });
  const cqTok = cq.data.token, cqId = cq.data.user.id;
  await call("/api/groups/join", { method: "POST", body: { code: qg.code }, token: cqTok });
  const view2 = await call(`/api/groups/${qg.code}`, { token: aTok });
  check("approvalsNeeded is 2 for 3 members", view2.data.approvalsNeeded === 2);

  // Alice records a bet Bob loses -> creator's vote = 1/2 -> PENDING.
  const qb = await call(`/api/groups/${qg.code}/entries`, {
    method: "POST", token: aTok,
    body: { type: "BET", payerId: bId, payeeId: aId, amountCents: 700 },
  });
  check("bet pending at 1/2 in trio", qb.data.status === "PENDING");

  // A non-member cannot approve.
  const outsider = await call(`/api/entries/${qb.data.id}/approve`, { method: "POST", token: dTok });
  check("non-member cannot approve (403)", outsider.status === 403);

  // Cara (not a party) approving reaches the quorum -> APPROVED.
  const q2 = await call(`/api/entries/${qb.data.id}/approve`, { method: "POST", token: cqTok });
  check("second member approval resolves it", q2.status === 200 && q2.data.status === "APPROVED");

  // Dispute path: Alice records a bet Cara loses; Cara (payer) disputes it.
  const qd = await call(`/api/groups/${qg.code}/entries`, {
    method: "POST", token: aTok,
    body: { type: "BET", payerId: cqId, payeeId: aId, amountCents: 400 },
  });
  const disp = await call(`/api/entries/${qd.data.id}/dispute`, { method: "POST", token: cqTok });
  check("payer can dispute", disp.status === 200);
  const view3 = await call(`/api/groups/${qg.code}`, { token: aTok });
  const disputed = view3.data.entries.find((e) => e.id === qd.data.id);
  check("disputed entry not counted on board", disputed.status === "DISPUTED");

  console.log("Poker");
  // Fresh group with a third player so the settlement spans multiple payments.
  const cara = "Cara_" + rnd();
  const c = await call("/api/auth/signup", { method: "POST", body: { name: cara, pin: "5555" } });
  const cTok = c.data.token, cId = c.data.user.id;
  const pg = (await call("/api/groups", { method: "POST", body: { name: "Poker Night" }, token: aTok })).data.group;
  await call("/api/groups/join", { method: "POST", body: { code: pg.code }, token: bTok });
  await call("/api/groups/join", { method: "POST", body: { code: pg.code }, token: cTok });

  // Unbalanced table is rejected.
  const bad = await call(`/api/groups/${pg.code}/poker`, {
    method: "POST", token: aTok,
    body: { players: [
      { id: aId, buyInCents: 1000, cashOutCents: 1000 },
      { id: bId, buyInCents: 1000, cashOutCents: 2000 },
    ] },
  });
  check("unbalanced poker rejected (400)", bad.status === 400 && bad.data.offByCents === 1000);

  // Balanced: Alice +1500, Bob -500, Cara -1000  (Alice recorded it).
  const game = await call(`/api/groups/${pg.code}/poker`, {
    method: "POST", token: aTok,
    body: { label: "Friday", players: [
      { id: aId, buyInCents: 2000, cashOutCents: 3500 },
      { id: bId, buyInCents: 2000, cashOutCents: 1500 },
      { id: cId, buyInCents: 2000, cashOutCents: 1000 },
    ] },
  });
  check("poker resolves into payments", game.status === 200 && game.data.created >= 1);
  // Total owed to Alice across settlements should be 1500.
  const toAlice = game.data.settlements.filter((s) => s.toId === aId).reduce((n, s) => n + s.amountCents, 0);
  check("settlements credit Alice +1500", toAlice === 1500);

  const pv = await call(`/api/groups/${pg.code}`, { token: aTok });
  const pbets = Object.fromEntries(pv.data.boards.bets.map((r) => [r.name, r.netCents]));
  // Bob & Cara are payers (not the creator) so their entries are PENDING -> not yet counted.
  // Approve them to confirm the board lands on the expected nets.
  for (const e of pv.data.entries.filter((e) => e.status === "PENDING")) {
    const tok = e.payer.id === bId ? bTok : cTok;
    await call(`/api/entries/${e.id}/approve`, { method: "POST", token: tok });
  }
  const pv2 = await call(`/api/groups/${pg.code}`, { token: aTok });
  const pbets2 = Object.fromEntries(pv2.data.boards.bets.map((r) => [r.name, r.netCents]));
  check("poker pending before approval", (pbets[cara] ?? 0) === 0);
  check("poker board: Alice +1500", pbets2[alice] === 1500);
  check("poker board: Bob -500", pbets2[bob] === -500);
  check("poker board: Cara -1000", pbets2[cara] === -1000);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
