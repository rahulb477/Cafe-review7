# Customer + Staff + Admin — 12-hour stamp & lifetime-stamp consistency report

Project: **cafe-review7** · Repos: `Cafe-review` (customer), `Cafe-review-staff` (staff),
`Cafe-review7` (admin) · Date: 2026-10-07

> **Honest status first.** The three apps now ship **one byte-identical
> `firestore.rules`** and **one byte-identical canonical loyalty module**, and both
> are covered by automated contract + parity tests that pass in all three repos.
> The rules were **not deployed** to Firebase: this sandbox has no `firebase` CLI,
> no Java/emulator and no service-account credentials, so no emulator test and no
> deployment was performed or claimed. Exact deploy command is in section I.

---

## A. Customer App status

Repo `rahulb477/Cafe-review` (working tree of clone `e15a008`). The app stays
**read-only** for loyalty, keeps its identity/QR/review/feedback architecture and
received no UI redesign — the loyalty screens gained one read-only summary panel.

| Area | Change |
| --- | --- |
| `src/types/loyalty.ts` | `LoyaltyAccount` now carries canonical `lifetimeStamps`, `lastStampAt`, `cooldownActive`, `nextStampAt`, `cooldownRemainingLabel`, `nextStampAtLabel`, `rewardsEarned/Redeemed` |
| `src/services/firebase/loyaltyMapper.ts` | reads `currentStamps` (legacy `stamps` fallback); lifetime via the shared ledger-reconciled reader; derives the 12 h cooldown from `lastStampAt`; other-business documents still collapse to 0 |
| `src/components/LoyaltyStatusPanel.tsx` (new) | Current · Lifetime · Last stamp + one line: “Next stamp available in 8h 32m (available at 9:42 PM)” or “Show my QR to earn a stamp” |
| `src/app/[businessSlug]/stamps/page.tsx`, `…/qr/page.tsx` | render the panel; no other layout change |
| `src/store/clientStore.ts`, `src/components/FirebaseSessionBridge.tsx` | mirror the canonical fields from the live snapshot (never writable) |
| `src/services/firebase/reviewService.ts` + `src/shared/reviewItems.ts` (new) | review rows now store `selectedItems: [{ id, name }]` built from the live menu (plus `itemsTried`, `menuItemIds`); free text/emoji labels are dropped |
| `src/server/ai/realProvider.ts` | prompt now forbids emojis outright |

Timestamps always flow through `toDateSafe` / `formatFirestoreDate` → `—` for
junk (never “Invalid Date”/NaN). QR stays token-only (`generateCustomerQR(slug, token)`);
visits are never counted by this app. Validation: **tests 34/34, lint clean,
`tsc --noEmit` clean, `next build` exit 0.**

## B. Staff App status

Repo `Cafe-review-staff` (clone `20a3dff`). The stamp transaction already wrote
the canonical fields; it now shares one policy module and is covered by the
cross-app contract suite.

| Area | Change |
| --- | --- |
| `firestore.rules` | replaced by the canonical ruleset (identical sha256 to the other two repos) |
| `src/services/loyaltyCanonical.ts` (new) | byte-identical copy of the canonical module |
| `src/services/stampPolicy.ts` | reduced to a thin re-export/adapter over the canonical module (one definition of the 12 h window) |
| `tests/loyalty-contracts.test.mjs`, `tests/loyalty-parity.test.mjs` (new) | 27 added tests |

Unchanged (verified, already canonical): `firebaseService.addStamp()` is one
Firestore transaction that writes `stampTransactions/{txId}` (with
`type: "STAMP_ADDED"`, `visitCounted: true`, before/after counts,
`rewardUnlocked`), `customers/{uid}.totalVisits + 1` / `lastVisitAt` /
`lastVisitTransactionId`, `loyaltyAccounts/{uid}` with `currentStamps`, `stamps`,
`lifetimeStamps` (ledger-reconciled, **+1**), `rewardsEarned/Redeemed`,
`isEligibleForReward`, `lastStampAt`, plus the stamp/reward notifications. A
replayed idempotency key returns the first outcome (`replayed: true`) and writes
nothing. A rule denial is mapped to `STAMP_COOLDOWN` with the remaining time.
Validation: **`npm test` 100/100** (73 pre-existing + 27 new), lint clean,
`tsc --noEmit` clean, build result in section K.

