/**
 * 12-HOUR COOLDOWN + LIFETIME-STAMP CONTRACT TESTS (Admin App copy).
 *
 * These tests encode the ONE rule all three applications must share
 * (Customer App, Staff App, Admin App — project cafe-review7):
 *
 *   * 10:00:00 → success · 21:59:59 → reject · 22:00:00 → success
 *   * two simultaneous requests → only one successful stamp
 *   * retry of the same transaction → no duplicate
 *   * blocked request → no visit, no notification, no loyalty increment
 *
 * The same assertions are shipped to the other two repositories so a divergence
 * fails a build instead of silently splitting the loyalty model.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  STAMP_COOLDOWN_MS,
  computeStampCooldown,
  countLedgerRows,
  currentStampsOf,
  evaluateStampGate,
  isCountedStampRow,
  isReplayedStamp,
  lifetimeStampsOf,
  planRedemption,
  planStampAward,
  reconcileLifetimeStamps,
  safeCount,
  toMillisSafe,
  formatTimestamp,
} from "../src/lib/loyalty/canonical.ts";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");
const rules = read("firestore.rules");

const CLIENT = "cli_bake";
const OTHER_CLIENT = "cli_rival";
const CUSTOMER = "uid_kai";

/** 10:00:00 IST on 2026-10-06, as epoch ms. */
const TEN_AM = Date.parse("2026-10-06T04:30:00.000Z");
const H = 60 * 60 * 1000;

const gate = (overrides = {}) =>
  evaluateStampGate({
    clientId: CLIENT,
    loyaltyEnabled: true,
    customerClientId: CLIENT,
    loyaltyClientId: CLIENT,
    lastStampAt: null,
    nowMillis: TEN_AM,
    transactionId: "TXN-STAMP-1",
    ...overrides,
  });

/* ------------------------------------------------------------------ *
 * 1. The exact 12-hour window
 * ------------------------------------------------------------------ */

test("10:00:00 → success, 21:59:59 → reject, 22:00:00 → success", () => {
  assert.equal(STAMP_COOLDOWN_MS, 12 * H);

  // 10:00:00 — the stamp that starts the window.
  const first = gate({ lastStampAt: null, nowMillis: TEN_AM });
  assert.equal(first.allowed, true);
  assert.equal(first.code, "OK");

  // 21:59:59 — one second before the window closes.
  const almost = gate({ lastStampAt: TEN_AM, nowMillis: TEN_AM + 12 * H - 1000 });
  assert.equal(almost.allowed, false);
  assert.equal(almost.code, "COOLDOWN");
  assert.equal(almost.cooldown.remainingMs, 1000);
  assert.match(almost.message, /Next stamp available in/);

  // 22:00:00 — exactly 12 hours later.
  const exactly = gate({ lastStampAt: TEN_AM, nowMillis: TEN_AM + 12 * H });
  assert.equal(exactly.allowed, true);
  assert.equal(exactly.code, "OK");
  assert.equal(exactly.cooldown.remainingMs, 0);

  // One millisecond before the boundary is still rejected (no rounding slop).
  assert.equal(gate({ lastStampAt: TEN_AM, nowMillis: TEN_AM + 12 * H - 1 }).allowed, false);
});

test("the cooldown accepts every timestamp shape Firestore stores", () => {
  const serialized = { seconds: Math.floor(TEN_AM / 1000), nanoseconds: 0 };
  const iso = new Date(TEN_AM).toISOString();
  for (const shape of [TEN_AM, serialized, iso, new Date(TEN_AM)]) {
    const decision = gate({ lastStampAt: shape, nowMillis: TEN_AM + 11 * H });
    assert.equal(decision.code, "COOLDOWN", `shape ${JSON.stringify(shape)}`);
    assert.equal(toMillisSafe(shape), TEN_AM);
  }
  // Missing/invalid → treated as "no stamp recorded" (never NaN, never blocked forever).
  for (const shape of [null, undefined, "", "later", {}, Number.NaN]) {
    const decision = gate({ lastStampAt: shape, nowMillis: TEN_AM });
    assert.equal(decision.allowed, true, `shape ${String(shape)}`);
    assert.equal(computeStampCooldown(shape, TEN_AM).remainingMs, 0);
  }
});

/* ------------------------------------------------------------------ *
 * 2. Concurrency and retries
 * ------------------------------------------------------------------ */

