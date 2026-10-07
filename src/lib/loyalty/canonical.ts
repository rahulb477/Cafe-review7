/**
 * CANONICAL loyalty model for project `cafe-review7` (Admin App copy).
 *
 * The Customer App, the Staff App and the Admin App must agree on exactly this:
 *
 *   loyaltyAccounts/{customerId} =
 *     { clientId, customerId, currentStamps, stamps, lifetimeStamps,
 *       rewardsEarned, rewardsRedeemed, stampTarget, rewardName,
 *       isEligibleForReward, lastStampAt, updatedAt }
 *
 *   * One successful normal stamp per customer per business every 12 hours:
 *     nextStampAt = lastStampAt + 12h  (server-side authority: Firestore Rules
 *     compare request.time >= lastStampAt + duration.value(12, 'h')).
 *   * currentStamps resets by the reward configuration on redemption;
 *     lifetimeStamps is monotonic and NEVER resets.
 *
 * The identical module is shipped to the other two apps so there is a single
 * definition of the rule (verified by tests/loyalty-parity.test.mjs).
 *
 * Pure and dependency-free: safe in React, in Node scripts and in tests.
 * Uses only erasable TypeScript syntax so `node --test` can load it directly.
 */

/** Normal staff stamps are separated by an exact 12-hour server-time window. */
export const STAMP_COOLDOWN_HOURS = 12;
export const STAMP_COOLDOWN_MS = STAMP_COOLDOWN_HOURS * 60 * 60 * 1000;

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Non-negative integer or 0 (missing, strings, NaN, negatives → 0). Never NaN. */
export function safeCount(value: unknown): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return isFiniteNumber(n) && n >= 0 ? Math.floor(n) : 0;
}

/**
 * Any Firestore-ish date value → epoch milliseconds, or null.
 * Supports Firestore Timestamp (toDate/toMillis), serialized
 * { seconds, nanoseconds } / { _seconds, _nanoseconds }, Date, ISO strings,
 * epoch seconds (< 1e11) and epoch milliseconds.
 */
export function toMillisSafe(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") return normalizeEpoch(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^-?\d+$/.test(trimmed)) return normalizeEpoch(Number(trimmed));
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object") {
    const v = value as {
      toDate?: () => unknown;
      toMillis?: () => unknown;
      seconds?: number;
      _seconds?: number;
      nanoseconds?: number;
      _nanoseconds?: number;
    };
    if (typeof v.toDate === "function") {
      const d = v.toDate();
      if (d instanceof Date && Number.isFinite(d.getTime())) return d.getTime();
    }
    if (typeof v.toMillis === "function") {
      const ms = v.toMillis();
      if (isFiniteNumber(ms)) return ms;
    }
    const seconds = isFiniteNumber(v.seconds) ? v.seconds : isFiniteNumber(v._seconds) ? v._seconds : null;
    if (seconds !== null) {
      const nanos = isFiniteNumber(v.nanoseconds) ? v.nanoseconds : isFiniteNumber(v._nanoseconds) ? v._nanoseconds : 0;
      return normalizeEpoch(seconds * 1000 + Math.floor(nanos / 1e6));
    }
  }
  return null;
}

function normalizeEpoch(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const ms = value < 1e11 ? value * 1000 : value;
  return Number.isFinite(ms) ? ms : null;
}

export interface StampCooldown {
  /** false when there is no usable lastStampAt (no recorded stamp yet). */
  hasLastStamp: boolean;
  lastStampAtMillis: number | null;
  /** lastStampAt + 12h. */
  nextStampAtMillis: number | null;
  remainingMs: number;
  /** true while the 12-hour window is still running. */
  active: boolean;
  /** true when a stamp may be awarded now (or none was ever recorded). */
  eligible: boolean;
  /** "8h 32m" while active, "" when eligible. */
  remainingLabel: string;
}