## C. Admin status

Repo `Cafe-review7` (this checkout, `774398e`).

| Area | Change |
| --- | --- |
| `firestore.rules` | canonical ruleset (identical sha256) |
| `src/lib/loyalty/canonical.ts` (new) | canonical model: cooldown math, ledger filter, lifetime reconciliation, stamp/redemption plans, `evaluateStampGate()`, safe readers |
| `src/lib/format.ts` | date/time/count formatting can no longer print “Invalid Date”/NaN — everything goes through the safe converters (`—` fallback) |
| `src/lib/firebase/types.ts` | `CustomerDoc.createdAt: unknown`; `LoyaltyDoc` carries `currentStamps`, `lastStampAt`, `stampTarget`…; `StampTxDoc` carries `type`/`visitCounted` |
| `src/services/firebase/customerService.ts` | list/detail decorate rows with canonical `currentStamps` / `lifetimeStamps`; detail also returns the valid ledger counts and the cooldown; human-readable **customer code stays separate from the Firebase UID** (`code`/`customerCode`/`displayId` only) |
| `src/services/firebase/loyaltyService.ts` | award/reset/redeem go through the canonical plans: awards respect the 12 h window, resets are negative adjustment transactions (history kept), redemption clears `currentStamps` by the configured cost and **never resets `lifetimeStamps`** |
| customers list/detail pages, staff client page | display `currentStamps`, lifetime, last stamp and next-stamp window; removed the raw `account?.stamps ?? 0` reads |
| `scripts/reconcile-loyalty-data.mjs` (new) | safe dry-run reconciliation + duplicate audit + demo-content audit; never deletes/merges; `--apply-counters` only ever *raises* `lifetimeStamps`, and only with `--confirm-project cafe-review7` |
| `scripts/audit-demo-content.mjs` (new) | read-only scan for demo copy, prints collection → document → field → value |

Validation: **`npm test` 27/27, lint clean, `tsc --noEmit` clean**, build result in section K.

## D. Exact 12-hour enforcement location

Canonical file: `firestore.rules` (sha256 `88c65f926243aced6c41fd72198cff9ad50f4d42ea0816a01f734759471ec0c1`, 2101 lines, identical in all three repos).

* `stampCooldownHasElapsed(customerId)` — **line 197** — is the single gate:
  it loads `loyaltyAccounts/{customerId}.lastStampAt` (falling back to the
  server-written `customers/{customerId}.lastVisitAt` only when the loyalty
  timestamp is absent/malformed, failing closed for legacy activity rows) and
  returns `request.time >= lastStampAt + duration.value(12, 'h')`.
* The stamp ledger create requires it at **line 659**
  (`clients/{clientId}/stampTransactions/{txId}`, STAMP_ADDED branch).
* The balance step cannot bypass it: `validStampAccountMutation()` (**line 1400**)
  requires `matchingStampTransaction()` (**line 1327**) — the ledger row written
  in the *same commit* — and `request.resource.data.currentStamps ==
  loyaltyStampBaseline() + 1` (**line 1594**). There is no alternate write path
  (direct balance edits, customer search, repeated taps, refresh, multi-tab or
  direct REST/SDK calls all hit the same rule).
* `request.time` is evaluated by Firestore at commit, so two simultaneous
  requests cannot both succeed: the second commit re-reads `lastStampAt` and is
  denied. The Staff App is not the authority — it merely surfaces the denial as
  a cooldown message.
* Shared pure mirror for all three apps & tests: `evaluateStampGate()` in the
  canonical module — 10:00:00 **OK** · 21:59:59 **COOLDOWN** ·
  22:00:00 **OK** · replay **REPLAY** (no new writes) · other business
  **CROSS_BUSINESS** · loyalty off **LOYALTY_DISABLED**.

## E. Lifetime-stamp write path

