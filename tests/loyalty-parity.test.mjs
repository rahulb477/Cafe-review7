/**
 * THREE-APP PARITY (Admin App copy).
 *
 * Proves that the Customer App, the Staff App and this Admin App ship the SAME
 * authoritative model for project cafe-review7:
 *
 *   1. one byte-identical `firestore.rules` in all three repositories
 *   2. one byte-identical canonical loyalty module in all three repositories
 *   3. the three module copies return IDENTICAL decisions for the shared
 *      boundary table (10:00:00 ok / 21:59:59 reject / 22:00:00 ok, replays,
 *      cross-business, disabled loyalty, simultaneous stamps)
 *
 * Repositories are located via PARITY_REPOS (colon separated) or the sibling
 * directories next to this checkout. When a repository is not present the
 * corresponding assertions are skipped with a visible message instead of
 * passing silently.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const parent = dirname(repoRoot);

const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const read = (file) => readFileSync(file, "utf8");

const REPOS = [
  { name: "Cafe-review7 (admin)", root: repoRoot, rules: "firestore.rules", module: "src/lib/loyalty/canonical.ts", required: true },
  { name: "Cafe-review (customer)", root: resolve(parent, "Cafe-review"), rules: "firebase/firestore.rules", module: "src/shared/loyaltyCanonical.ts" },
  { name: "Cafe-review-staff (staff)", root: resolve(parent, "Cafe-review-staff"), rules: "firestore.rules", module: "src/services/loyaltyCanonical.ts" },
];

const envRepos = (process.env.PARITY_REPOS ?? "").split(":").filter(Boolean);
if (envRepos.length) {
  REPOS[1].root = envRepos[0];
  REPOS[2].root = envRepos[1] ?? REPOS[2].root;
}

const present = REPOS.filter((repo) => existsSync(resolve(repo.root, repo.rules)) && existsSync(resolve(repo.root, repo.module)));
const missing = REPOS.filter((repo) => !present.includes(repo));

const TEN_AM = Date.parse("2026-10-06T04:30:00.000Z");
const H = 3600 * 1000;

const BOUNDARY_TABLE = [
  ["10:00:00 first stamp", { lastStampAt: null, nowMillis: TEN_AM }, "OK", true],
  ["21:59:59 (11h59m59s later)", { lastStampAt: TEN_AM, nowMillis: TEN_AM + 12 * H - 1000 }, "COOLDOWN", false],
  ["22:00:00 exactly 12h later", { lastStampAt: TEN_AM, nowMillis: TEN_AM + 12 * H }, "OK", true],
  ["22:00:00 minus 1ms", { lastStampAt: TEN_AM, nowMillis: TEN_AM + 12 * H - 1 }, "COOLDOWN", false],
  ["13h later", { lastStampAt: TEN_AM, nowMillis: TEN_AM + 13 * H }, "OK", true],
  ["replayed transaction", { lastStampAt: null, nowMillis: TEN_AM, transactionId: "TXN-1", existingLedgerRow: { transactionId: "TXN-1", type: "STAMP_ADDED", visitCounted: true, delta: 1 } }, "REPLAY", false],
  ["pending (uncounted) row retried", { lastStampAt: null, nowMillis: TEN_AM, transactionId: "TXN-2", existingLedgerRow: { transactionId: "TXN-2", type: "STAMP_ADDED", visitCounted: false, delta: 1 } }, "OK", true],
  ["other business", { lastStampAt: null, nowMillis: TEN_AM, customerClientId: "cli_other" }, "CROSS_BUSINESS", false],
  ["loyalty disabled", { lastStampAt: null, nowMillis: TEN_AM, loyaltyEnabled: false }, "LOYALTY_DISABLED", false],
  ["second of two simultaneous", { lastStampAt: TEN_AM, nowMillis: TEN_AM + 250 }, "COOLDOWN", false],
];

async function loadModule(repo) {
  return import(pathToFileURL(resolve(repo.root, repo.module)).href);
}

for (const repo of present) {
  test(`${repo.name}: canonical module matches this app byte for byte`, async () => {
    const reference = REPOS[0];
    if (repo.root === reference.root) return;
    assert.equal(
      sha(resolve(repo.root, repo.module)),
      sha(resolve(reference.root, reference.module)),
      `${repo.name} ships a different canonical module`,
    );
  });

  test(`${repo.name}: firestore.rules matches this app byte for byte`, () => {
    const reference = REPOS[0];
    if (repo.root === reference.root) return;
    assert.equal(
      sha(resolve(repo.root, repo.rules)),
      sha(resolve(reference.root, reference.rules)),
      `${repo.name} ships different security rules`,
    );
  });

  test(`${repo.name}: rules keep the shared cooldown contract`, () => {
    const rules = read(resolve(repo.root, repo.rules));
    assert.match(rules, /request\.time >= lastStampAt \+ duration\.value\(12, 'h'\)/);
    assert.match(rules, /stampCooldownHasElapsed\(request\.resource\.data\.customerId\)/);
    assert.doesNotMatch(rules, /allow\s+(?:read,\s*write|write):\s*if\s+true/);
  });

  test(`${repo.name}: the boundary table resolves identically`, async () => {
    const api = await loadModule(repo);
    assert.equal(api.STAMP_COOLDOWN_MS, 12 * H);
    for (const [label, input, code, allowed] of BOUNDARY_TABLE) {
      const decision = api.evaluateStampGate({
        clientId: "cli_bake",
        loyaltyEnabled: true,
        customerClientId: "cli_bake",
        loyaltyClientId: "cli_bake",
        lastStampAt: null,
        nowMillis: TEN_AM,
        transactionId: "TXN-NEW",
        ...input,
      });
      assert.equal(decision.code, code, `${repo.name}: ${label}`);
      assert.equal(decision.allowed, allowed, `${repo.name}: ${label}`);
    }
  });

  test(`${repo.name}: lifetime / redemption parity`, async () => {
    const api = await loadModule(repo);
    const stamp = api.planStampAward({ currentStamps: 1, lifetimeStamps: 1, rewardsEarned: 0, rewardsRedeemed: 0, stampTarget: 10 });
    assert.deepEqual([stamp.currentStamps, stamp.lifetimeStamps], [2, 2]);
    const redemption = api.planRedemption({ currentStamps: 10, lifetimeStamps: 10, rewardsEarned: 1, rewardsRedeemed: 0, stampTarget: 10 }, 10);
    assert.deepEqual([redemption.currentStamps, redemption.lifetimeStamps, redemption.rewardsRedeemed], [0, 10, 1]);
    assert.equal(api.lifetimeStampsOf({ currentStamps: 2, lifetimeStamps: 0, stamps: 2 }, 2), 2);
  });
}

test("repositories checked in this build", () => {
  const names = present.map((repo) => repo.name).join(", ");
  console.log(`parity checked against: ${names}`);
  if (missing.length) {
    console.log(`not present in this workspace (skipped): ${missing.map((repo) => `${repo.name} @ ${repo.root}`).join(", ")}`);
    console.log("set PARITY_REPOS=/path/to/Cafe-review:/path/to/Cafe-review-staff to include them");
  }
  assert.ok(present.some((repo) => repo.required), "the repository under test must be present");
});