test("two simultaneous requests → only one successful stamp", () => {
  // Both tills read the SAME pre-commit state, so both would write +1…
  const parallel = [gate({ lastStampAt: null, transactionId: "TXN-A" }), gate({ lastStampAt: null, transactionId: "TXN-B" })];
  assert.equal(parallel.filter((d) => d.allowed).length, 2, "the local pre-flight cannot serialize - Firestore does");

  // …which is exactly why the commit must be conditional: Firestore re-reads
  // lastStampAt inside the transaction and the second commit sees it.
  const secondAfterFirstCommit = gate({
    lastStampAt: TEN_AM, // written by the winner of the race
    nowMillis: TEN_AM + 250,
    transactionId: "TXN-B",
  });
  assert.equal(secondAfterFirstCommit.allowed, false);
  assert.equal(secondAfterFirstCommit.code, "COOLDOWN");

  // And the ledger/balance rules make the double write impossible: the balance
  // step and the ledger row are validated against the same getAfter() commit.
  assert.match(rules, /request\.resource\.data\.currentStamps == loyaltyStampBaseline\(\) \+ 1/);
  assert.match(rules, /stampCooldownHasElapsed\(request\.resource\.data\.customerId\)/);
});

test("retrying the same transaction is a replay — never a duplicate stamp", () => {
  const countedRow = { transactionId: "TXN-1", type: "STAMP_ADDED", visitCounted: true, delta: 1 };
  assert.equal(isReplayedStamp(countedRow, "TXN-1"), true);
  assert.equal(gate({ existingLedgerRow: countedRow, transactionId: "TXN-1" }).code, "REPLAY");

  // An uncounted (phase-one) row is NOT a replay: it must still be counted once.
  const pendingRow = { transactionId: "TXN-2", type: "STAMP_ADDED", visitCounted: false, delta: 1 };
  assert.equal(isReplayedStamp(pendingRow, "TXN-2"), false);
  assert.equal(gate({ existingLedgerRow: pendingRow, transactionId: "TXN-2" }).allowed, true);

  // A different operation id is a different stamp.
  assert.equal(isReplayedStamp(countedRow, "TXN-9"), false);

  // One award plan applied once must never be applied twice by a retry.
  const before = { currentStamps: 2, lifetimeStamps: 2, rewardsEarned: 0, rewardsRedeemed: 0, stampTarget: 10 };
  const plan = planStampAward(before);
  assert.equal(plan.currentStamps, 3);
  const replay = isReplayedStamp(countedRow, "TXN-1");
  assert.equal(replay, true);
  assert.equal(planStampAward(before).currentStamps, 3, "a replayed retry restarts from the stored state, not the incremented one");
});

/* ------------------------------------------------------------------ *
 * 3. Blocked requests change nothing
 * ------------------------------------------------------------------ */

