import { limit as qLimit, onSnapshot, query, serverTimestamp, type Unsubscribe } from "firebase/firestore";
import { SUB, fireErrorMessage, listSub, patchSub, subRef } from "@/lib/firebase/firestore";
import { toMillis } from "@/lib/firebase/timestamps";
import { normalizeFeedbackList, type FeedbackRecord } from "@/lib/feedback";
import type { Actor, FeedbackDoc, ReviewDoc } from "@/lib/firebase/types";
import { activityService } from "./activityService";

const MAX_FEEDBACK = 500;
const MAX_REPLY = 2000;

type RawFeedback = FeedbackDoc & { id: string };

const byDesc = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt;

/** Require non-empty, bounded reply text before it reaches Firestore. */
function replyText(value: string): string {
  const text = (value ?? "").trim();
  if (!text) throw new Error("Write a reply before saving.");
  if (text.length > MAX_REPLY) throw new Error(`Replies are limited to ${MAX_REPLY} characters.`);
  return text;
}

/** clients/{clientId}/reviews — legacy Google/AI review copies (counts only). */
export const reviewService = {
  async list(clientId: string): Promise<ReviewDoc[]> {
    const rows = await listSub<ReviewDoc>(clientId, SUB.reviews, [], 200);
    return rows.sort(byDesc);
  },

  async setStatus(actor: Actor, clientId: string, reviewId: string, status: ReviewDoc["status"]) {
    await patchSub(clientId, SUB.reviews, reviewId, { status });
    await activityService.log(actor, clientId, "REVIEW_STATUS_CHANGED", `${reviewId} → ${status}`);
  },
};

/**
 * clients/{clientId}/feedback — THE customer ratings source for the Admin App.
 *
 * Anonymous by design: the schema holds no identity fields for the guest.
 * Every write is scoped to the authenticated admin's own store:
 *   • the page resolves clientId from the route, which ClientPage validates
 *     against admins/{uid}.clientId (useAdminGuard → allowedClientIds)
 *   • Firestore Security Rules independently enforce canManage(clientId)
 *     for every read and every moderation/reply write
 *
 * Documents are normalised at read time (rating numeric strings, "NEW"
 * statuses, serialized timestamps, missing reply fields) — nothing is
 * rewritten and no legacy document is deleted.
 */
export const feedbackService = {
  /** Read every feedback document of ONE store. */
  async list(clientId: string): Promise<FeedbackRecord[]> {
    const rows = await listSub<RawFeedback>(clientId, SUB.feedback, [], MAX_FEEDBACK);
    return normalizeFeedbackList(rows, toMillis);
  },

  /**
   * Real-time listener on exactly clients/{clientId}/feedback — new customer
   * feedback appears without a manual refresh. The query is scoped by PATH
   * (never "all clients filtered in the browser").
   */
  watch(
    clientId: string,
    onData: (rows: FeedbackRecord[]) => void,
    onError?: (message: string) => void,
  ): Unsubscribe {
    return onSnapshot(
      query(subRef(clientId, SUB.feedback), qLimit(MAX_FEEDBACK)),
      (snap) => onData(normalizeFeedbackList(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RawFeedback), toMillis)),
      (err) => onError?.(fireErrorMessage(err)),
    );
  },

  /** status: "new" → "reviewed". Touches NOTHING else (message/rating/createdAt/clientId stay). */
  async markReviewed(actor: Actor, clientId: string, feedbackId: string) {
    await patchSub(clientId, SUB.feedback, feedbackId, {
      status: "reviewed",
      updatedAt: serverTimestamp(),
    });
    await activityService.log(actor, clientId, "FEEDBACK_REVIEWED", feedbackId);
  },

  /** status → "archived". The document is never deleted and stays in the ARCHIVED filter. */
  async archive(actor: Actor, clientId: string, feedbackId: string) {
    await patchSub(clientId, SUB.feedback, feedbackId, {
      status: "archived",
      updatedAt: serverTimestamp(),
    });
    await activityService.log(actor, clientId, "FEEDBACK_ARCHIVED", feedbackId);
  },

  /**
   * The admin-APPROVED reply — the only text that becomes `adminReply`.
   * The original customer message and rating are never overwritten.
   */
  async saveReply(actor: Actor, clientId: string, feedbackId: string, reply: string) {
    const text = replyText(reply);
    await patchSub(clientId, SUB.feedback, feedbackId, {
      adminReply: text,
      repliedAt: serverTimestamp(),
      repliedBy: actor.uid,
      updatedAt: serverTimestamp(),
    });
    await activityService.log(actor, clientId, "FEEDBACK_REPLIED", feedbackId, {}, { after: { adminReply: text } });
    return text;
  },

  /**
   * The AI-generated DRAFT — stored in `aiReply` only. It is never promoted to
   * `adminReply` automatically; the admin reviews/edits it and calls saveReply.
   */
  async saveAiDraft(actor: Actor, clientId: string, feedbackId: string, draft: string) {
    const text = replyText(draft);
    await patchSub(clientId, SUB.feedback, feedbackId, {
      aiReply: text,
      updatedAt: serverTimestamp(),
    });
    await activityService.log(actor, clientId, "AI_FEEDBACK_DRAFT_GENERATED", feedbackId);
    return text;
  },
};
