/** Pure helpers — safe to call from both server and client components. */
export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

export const inr = (value: number) => `₹${value.toLocaleString("en-IN")}`;

export const shortDate = (value: string | number | Date | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const shortTime = (value: string | number | Date | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";