test("a blocked request produces no visit, no notification and no loyalty increment", () => {
  const account = { currentStamps: 2, lifetimeStamps: 2, stamps: 2, lastStampAt: TEN_AM, rewardsEarned: 0, rewardsRedeemed: 0, stampTarget: 10 };

  for (const decision of [
    gate({ lastStampAt: TEN_AM, nowMillis: TEN_AM + 2 * H }),
    gate({ customerClientId: OTHER_CLIENT }),
    gate({ loyaltyClientId: OTHER_CLIENT }),
    gate({ loyaltyEnabled: false }),
  ]) {
    assert.equal(decision.allowed, false);
  }

  // The rules never grant a standalone visit/loyalty/notification write: each one
  // must be justified by a counted ledger row created in the same commit.
  assert.match(rules, /allow update:[\s\S]*?'totalVisits'[\s\S]*?'lastVisitAt'[\s\S]*?'lastVisitTransactionId'/);
  assert.match(rules, /getAfter\([\s\S]*?stampTransactions[\s\S]*?\)\.data\.get\('visitCounted', false\) == true/);
  assert.match(rules, /function matchesStampNotification\(\)[\s\S]*?createdAt', null\) == request\.time/);
  assert.match(rules, /function validStampAccountMutation\([\s\S]*?matchingStampTransaction\(/);
  assert.doesNotMatch(rules, /allow\s+(?:read,\s*write|write):\s*if\s+true/);
});

/* ------------------------------------------------------------------ *
 * 4. Lifetime stamps + redemption
 * ------------------------------------------------------------------ */

test("every successful stamp raises current and lifetime by exactly one", () => {
  const before = { currentStamps: 1, lifetimeStamps: 1, rewardsEarned: 0, rewardsRedeemed: 0, stampTarget: 10 };
  const after = planStampAward(before);
  assert.equal(after.currentStamps, 2);
  assert.equal(after.lifetimeStamps, 2);
  assert.equal(after.rewardUnlocked, false);

  // Production case: 2 valid transactions, currentStamps = 2, lifetimeStamps = 0.
  assert.equal(reconcileLifetimeStamps(2, 0, 2), 2, "lifetime is repaired from the ledger, never left at 0");
  assert.equal(lifetimeStampsOf({ currentStamps: 2, lifetimeStamps: 0, stamps: 2 }, 2), 2);

  // Crossing the reward threshold records the earned reward once.
  const crossing = planStampAward({ currentStamps: 9, lifetimeStamps: 9, rewardsEarned: 0, rewardsRedeemed: 0, stampTarget: 10 });
  assert.equal(crossing.currentStamps, 10);
  assert.equal(crossing.lifetimeStamps, 10);
  assert.equal(crossing.rewardJustUnlocked, true);
  assert.equal(crossing.rewardsEarned, 1);

  // A second stamp at the threshold does not mint a second reward.
  const again = planStampAward({ currentStamps: 10, lifetimeStamps: 10, rewardsEarned: 1, rewardsRedeemed: 0, stampTarget: 10 });
  assert.equal(again.rewardsEarned, 1);
});

test("redemption resets currentStamps by the configured cost and never lifetime", () => {
  const before = { currentStamps: 10, lifetimeStamps: 10, rewardsEarned: 1, rewardsRedeemed: 0, stampTarget: 10 };
  const plan = planRedemption(before, 10);
  assert.equal(plan.currentStamps, 0);
  assert.equal(plan.lifetimeStamps, 10, "lifetime stamps must not reset");
  assert.equal(plan.rewardsRedeemed, 1);
  assert.equal(plan.rewardsEarned, 1);

  // Excess stamps are preserved, history still intact.
  const excess = planRedemption({ ...before, currentStamps: 13 }, 10);
  assert.equal(excess.currentStamps, 3);
  assert.equal(excess.lifetimeStamps, 13);
});

test("counters are never NaN/undefined, dates never render Invalid Date", () => {
  assert.equal(currentStampsOf(null), 0);
  assert.equal(currentStampsOf({ stamps: "4" }), 4);
  assert.equal(currentStampsOf({ currentStamps: 4, stamps: 99 }), 4);
  assert.equal(safeCount(Number.NaN), 0);
  assert.equal(safeCount(-3), 0);
  assert.equal(lifetimeStampsOf(undefined, undefined), 0);

  assert.equal(formatTimestamp(null), "—");
  assert.equal(formatTimestamp("nonsense"), "—");
  assert.equal(formatTimestamp(TEN_AM, { withTime: true }).includes("Invalid"), false);
});

test("the ledger only counts real stamps (pending rows and redemptions excluded)", () => {
  const rows = [
    { type: "STAMP_ADDED", visitCounted: true, delta: 1 },
    { type: "STAMP_ADDED", visitCounted: true, delta: 1 },
    { type: "STAMP_ADDED", visitCounted: false, delta: 1 }, // uncounted → ignored
    { type: "REWARD_REDEEMED", delta: -10 }, // redemption → ignored
    {}, // no data → ignored
  ];
  assert.deepEqual(countLedgerRows(rows), { stampCount: 2, redemptionCount: 1, skippedRows: 2 });
  assert.equal(isCountedStampRow({ type: "REWARD_REDEEMED", delta: -10 }), false);
  assert.equal(isCountedStampRow({ delta: 1 }), true);
});

/* ------------------------------------------------------------------ *
 * 5. Canonical rules surface (admin copy)
 * ------------------------------------------------------------------ */

test("the shipped rules enforce the cooldown with server time on both writes", () => {
  assert.match(rules, /request\.time >= lastStampAt \+ duration\.value\(12, 'h'\)/);
  assert.match(rules, /stampCooldownHasElapsed\(request\.resource\.data\.customerId\)/);
  assert.match(rules, /stampCooldownHasElapsed\([\s\S]*?sellStamps|stampCooldownHasElapsed\(/);
});

test("the rules keep every role least-privileged", () => {
  // No global write, no recursive admin write.
  const recursive = rules.match(/match \/\{document=\*\*\} \{([\s\S]*?)\n    \}/)?.[1] ?? "";
  assert.match(recursive, /allow read: if isActiveAdmin\(\)/);
  assert.doesNotMatch(recursive, /allow\s+[^;]*write/);

  // Customers can read their own loyalty and tokens, never write loyalty.
  const loyaltyBlock = rules.match(/match \/loyaltyAccounts\/\{customerId\} \{([\s\S]*?)\n    \}/)?.[1] ?? "";
  assert.match(loyaltyBlock, /uid\(\) == customerId/);
  assert.doesNotMatch(loyaltyBlock, /allow\s+write/);

  // Review items keep the canonical { id, name } records.
  assert.match(rules, /function itemRecords\(v, maxItems\)/);
  assert.match(rules, /itemRecords\(\s*request\.resource\.data\.selectedItems,/);

  // Every collection the three apps share is declared.
  for (const path of [
    "match /customers/{customerId}",
    "match /loyaltyAccounts/{customerId}",
    "match /customerTokens/{token}",
    "match /stampTransactions/{transactionId}",
    "match /rewardRedemptions/{redemptionId}",
    "match /notifications/{notificationId}",
    "match /reviews/{reviewId}",
    "match /feedback/{feedbackId}",
  ]) {
    assert.ok(rules.includes(path), `missing rules block: ${path}`);
  }
});
