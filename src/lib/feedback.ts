/**
 * Canonical feedback domain for the Admin App.
 *
 * ONE source of truth for customer ratings:
 *   clients/{clientId}/feedback/{feedbackId}.rating
 *
 * There is no separate reviews/ratings collection — the Admin Feedback page
 * and the Admin Reviews/Ratings page both read the same feedback documents,
 * and every rating statistic on the admin console is computed here.
 *
 * Read-time normalisation (legacy / partially-written document compatibility):
 *   • rating: number | numeric string | null  → number (1–5) | null
 *   • status: "new" | "NEW" | missing         → "new" | "reviewed" | "archived"
 *   • createdAt / updatedAt / repliedAt       → epoch ms | null (via toMillis)
 * Nothing is written back and no production document is rewritten.
 *
 * This module has NO runtime imports (types only) so the rating maths can be
 * unit-tested directly with `node --test`; the one dependency it needs — the
 * shared safe timestamp parser — is injected as `parseTime`
 * (`@/lib/firebase/timestamps#toMillis`).
 */
import type { FeedbackDoc } from "./firebase/types";

/** Rendered instead of a value that does not exist. Never NaN/null/undefined. */
export const NO_VALUE = "—";

export const VALID_RATINGS = [5, 4, 3, 2, 1] as const;
export type ValidRating = (typeof VALID_RATINGS)[number];

export type FeedbackStatus = "new" | "reviewed" | "archived";

/** The four filter pills on the Admin Feedback page. */
export const FEEDBACK_FILTERS = ["ALL", "NEW", "REVIEWED", "ARCHIVED"] as const;
export type FeedbackFilter = (typeof FEEDBACK_FILTERS)[number];

/** filter pill → stored status value. */
export const STATUS_BY_FILTER: Record<Exclude<FeedbackFilter, "ALL">, FeedbackStatus> = {
  NEW: "new",
  REVIEWED: "reviewed",
  ARCHIVED: "archived",
};

export type RatingSummary = {
  /** Every feedback document in scope (rated + text-only). */
  total: number;
  /** Documents with a valid 1–5 rating — the ONLY denominator for the average. */
  totalRated: number;
  /** Text-only feedback (rating null/absent) — never affects the average. */
  totalTextOnly: number;
  /** Exact average of the valid ratings, or null when there are none. NaN can never occur. */
  average: number | null;
  /** Display form of `average`: "—", "5.0", "4.5", "4.67". */
  averageText: string;
  /** Star distribution — always all five keys, always integers ≥ 0. */
  counts: Record<ValidRating, number>;
};

/** A feedback document, normalised once at read time for the UI. */
export type FeedbackRecord = {
  id: string;
  clientId: string;
  message: string;
  /** 1–5, or null for text-only feedback. Never NaN/undefined. */
  rating: number | null;
  hasRating: boolean;
  status: FeedbackStatus;
  /** Raw stored status ("NEW" on legacy documents) — kept for diagnostics. */
  rawStatus: string;
  source: string;
  adminReply: string | null;
  aiReply: string | null;
  repliedBy: string | null;
  createdAtMs: number | null;
  updatedAtMs: number | null;
  repliedAtMs: number | null;
  /** Legacy field from the pre-rating feedback schema; null on new documents. */
  sentiment: string | null;
};

/** The shared safe parser (`@/lib/firebase/timestamps#toMillis`). */
export type TimestampParser = (value: unknown) => number | null;

/* ------------------------------------------------------------------ *
 * Normalisation (read time only)
 * ------------------------------------------------------------------ */

const asText = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

/**
 * Valid rating: a finite number between 1 and 5 inclusive.
 * Tolerates numeric strings ("5") from older documents; everything else
 * (null, "", "abc", NaN, Infinity, 0, 6, -1, {}, []) → null.
 */
export function normalizeRating(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 1 || numeric > 5) return null;
  return numeric;
}

export const hasValidRating = (value: unknown): boolean => normalizeRating(value) !== null;

/** Star bucket for a valid rating — always one of 1..5, never NaN. */
export function ratingBucket(rating: number | null): ValidRating | null {
  if (rating === null || !Number.isFinite(rating)) return null;
  const rounded = Math.round(rating);
  if (rounded < 1 || rounded > 5) return null;
  return rounded as ValidRating;
}