`firebaseService.addStamp()` (Staff) computes
`lifetimeStamps = reconcileLifetimeStamps(previousStamps, stored, ledgerStampCount) + 1`
and merges it with `currentStamps`, `stamps`, `totalRewardsEarned/Redeemed`,
`lastStampAt`, `updatedAt` in the same transaction that creates the stamp row and
increments `totalVisits`/`lastVisitAt`. The canonical reader additionally floors
lifetime at `currentStamps + rewardsRedeemed × stampTarget`, so a redemption can
never shrink it. Admin award/reset/redeem use the same `planStampAward()` /
`planRedemption()`; redemption sets `currentStamps` per configuration and leaves
lifetime untouched (10/10 → 0/10 displayed as 10 lifetime).

## F. Existing-data reconciliation status

Not executed — it needs a service account; this sandbox has no credentials and
no network route to Firestore. Ready to run:

```bash
# 1) dry run (default) — writes nothing
GOOGLE_APPLICATION_CREDENTIALS=sa.json npm run reconcile:loyalty
# equivalent: node scripts/reconcile-loyalty-data.mjs --dry-run

# 2) inspect reports/loyalty-reconciliation.json, then apply counters only
GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/reconcile-loyalty-data.mjs \
  --apply-counters --confirm-project cafe-review7
```

The staff repo keeps its own audited script (`npm run reconcile:customers`,
`scripts/reconcile-customer-data.mjs`) for the same data with the same
dry-run-first contract; this admin script additionally covers lifetime-vs-ledger
drift and the demo-content scan.

It recomputes lifetime from **valid** stamp rows (excludes `REWARD_REDEEMED`
rows and `visitCounted: false` pending rows), inspects `stampTransactions`,
`loyaltyAccounts`, `currentStamps`, `lifetimeStamps`, redemptions and `clientId`,
and reports discrepancies. Kai’s shape (2 valid transactions, `currentStamps` 2,
`lifetimeStamps` 0) is detected and expected as **≥ 2**; `--apply-counters` only
raises stored lifetime and never lowers or overwrites a larger value. Without
credentials the customer app already *displays* the reconciled value (2), so the
number is correct on screen while the document repair waits for a human run.

## G. Duplicate-customer status

Unchanged and safe: no automatic merge/delete (`reconcile:customers` in the
staff repo and `reconcile:loyalty` here are both report-only by default, and the
admin script marks every group `manual-review-only`). The `dedupeCustomers()` display
helper (`src/shared/customerDisplay.ts`, customer repo) shows each
`clientId + normalizedPhone` group once and reports the rest; the reconciliation
script audits collisions with evidence (ids, names, codes, visits, current and
lifetime stamps, ledger counts, QR token, phone-index id, creation date) and
marks every group `manual-review-only`. **Goku Bhati’s duplicates were not
touched.** Only confirmed orphan/duplicate records may be removed later, by a
human, after review.

## H. Rules-compatibility status

`firestore.rules` is byte-identical in all three repos
(`88c65f926243aced…`) — one canonical ruleset for cafe-review7, no diverging
copies. Deployment file mapping: `Cafe-review/firebase/firestore.rules`,
`Cafe-review-staff/firestore.rules` (+ indexes), `Cafe-review7/firestore.rules`.
Covered blocks: `customers/{customerId}`, `loyaltyAccounts/{customerId}`,
`customerTokens/{token}`, `clients/{clientId}/stampTransactions`,
`…/rewardRedemptions`, `…/notifications`, `reviews`, `feedback`, plus `admins`,
`staffUsers`, `clients`, `activityLogs`, `metricsDaily`, `aiUsage`.
No `allow read, write: if true`; no global staff access (staff writes require
`staffUsers/{uid}` active for that client; the recursive admin block is
read-only). Customer reads are limited to their own permitted data and customers
have **no** write access to loyalty or stamp transactions.

## I. Deployment status

**Not deployed.** No `firebase` CLI, no Java/emulator, no credentials in the
sandbox — nothing was pushed to production and no emulator result is claimed.
Exact command (run from a repo with your credentials, e.g. the admin repo):

```bash
# review the compiled rules first
firebase deploy --only firestore:rules --project cafe-review7 --dry-run   # (CLI ≥ 13.x prints the diff)
firebase deploy --only firestore:rules,database --project cafe-review7    # npm run deploy:rules
```

`.firebaserc` in all three repos already points at `cafe-review7`. The rules are
syntactically balanced (braces/parens/brackets 0/0/0) and contract-tested, but a
rules-emulator run (`npm run test:rules`, needs Java) should be the final gate.

