/**
 * THE ONE safe Firestore timestamp parser for the Admin App.
 *
 * Every screen that renders a date goes through `toMillis` → `shortDate` /
 * `shortTime` (re-exported from `@/lib/format` and `@/components/ui`), so a
 * missing, malformed, still-serialized or half-written timestamp renders the
 * em dash "—" instead of the string "Invalid Date".
 *
 * Accepted shapes (read-side tolerance for legacy documents):
 *   • Firestore Timestamp      → .toMillis() / .toDate() / { seconds, nanoseconds }
 *   • Serialized Timestamp     → { _seconds, _nanoseconds } (REST/JSON export shape)
 *   • JS Date
 *   • ISO / RFC strings        → "2026-10-08T09:30:00Z", "8 Oct 2026 09:30"
 *   • Numeric strings          → "1735689600000" or "1735689600"
 *   • numbers (epoch)          → milliseconds, seconds detected by magnitude
 *   • null / undefined / "" / NaN / Infinity / booleans / arrays → null
 *
 * READ-TIME ONLY: nothing here writes to Firestore. `createdAt` / `updatedAt`
 * stay Firestore timestamps in storage (writers use `serverTimestamp()`) —
 * this module never converts them into strings, it only formats for display.
 */

/** Rendered for every missing/invalid value. Never "Invalid Date", NaN or null. */
export const DASH = "—";

/**
 * Numbers below this magnitude are read as epoch SECONDS, above as epoch
 * MILLISECONDS. 1e11 ms ≈ 1973 · 1e11 s ≈ year 5138, so real records written
 * with `Date.now()` (≈1.7e12) are never misread.
 */
const SECONDS_CEILING = 1e11;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Valid, positive millisecond instant — otherwise null. */
const asMillis = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
};

/** Epoch value in seconds-or-milliseconds → normalized milliseconds (or null). */
const fromEpoch = (value: number): number | null => {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.abs(value) < SECONDS_CEILING ? asMillis(value * 1000) : asMillis(value);
};

const fromDate = (value: Date): number | null => asMillis(value.getTime());

/**
 * The single parser. Returns epoch milliseconds, or `null` when the value is
 * absent/unparseable — callers render `DASH` for null.
 */
export function toMillis(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) return fromDate(value);

  if (typeof value === "number") return fromEpoch(value);

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;
    // Numeric epoch string ("1735689600000" / "1735689600").
    if (/^-?\d+(\.\d+)?$/.test(text)) return fromEpoch(Number(text));
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? asMillis(parsed) : null;
  }

  if (!isObject(value)) return null; // booleans, symbols, functions, arrays handled below

  if (Array.isArray(value)) return null;

  // Firestore Timestamp (class instance or duck-typed).
  const toMillisFn = (value as { toMillis?: unknown }).toMillis;
  if (typeof toMillisFn === "function") {
    try {
      const ms = asMillis((toMillisFn as () => unknown).call(value));
      if (ms !== null) return ms;
    } catch {
      /* fall through to the other representations */
    }
  }

  const toDateFn = (value as { toDate?: unknown }).toDate;
  if (typeof toDateFn === "function") {
    try {
      const date = (toDateFn as () => unknown).call(value);
      if (date instanceof Date) {
        const ms = fromDate(date);
        if (ms !== null) return ms;
      }
    } catch {
      /* fall through */
    }
  }

  // { seconds, nanoseconds } and the serialized { _seconds, _nanoseconds }.
  const secondsRaw = (value as { seconds?: unknown }).seconds ?? (value as { _seconds?: unknown })._seconds;
  if (secondsRaw !== undefined && secondsRaw !== null) {
    const seconds = typeof secondsRaw === "number" ? secondsRaw : Number(String(secondsRaw));
    if (Number.isFinite(seconds) && seconds > 0) {
      const nanosRaw = (value as { nanoseconds?: unknown }).nanoseconds ?? (value as { _nanoseconds?: unknown })._nanoseconds;
      const nanos = nanosRaw === undefined || nanosRaw === null ? 0 : Number(String(nanosRaw));
      const nanosMs = Number.isFinite(nanos) ? Math.floor(Math.abs(nanos) / 1e6) : 0;
      return asMillis(seconds * 1000 + nanosMs);
    }
  }

  return null;
}

/** Parse to a `Date`, or null. */
export function toDate(value: unknown): Date | null {
  const ms = toMillis(value);
  return ms === null ? null : new Date(ms);
}

/** True only when the value resolves to a real instant. */
export const hasTimestamp = (value: unknown): boolean => toMillis(value) !== null;

const safeFormat = (value: unknown, format: (date: Date) => string): string => {
  const date = toDate(value);
  if (!date) return DASH;
  try {
    return format(date);
  } catch {
    return DASH;
  }
};

/** "8 Oct 2026" — or "—". */
export const shortDate = (value: unknown): string =>
  safeFormat(value, (date) => date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }));

/** "8 Oct, 02:30 pm" — or "—". */
export const shortTime = (value: unknown): string =>
  safeFormat(value, (date) =>
    date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
  );