/** "new" | "reviewed" | "archived" — case-insensitive, missing → "new". */
export function normalizeStatus(value: unknown): FeedbackStatus {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (text === "reviewed") return "reviewed";
  if (text === "archived") return "archived";
  return "new";
}

/**
 * Normalise one raw Firestore feedback document.
 * Accepts the canonical schema and legacy documents (sentiment, "NEW",
 * pre-rating records, serialized timestamps, missing reply fields).
 */
export function normalizeFeedback(raw: FeedbackDoc & { id: string }, parseTime: TimestampParser): FeedbackRecord {
  const rating = normalizeRating(raw.rating);
  return {
    id: raw.id,
    clientId: typeof raw.clientId === "string" ? raw.clientId : "",
    message: asText(raw.message) ?? "",
    rating,
    hasRating: rating !== null,
    status: normalizeStatus(raw.status),
    rawStatus: typeof raw.status === "string" ? raw.status : "",
    source: asText(raw.source) ?? "customer_feedback",
    adminReply: asText(raw.adminReply),
    aiReply: asText(raw.aiReply),
    repliedBy: asText(raw.repliedBy),
    createdAtMs: parseTime(raw.createdAt),
    updatedAtMs: parseTime(raw.updatedAt),
    repliedAtMs: parseTime(raw.repliedAt),
    sentiment: asText(raw.sentiment)?.toUpperCase() ?? null,
  };
}

/** Normalise a whole collection snapshot. */
export function normalizeFeedbackList(rows: (FeedbackDoc & { id: string })[], parseTime: TimestampParser): FeedbackRecord[] {
  return rows.map((row) => normalizeFeedback(row, parseTime)).sort(sortFeedbackByNewest);
}

/* ------------------------------------------------------------------ *
 * Filters
 * ------------------------------------------------------------------ */

export const matchesFeedbackFilter = (feedback: FeedbackRecord, filter: FeedbackFilter): boolean =>
  filter === "ALL" || feedback.status === STATUS_BY_FILTER[filter];

/** Newest first — documents without a readable date sink to the bottom. */
export const sortFeedbackByNewest = (a: FeedbackRecord, b: FeedbackRecord): number =>
  (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0);

/* ------------------------------------------------------------------ *
 * Rating statistics — the ONLY place averages are computed
 * ------------------------------------------------------------------ */

/**
 * Aggregate feedback ratings.
 *
 *   • only documents with a valid 1–5 rating participate
 *   • `rating: null` (text-only feedback) never affects the average
 *   • with zero valid ratings the average is null → the UI shows "—"
 *   • NaN / Infinity can never be produced: every input is guarded and the
 *     average is only divided by a count that is known to be > 0
 *
 * Examples:
 *   5            → 5.0   (1 rated)
 *   5, 4         → 4.5   (2 rated)
 *   5, 4, null   → 4.5   (2 rated, text-only excluded)
 *   5, 5, 4      → 4.67  (3 rated)
 *   none         → "—"   (0 rated)
 */
export function computeRatingSummary(records: FeedbackRecord[]): RatingSummary {
  const counts: Record<ValidRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;

  for (const record of records) {
    total += 1;
    const rating = normalizeRating(record?.rating);
    const bucket = ratingBucket(rating);
    if (rating === null || bucket === null) continue;
    sum += rating;
    counts[bucket] += 1;
  }

  const totalRated = counts[1] + counts[2] + counts[3] + counts[4] + counts[5];
  const average = totalRated > 0 && Number.isFinite(sum) ? sum / totalRated : null;

  return {
    total,
    totalRated,
    totalTextOnly: Math.max(0, total - totalRated),
    average,
    averageText: formatAverage(average),
    counts,
  };
}

/**
 * Display form of an average: "—" for nothing/NaN/Infinity, otherwise 1–2
 * decimals with a stable format ("5.0", "4.5", "4.67").
 */
export function formatAverage(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return NO_VALUE;
  const bounded = Math.min(5, Math.max(0, value));
  return (Math.round(bounded * 100) / 100).toFixed(2).replace(/0$/, "");
}

/** Integer count rendering that can never show NaN/null/undefined. */
export function formatCount(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.max(0, Math.trunc(value))) : "0";
}