## J. Demo Firebase content locations

“Namaste Sir 👋 Main Rahul hoon…” is **not in any repo’s source** (grep across
all three repos finds it only inside the audit script’s search pattern), so it
lives in Firestore data. Exact candidates, by the fields the customer app
renders:

| Collection path | Fields rendered to customers |
| --- | --- |
| `clients/{clientId}` | `businessName`, `displayName`, `tagline`, `description`, `welcomeMessage`, `socials.*`, `wifi.message`, `loyalty.rewardName`, `loyalty.rewardDescription` |
| `clients/{clientId}/menuItems/{itemId}` | `name`, `description`, `fullDescription`, `ingredients`, `category`, `tagline` |
| `clients/{clientId}/menuCategories/{categoryId}` | `name`, `description` |
| `clients/{clientId}/reviewQuestions/{id}` | `title`, `helper`, `text` |

Nothing was modified. To print the exact document id + field + current value
(read-only), run with credentials:

```bash
GOOGLE_APPLICATION_CREDENTIALS=sa.json npm run audit:content
# or: node scripts/audit-demo-content.mjs --project cafe-review7 --client <clientId> --pattern "namaste|rahul|hoon"
```

Replace the value in the Admin Panel (branding/menu editors) — never in code, and
never hardcode a replacement in the frontend.

## K. Tests, builds, lint (what actually ran)

| Repo | Tests | Lint | Typecheck | Build |
| --- | --- | --- | --- | --- |
| `Cafe-review` | 34/34 (`npm test`: 7 display + 11 contracts + 16 parity) | clean | clean | ✅ `.next/BUILD_ID` produced |
| `Cafe-review-staff` | 100/100 (`npm test`: 73 existing + 11 contracts + 16 parity) | clean | clean | ✅ `.next/BUILD_ID` produced |
| `Cafe-review7` | 27/27 (`npm test`: 11 contracts + 16 parity) | clean | clean | ⚠️ blocked ONLY by sandbox network |

The admin build stops at `next/font/google` (`Failed to fetch Fraunces / Plus
Jakarta Sans` from Google Fonts) because this sandbox may only reach
GitHub/npm/PyPI — `fonts.googleapis.com` is unreachable. That import lives in
`src/app/layout.tsx` and is unrelated to the loyalty work; tests, lint and
`tsc --noEmit` all pass, and the same build succeeds on a networked machine/CI.

The parity suite proves, from **every** repo, that the three `firestore.rules`
files and the three canonical modules are byte-identical, that the boundary table
(10:00:00 / 21:59:59 / 22:00:00, replay, pending retry, simultaneous, cross
business, loyalty off) resolves identically, and that lifetime/redemption rules
agree. Contract tests cover the requirements: one stamp per 12 h; two
simultaneous requests → one success; retry → no duplicate; blocked → no visit,
no notification, no increment; lifetime never reset by redemption; counters
never NaN; dates never “Invalid Date”.

Rule execution itself (`npm run test:rules`) was **not** run: it requires the
Firestore emulator/Java, which this sandbox does not have.

## L. Remaining blockers

1. **Deployment** — no CLI/credentials here; rules still need the emulator run +
   `firebase deploy --only firestore:rules,database --project cafe-review7`.
2. **Data repair** — `npm run reconcile:loyalty` (dry-run first) needs a service
   account; Kai’s and any other drifted documents are detected but not written.
3. **Duplicate customers** — Goku Bhati’s duplicates await manual review; nothing
   is auto-deleted or merged.
4. **Demo copy** — exact document/field/value requires a Firestore read
   (`npm run audit:content`); replacement is a human action in the Admin Panel.
5. **Admin build** — re-run `npm run build` on a networked machine/CI: this
   sandbox cannot fetch Google Fonts, so `next/font/google` in the admin
   `src/app/layout.tsx` aborts the Turbopack build (customer and staff builds
   completed here).

## M. Production-readiness statement

Per the standing instruction, the system is **not declared production-ready**:
Customer + Staff + Admin now share the same authoritative 12-hour stamp and
lifetime-stamp model (identical rules + module + passing parity tests), but the
rules are undeployed and the existing-data reconciliation has not been applied.
Complete sections I, F and L.4 first; then the model is consistent end-to-end.
