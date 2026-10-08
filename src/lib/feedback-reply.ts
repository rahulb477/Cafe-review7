/**
 * AI reply DRAFTING for customer feedback — the Admin App's AI integration.
 *
 * Reuses the existing (free) AI review-writing integration: the draft is
 * composed locally, so no paid provider/API key is required and the manual
 * reply path keeps working when AI is switched off or unavailable.
 *
 * What it writes (and does NOT write) is enforced by the service layer:
 *   • drafts are stored in `feedback.aiReply`
 *   • only an admin-approved reply becomes `feedback.adminReply`
 *   • the customer message and the customer rating are never touched
 *
 * Pure module (types only) so the copy can be unit-tested with `node --test`.
 */
import type { FeedbackRecord } from "./feedback";

const MAX_QUOTE = 120;

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** 1–5 or null; guarded so a malformed value can never reach the copy. */
function safeRating(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5 ? value : null;
}

/** Mention the guest's own subject line without echoing a hostile wall of text. */
function topicOf(message: string): string {
  const firstSentence = message.split(/[.!?\n]/)[0]?.trim() ?? "";
  if (!firstSentence) return "";
  if (firstSentence.length <= MAX_QUOTE) return firstSentence.replace(/\s+/g, " ");
  const clipped = firstSentence.slice(0, MAX_QUOTE);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 40 ? clipped.slice(0, lastSpace) : clipped).replace(/\s+/g, " ")}…`;
}

/**
 * Draft a reply for one feedback document.
 * Deterministic, provider-free and safe to run offline.
 */
export function draftFeedbackReplyText(feedback: Pick<FeedbackRecord, "rating" | "message">): string {
  const rating = safeRating(feedback?.rating ?? null);
  const message = asText(feedback?.message);
  const topic = topicOf(message);
  const reference = topic ? ` Your note about “${topic}” has been shared with the team.` : "";

  if (rating === null) {
    return (
      `Thank you for taking the time to write to us — feedback like this is how we get better.` +
      `${reference} If there is anything we can do on your next visit, please tell a member of the team.`
    );
  }

  if (rating >= 4) {
    return (
      `Thank you for the ${rating}-star rating — it means a lot to the whole team.` +
      `${reference} We look forward to welcoming you back soon.`
    );
  }

  if (rating === 3) {
    return (
      `Thank you for the honest 3-star rating, and for giving us something concrete to work on.` +
      `${reference} We would love the chance to earn the extra stars on your next visit.`
    );
  }

  return (
    `Thank you for telling us — we are sorry this visit fell short of a ${rating}-star experience.` +
    `${reference} Please ask for the manager on your next visit so we can put it right.`
  );
}
