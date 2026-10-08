export { DASH, hasTimestamp, toDate, toMillis } from "./firebase/timestamps";
import { shortDate, shortTime } from "./firebase/timestamps";

/** Pure helpers — safe to call from both server and client components. */
export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export const inr = (value: number) => `₹${value.toLocaleString("en-IN")}`;

/**
 * Date/time rendering.
 *
 * These are the SAME functions exported by `@/components/ui`, now backed by the
 * single safe parser in `@/lib/firebase/timestamps`. A Firestore Timestamp, a
 * serialized {seconds,nanoseconds}, an ISO string, a Date, an epoch number or a
 * malformed value all render correctly — malformed/missing values render "—",
 * never "Invalid Date".
 */
export { shortDate, shortTime };
