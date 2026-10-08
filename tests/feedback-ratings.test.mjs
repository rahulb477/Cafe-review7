/**
 * Feedback → Reviews/Ratings unit tests (no emulator, no Firebase, no network).
 *
 *   npm run test:feedback      (node --test, TypeScript stripped natively)
 *
 * Covers the exact data cases from the specification:
 *   A. rating 5                     → average 5.0, 5★ = 1, total rated 1
 *   B. rating 4                     → average 4.5, 5★ = 1, 4★ = 1, total rated 2
 *   C. rating null                  → feedback appears, average stays 4.5, total rated 2
 *   D. rating 1                     → 1★ = 1
 *   E. no valid ratings             → average "—", total rated 0, all star counts 0
 * plus legacy-document normalisation, timestamp parsing and "no NaN ever" guards.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { Timestamp } from "firebase/firestore";
import { DASH, shortDate, shortTime, toMillis } from "../src/lib/firebase/timestamps.ts";
import {
  computeRatingSummary,
  formatAverage,
  formatCount,
  matchesFeedbackFilter,
  normalizeFeedback,
  normalizeRating,
  normalizeStatus,
} from "../src/lib/feedback.ts";
import { draftFeedbackReplyText } from "../src/lib/feedback-reply.ts";

let seq = 0;
/** Build a normalised feedback record the way feedbackService.list() does. */
const record = (rating, message = "hello", over = {}) =>
  normalizeFeedback(
    {
      id: `fbk_${++seq}`,
      clientId: "cli_a",
      rating,
      message,
      source: "customer_feedback",
      status: "new",
      adminReply: null,
      aiReply: null,
      repliedAt: null,
      repliedBy: null,
      createdAt: Timestamp.fromMillis(Date.now()),
      updatedAt: Timestamp.fromMillis(Date.now()),
      ...over,
    },
    toMillis,
  );

const FORBIDDEN = /NaN|Invalid Date|Infinity|undefined|null/;

test("Test Case A — one 5-star rating", () => {
  const summary = computeRatingSummary([record(5, "Excellent")]);
  assert.equal(summary.average, 5);
  assert.equal(summary.averageText, "5.0");
  assert.equal(summary.totalRated, 1);
  assert.equal(summary.counts[5], 1);
  assert.equal(summary.totalTextOnly, 0);
});

test("Test Case B — ratings 5 and 4", () => {
  const summary = computeRatingSummary([record(5, "Excellent"), record(4, "Good")]);
  assert.equal(summary.average, 4.5);
  assert.equal(summary.averageText, "4.5");
  assert.equal(summary.totalRated, 2);
  assert.equal(summary.counts[5], 1);
  assert.equal(summary.counts[4], 1);
  assert.equal(summary.counts[3], 0);
});

test("Test Case C — text-only feedback (rating null) never affects the average", () => {
  const summary = computeRatingSummary([record(5, "Excellent"), record(4, "Good"), record(null, "Staff was helpful")]);
  assert.equal(summary.average, 4.5);
  assert.equal(summary.averageText, "4.5");
  assert.equal(summary.totalRated, 2);
  assert.equal(summary.totalTextOnly, 1);
  assert.equal(summary.total, 3);
});

test("Test Case D — a single 1-star rating lands in the 1★ bucket", () => {
  const summary = computeRatingSummary([record(1, "Bad visit")]);
  assert.equal(summary.counts[1], 1);
  assert.equal(summary.totalRated, 1);
  assert.equal(summary.averageText, "1.0");
});