/**
 * The 12-hour rule, evaluated exactly like the Security Rules do
 * (`request.time >= lastStampAt + duration.value(12, 'h')`).
 * `nowMillis` is the server decision time when used to authorize a write; the
 * browser clock is only ever used for display copy.
 */
export function computeStampCooldown(
  lastStampAt: unknown,
  nowMillis: number,
): StampCooldown {
  const now = Number.isFinite(nowMillis) ? nowMillis : Date.now();
  const lastStampAtMillis = toMillisSafe(lastStampAt);
  if (lastStampAtMillis === null) {
    return {
      hasLastStamp: false,
      lastStampAtMillis: null,
      nextStampAtMillis: null,
      remainingMs: 0,
      active: false,
      eligible: true,
      remainingLabel: "",
    };
  }
  const nextStampAtMillis = lastStampAtMillis + STAMP_COOLDOWN_MS;
  const remainingMs = Math.max(0, nextStampAtMillis - now);
  return {
    hasLastStamp: true,
    lastStampAtMillis,
    nextStampAtMillis,
    remainingMs,
    active: remainingMs > 0,
    eligible: remainingMs === 0,
    remainingLabel: remainingMs > 0 ? formatCooldownRemaining(remainingMs) : "",
  };
}

/** Short informational copy; it never authorizes or schedules a stamp. */
export function formatCooldownRemaining(remainingMs: number): string {
  const safe = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : 0;
  const totalMinutes = Math.ceil(safe / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

/**
 * True when an operation with this idempotency key was already applied.
 * A pending (visitCounted === false) phase-one row is NOT a replay: it still
 * has to be counted exactly once.
 */
export function isReplayedStamp(existingLedgerRow: unknown, transactionId: string): boolean {
  const row = (existingLedgerRow ?? {}) as Record<string, unknown>;
  if (!row || Object.keys(row).length === 0) return false;
  const rowTransactionId = typeof row.transactionId === "string" ? row.transactionId : "";
  return rowTransactionId === transactionId && row.visitCounted !== false;
}

export type StampGateCode = "OK" | "COOLDOWN" | "REPLAY" | "CROSS_BUSINESS" | "LOYALTY_DISABLED";

export interface StampGateInput {
  /** Business the write is happening in (from Auth UID → staffUsers/admin). */
  clientId: string;
  loyaltyEnabled: boolean;
  /** customers/{customerId}.clientId — null when the document is missing. */
  customerClientId: string | null;
  /** loyaltyAccounts/{customerId}.clientId — null when no account exists yet. */
  loyaltyClientId: string | null;
  lastStampAt: unknown;
  /** Server decision time (Firestore request.time) when authorizing a write. */
  nowMillis: number;
  transactionId: string;
  /** Ledger row already stored under the same idempotency key, if any. */
  existingLedgerRow?: unknown;
}

export interface StampGateDecision {
  /** true only when a NEW stamp may be applied. */
  allowed: boolean;
  code: StampGateCode;
  cooldown: StampCooldown;
  message: string;
}

/**
 * THE single pure definition of "may this stamp be applied?".
 *
 * It mirrors — line for line — what Firestore Rules evaluate in the commit:
 *   1. idempotent retry of a counted transaction  → REPLAY (no new writes)
 *   2. loyalty switched off for the business      → LOYALTY_DISABLED
 *   3. customer/loyalty belongs to another store   → CROSS_BUSINESS
 *   4. request.time >= lastStampAt + 12h           → COOLDOWN until then
 *   5. otherwise                                   → OK (one stamp, one visit,
 *                                                     one ledger row, one notification)
 *
 * Firestore `request.time` remains the only authority; this function exists so
 * all three apps (Customer/Staff/Admin) and the contract tests agree on one rule.
 */
export function evaluateStampGate(input: StampGateInput): StampGateDecision {
  const cooldown = computeStampCooldown(input.lastStampAt, input.nowMillis);

  if (isReplayedStamp(input.existingLedgerRow, input.transactionId)) {
    return {
      allowed: false,
      code: "REPLAY",
      cooldown,
      message: "This stamp operation was already applied — nothing is counted twice.",
    };
  }
  if (!input.loyaltyEnabled) {
    return { allowed: false, code: "LOYALTY_DISABLED", cooldown, message: "Loyalty is switched off for this business." };
  }
  if (input.customerClientId !== null && input.customerClientId !== input.clientId) {
    return { allowed: false, code: "CROSS_BUSINESS", cooldown, message: "This guest belongs to another business." };
  }
  if (input.loyaltyClientId !== null && input.loyaltyClientId !== input.clientId) {
    return { allowed: false, code: "CROSS_BUSINESS", cooldown, message: "This loyalty account belongs to another business." };
  }
  if (cooldown.active) {
    return {
      allowed: false,
      code: "COOLDOWN",
      cooldown,
      message: `This guest already received a stamp. Next stamp available in ${cooldown.remainingLabel}.`,
    };
  }
  return { allowed: true, code: "OK", cooldown, message: "Stamp may be applied." };
}

export interface LoyaltyLedgerCounts {
  /** Counted stamp transactions (valid, immutable history). */
  stampCount: number;
  /** Reward redemptions recorded in the ledger. */
  redemptionCount: number;
  /** Ledger rows skipped as uncounted / malformed / redemption entries. */
  skippedRows: number;
}

/** True when a ledger row is a counted stamp (never a redemption or pending row). */
export function isCountedStampRow(data: unknown): boolean {
  const row = (data ?? {}) as Record<string, unknown>;
  const type = typeof row.type === "string" ? row.type : "";
  if (type === "REWARD_REDEEMED" || type === "REWARD") return false;
  if (row.visitCounted === false) return false;
  if (type === "STAMP_ADDED") {
    const delta = row.delta === undefined ? 1 : safeCount(row.delta);
    return delta === 1;
  }
  if (type) return false;
  // Untyped legacy rows count only when they are an explicit +1 stamp.
  const delta = row.delta === undefined ? null : Number(row.delta);
  return delta === 1;
}

/** counts + never NaN. */
export function countLedgerRows(rows: readonly unknown[]): LoyaltyLedgerCounts {
  let stampCount = 0;
  let redemptionCount = 0;
  let skippedRows = 0;
  for (const row of rows) {
    const data = (row ?? {}) as Record<string, unknown>;
    const type = typeof data.type === "string" ? data.type : "";
    if (type === "REWARD_REDEEMED" || type === "REWARD") {
      redemptionCount += 1;
      continue;
    }
    if (isCountedStampRow(data)) stampCount += 1;
    else skippedRows += 1;
  }
  return { stampCount, redemptionCount, skippedRows };
}

/**
 * lifetimeStamps must represent TOTAL stamps ever earned: it takes the largest
 * trustworthy value (stored counter, ledger history, current balance) and can
 * only ever grow. Never 0 while valid stamp history exists.
 */
export function reconcileLifetimeStamps(
  currentStamps: unknown,
  storedLifetimeStamps: unknown,
  ledgerStampCount?: number,
  rewardsRedeemed?: number,
  stampTarget?: number,
): number {
  const redeemedFloor =
    safeCount(rewardsRedeemed) * (safeCount(stampTarget) > 0 ? safeCount(stampTarget) : 0);
  return Math.max(
    safeCount(currentStamps),
    safeCount(storedLifetimeStamps),
    safeCount(ledgerStampCount),
    safeCount(currentStamps) + redeemedFloor,
  );
}

/**
 * Canonical readers used by the admin UI — the only accepted way to show a
 * balance, so a missing/legacy document can never render NaN/undefined.
 */
export function currentStampsOf(account: unknown): number {
  const record = (account ?? {}) as Record<string, unknown>;
  return safeCount(record.currentStamps ?? record.stamps);
}

export function lifetimeStampsOf(account: unknown, ledgerStampCount?: unknown): number {
  const record = (account ?? {}) as Record<string, unknown>;
  return reconcileLifetimeStamps(
    currentStampsOf(record),
    record.lifetimeStamps,
    safeCount(ledgerStampCount),
    safeCount(record.rewardsRedeemed),
    safeCount(record.stampTarget),
  );
}

export interface LoyaltyState {
  /** Canonical balance (legacy alias `stamps` is accepted everywhere). */
  currentStamps: number;
  stamps?: number;
  lifetimeStamps: number;
  rewardsEarned: number;
  rewardsRedeemed: number;
  stampTarget: number;
  lastStampAt: unknown;
}

export interface StampAwardPlan {
  currentStamps: number;
  lifetimeStamps: number;
  rewardsEarned: number;
  rewardUnlocked: boolean;
  /** true when this stamp crosses (or repairs) the reward threshold. */
  rewardJustUnlocked: boolean;
}

/**
 * The single definition of "one successful stamp" — used by the Admin App and
 * asserted by the contract tests shared with the Staff App:
 *   currentStamps += 1, lifetimeStamps += 1, rewardsEarned updated on threshold.
 */
export function planStampAward(
  account: Partial<LoyaltyState>,
  ledgerStampCount?: number,
): StampAwardPlan {
  const target = safeCount(account.stampTarget);
  const before = currentStampsOf(account);
  const currentStamps = before + 1;
  const rewardsRedeemed = safeCount(account.rewardsRedeemed);
  const storedEarned = Math.max(safeCount(account.rewardsEarned), rewardsRedeemed);
  const rewardJustUnlocked =
    (before < target && currentStamps >= target) || (before >= target && storedEarned === rewardsRedeemed);
  return {
    currentStamps,
    lifetimeStamps:
      reconcileLifetimeStamps(before, account.lifetimeStamps, ledgerStampCount, rewardsRedeemed, target) + 1,
    rewardsEarned: storedEarned + (rewardJustUnlocked ? 1 : 0),
    rewardUnlocked: currentStamps >= target,
    rewardJustUnlocked,
  };
}

export interface RedemptionPlan {
  currentStamps: number;
  /** Always unchanged by a redemption. */
  lifetimeStamps: number;
  rewardsEarned: number;
  rewardsRedeemed: number;
}

/**
 * Redemption: currentStamps drops by the configured reward cost, lifetimeStamps
 * MUST NOT reset, earned/redeemed counters move together.
 */
export function planRedemption(
  account: Partial<LoyaltyState>,
  stampCost?: number,
): RedemptionPlan {
  const cost = safeCount(stampCost) > 0 ? safeCount(stampCost) : safeCount(account.stampTarget);
  const before = currentStampsOf(account);
  const currentStamps = Math.max(0, before - cost);
  const rewardsRedeemed = safeCount(account.rewardsRedeemed) + 1;
  return {
    currentStamps,
    // A redemption NEVER resets stamp history.
    lifetimeStamps: Math.max(safeCount(account.lifetimeStamps), before, currentStamps),
    rewardsEarned: Math.max(safeCount(account.rewardsEarned), rewardsRedeemed),
    rewardsRedeemed,
  };
}

export function isRewardRedeemable(currentStamps: unknown, stampTarget: unknown): boolean {
  const target = safeCount(stampTarget);
  return target > 0 && safeCount(currentStamps) >= target;
}

/** Compact "6 Oct 2026, 9:42 pm" for a Firestore-ish value; "—" when unusable. */
export function formatTimestamp(value: unknown, options: { withTime?: boolean; fallback?: string } = {}): string {
  const fallback = options.fallback ?? "—";
  const ms = toMillisSafe(value);
  if (ms === null) return fallback;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      ...(options.withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    }).format(new Date(ms));
  } catch {
    return fallback;
  }
}
