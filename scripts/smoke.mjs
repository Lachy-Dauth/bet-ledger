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

  console.log("Entries");
  // Alice records a bet she lost to Bob -> auto-approved.
  const bet1 = await call(`/api/groups/${code}/entries`, {
    method: "POST",
    token: aTok,
    body: { type: "BET", payerId: aId, payeeId: bId, amountCents: 1000, description: "lost a wager" },
  });
  check("self-payer bet auto-approves", bet1.data.status === "APPROVED");

  // Alice records a bet Bob lost -> pending, needs Bob.
  const bet2 = await call(`/api/groups/${code}/entries`, {
    method: "POST",
    token: aTok,
    body: { type: "BET", payerId: bId, payeeId: aId, amountCents: 500 },
  });
  check("bet for other is pending", bet2.data.status === "PENDING");

  // Alice can't approve Bob's pending bet.
  const wrongApprove = await call(`/api/entries/${bet2.data.id}/approve`, { method: "POST", token: aTok });
  check("non-payer cannot approve", wrongApprove.status === 403);

  const approve = await call(`/api/entries/${bet2.data.id}/approve`, { method: "POST", token: bTok });
  check("payer approves", approve.status === 200);

  // A transfer: Bob owes Alice for food, Alice records it -> pending for Bob.
  const tr = await call(`/api/groups/${code}/entries`, {
    method: "POST",
    token: aTok,
    body: { type: "TRANSFER", payerId: bId, payeeId: aId, amountCents: 2000, description: "pizza" },
  });
  await call(`/api/entries/${tr.data.id}/approve`, { method: "POST", token: bTok });

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

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