test("Test Case E — no valid ratings: dash, zeros, never NaN", () => {
  for (const input of [[], [record(null, "text only")], [record(undefined)], [record("")], [record("not a number")]]) {
    const summary = computeRatingSummary(input);
    assert.equal(summary.average, null);
    assert.equal(summary.averageText, DASH);
    assert.equal(summary.totalRated, 0);
    assert.deepEqual(summary.counts, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    assert.equal(summary.averageText, "—");
  }
});

test("star distribution matches the specification example (5, 5, 4, 2, null)", () => {
  const summary = computeRatingSummary([record(5), record(5), record(4), record(2), record(null)]);
  assert.deepEqual(summary.counts, { 1: 0, 2: 1, 3: 0, 4: 1, 5: 2 });
  assert.equal(summary.totalRated, 4);
  assert.equal(summary.totalTextOnly, 1);
  assert.equal(summary.averageText, "4.0");
});

test("average rounding is stable at 1–2 decimals", () => {
  assert.equal(formatAverage(5), "5.0");
  assert.equal(formatAverage(4.5), "4.5");
  assert.equal(formatAverage(14 / 3), "4.67"); // 5, 5, 4
  assert.equal(computeRatingSummary([record(5), record(5), record(4)]).averageText, "4.67");
  assert.equal(formatAverage(4.666), "4.67");
  assert.equal(formatAverage(4.2), "4.2");
});

test("NaN / Infinity / null / undefined can never reach a rendered statistic", () => {
  for (const value of [NaN, Infinity, -Infinity, null, undefined, "5", {}, []]) {
    assert.equal(formatAverage(value), "—");
  }
  assert.equal(formatCount(NaN), "0");
  assert.equal(formatCount(Infinity), "0");
  assert.equal(formatCount(undefined), "0");

  const hostile = computeRatingSummary([
    record(NaN),
    record(Infinity),
    record("abc"),
    record({}),
    record([]),
    record(-1),
    record(0),
    record(6),
    record(5.000001e3),
    record("5"),
  ]);
  assert.equal(hostile.totalRated, 1);
  assert.equal(hostile.averageText, "5.0");
  assert.ok(!FORBIDDEN.test(hostile.averageText));
  assert.ok(!FORBIDDEN.test(JSON.stringify(hostile.counts)));
});

test("rating normalisation accepts numbers and numeric strings only inside 1–5", () => {
  assert.equal(normalizeRating(5), 5);
  assert.equal(normalizeRating("4"), 4);
  assert.equal(normalizeRating(" 3 "), 3);
  assert.equal(normalizeRating(4.5), 4.5);
  for (const invalid of [null, undefined, "", "  ", "abc", {}, [], true, false, NaN, Infinity, 0, -3, 6, 100]) {
    assert.equal(normalizeRating(invalid), null);
  }
});

test("legacy documents are normalised at read time", () => {
  // Pre-rating schema: sentiment + uppercase status + number timestamp.
  const legacy = normalizeFeedback(
    {
      id: "fbk_legacy",
      clientId: "cli_a",
      message: "The corner table wobbles.",
      sentiment: "negative",
      status: "NEW",
      createdAt: 1700000000000,
    },
    toMillis,
  );
  assert.equal(legacy.rating, null);
  assert.equal(legacy.hasRating, false);
  assert.equal(legacy.status, "new");
  assert.equal(legacy.rawStatus, "NEW");
  assert.equal(legacy.sentiment, "NEGATIVE");
  assert.equal(legacy.adminReply, null);
  assert.equal(legacy.aiReply, null);
  assert.equal(legacy.repliedAtMs, null);
  assert.equal(legacy.repliedBy, null);
  assert.equal(legacy.createdAtMs, 1700000000000);
  assert.equal(matchesFeedbackFilter(legacy, "NEW"), true);

  // Numeric-string rating + serialized { _seconds, _nanoseconds } timestamp.
  const semiLegacy = normalizeFeedback(
    {
      id: "fbk_legacy2",
      clientId: "cli_a",
      message: "Good",
      rating: "4",
      status: "REVIEWED",
      createdAt: { _seconds: 1700000000, _nanoseconds: 500000000 },
    },
    toMillis,
  );
  assert.equal(semiLegacy.rating, 4);
  assert.equal(semiLegacy.status, "reviewed");
  assert.equal(matchesFeedbackFilter(semiLegacy, "REVIEWED"), true);
  assert.equal(matchesFeedbackFilter(semiLegacy, "ARCHIVED"), false);
  assert.equal(semiLegacy.createdAtMs, 1700000000500);
});

test("status normalisation maps every legacy spelling", () => {
  assert.equal(normalizeStatus("new"), "new");
  assert.equal(normalizeStatus("NEW"), "new");
  assert.equal(normalizeStatus("Reviewed"), "reviewed");
  assert.equal(normalizeStatus("ARCHIVED"), "archived");
  assert.equal(normalizeStatus(undefined), "new");
  assert.equal(normalizeStatus(42), "new");
});

test("timestamp parser handles every documented shape and never yields an invalid date", () => {
  const ms = 1735689600000; // 2025-01-01T00:00:00Z
  assert.equal(toMillis(Timestamp.fromMillis(ms)), ms);
  assert.equal(toMillis({ seconds: 1735689600, nanoseconds: 0 }), ms);
  assert.equal(toMillis({ _seconds: 1735689600, _nanoseconds: 0 }), ms);
  assert.equal(toMillis({ toMillis: () => ms }), ms);
  assert.equal(toMillis(new Date(ms)), ms);
  assert.equal(toMillis("2025-01-01T00:00:00.000Z"), ms);
  assert.equal(toMillis("1735689600000"), ms);
  assert.equal(toMillis(1735689600000), ms);
  assert.equal(toMillis(1735689600), ms); // epoch seconds
  assert.equal(toMillis(Date.now()) > 0, true);

  for (const bad of [null, undefined, "", "   ", "not a date", "Invalid Date", NaN, Infinity, -1, 0, {}, [], true, false]) {
    assert.equal(toMillis(bad), null, `expected null for ${String(bad)}`);
  }

  assert.equal(shortDate(null), DASH);
  assert.equal(shortTime(undefined), DASH);
  assert.equal(shortDate("garbage"), "—");
  assert.equal(shortTime({ seconds: NaN }), "—");
  assert.equal(shortDate(ms).includes("Invalid Date"), false);
  assert.ok(!FORBIDDEN.test(shortTime("nonsense")));
});

test("AI drafts never replace the customer feedback and never come back empty", () => {
  for (const rating of [1, 2, 3, 4, 5, null]) {
    const draft = draftFeedbackReplyText({ rating, message: "All good but staff is very good 😁" });
    assert.equal(typeof draft, "string");
    assert.ok(draft.trim().length > 20);
    assert.ok(!FORBIDDEN.test(draft));
  }
  assert.ok(draftFeedbackReplyText({ rating: 5, message: "" }).includes("5-star"));
  assert.ok(draftFeedbackReplyText({ rating: null, message: "Staff was helpful" }).length > 0);
});
