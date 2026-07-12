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

  console.log("Entries (approved by default)");
  const bet1 = await call(`/api/groups/${code}/entries`, {
    method: "POST",
    token: aTok,
    body: { type: "BET", payerId: aId, payeeId: bId, amountCents: 1000, description: "lost a wager" },
  });
  check("bet is approved on creation", bet1.data.status === "APPROVED");

  const bet2 = await call(`/api/groups/${code}/entries`, {
    method: "POST",
    token: aTok,
    body: { type: "BET", payerId: bId, payeeId: aId, amountCents: 500 },
  });
  check("bet for other is approved on creation", bet2.data.status === "APPROVED");

  const tr = await call(`/api/groups/${code}/entries`, {
    method: "POST",
    token: aTok,
    body: { type: "TRANSFER", payerId: bId, payeeId: aId, amountCents: 2000, description: "pizza" },
  });
  check("transfer is approved on creation", tr.data.status === "APPROVED");

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

  console.log("Dispute / resolve (group creator resolves)");
  const dan = "Dan_" + rnd();
  const d = await call("/api/auth/signup", { method: "POST", body: { name: dan, pin: "2222" } });
  const dTok = d.data.token, dId = d.data.user.id;
  // Alice creates the group, so Alice is the resolver. Bob & Dan join.
  const dg = (await call("/api/groups", { method: "POST", body: { name: "Trio" }, token: aTok })).data.group;
  await call("/api/groups/join", { method: "POST", body: { code: dg.code }, token: bTok });
  await call("/api/groups/join", { method: "POST", body: { code: dg.code }, token: dTok });

  // Bob loses $700 to Dan -> approved immediately and counts.
  const db = await call(`/api/groups/${dg.code}/entries`, {
    method: "POST", token: aTok,
    body: { type: "BET", payerId: bId, payeeId: dId, amountCents: 700 },
  });
  check("new entry counts right away", db.data.status === "APPROVED");

  // A non-party cannot dispute; the payer (Bob) can.
  const badDisp = await call(`/api/entries/${db.data.id}/dispute`, { method: "POST", token: aTok });
  check("non-party cannot dispute (403)", badDisp.status === 403);
  const disp = await call(`/api/entries/${db.data.id}/dispute`, { method: "POST", token: bTok });
  check("party can dispute", disp.status === 200 && disp.data.status === "DISPUTED");

  // Disputed entry drops off the board.
  const dv = await call(`/api/groups/${dg.code}`, { token: aTok });
  const dbets = Object.fromEntries(dv.data.boards.bets.map((r) => [r.name, r.netCents]));
  check("disputed entry not counted", (dbets[dan] ?? 0) === 0);

  // Only the group creator resolves; a party cannot.
  const badResolve = await call(`/api/entries/${db.data.id}/resolve`, {
    method: "POST", token: bTok, body: { outcome: "void" },
  });
  check("non-creator cannot resolve (403)", badResolve.status === 403);

  // Alice (creator) upholds it -> counts again.
  const upheld = await call(`/api/entries/${db.data.id}/resolve`, {
    method: "POST", token: aTok, body: { outcome: "uphold" },
  });
  check("creator upholds dispute", upheld.status === 200 && upheld.data.status === "APPROVED");
  const dv2 = await call(`/api/groups/${dg.code}`, { token: aTok });
  const dbets2 = Object.fromEntries(dv2.data.boards.bets.map((r) => [r.name, r.netCents]));
  check("upheld entry counts again", dbets2[dan] === 700);

  // Dispute again and void it -> never counts.
  await call(`/api/entries/${db.data.id}/dispute`, { method: "POST", token: bTok });
  const voided = await call(`/api/entries/${db.data.id}/resolve`, {
    method: "POST", token: aTok, body: { outcome: "void" },
  });
  check("creator voids dispute", voided.status === 200 && voided.data.status === "VOIDED");
  const dv3 = await call(`/api/groups/${dg.code}`, { token: aTok });
  const dbets3 = Object.fromEntries(dv3.data.boards.bets.map((r) => [r.name, r.netCents]));
  check("voided entry not counted", (dbets3[dan] ?? 0) === 0);

  console.log("My groups / stale session");
  const mine = await call("/api/groups", { token: aTok });
  check("lists my groups", mine.status === 200 && Array.isArray(mine.data.groups));
  check("my groups include the Trio group", mine.data.groups.some((g) => g.code === dg.code));
  const noTok = await call("/api/groups");
  check("listing groups needs auth (401)", noTok.status === 401);
  const staleTok = await call("/api/groups", { token: "deadbeef-not-a-real-token" });
  check("stale token rejected (401)", staleTok.status === 401);

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

  // Poker entries are approved by default, so the board reflects them right away.
  const pv = await call(`/api/groups/${pg.code}`, { token: aTok });
  const pbets = Object.fromEntries(pv.data.boards.bets.map((r) => [r.name, r.netCents]));
  check("poker board: Alice +1500", pbets[alice] === 1500);
  check("poker board: Bob -500", pbets[bob] === -500);
  check("poker board: Cara -1000", pbets[cara] === -1000);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
