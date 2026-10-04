import { SUB, listSub, patchSub } from "@/lib/firebase/firestore";
import type { Actor, FeedbackDoc, ReviewDoc } from "@/lib/firebase/types";
import { activityService } from "./activityService";

const byDesc = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt;

/** clients/{clientId}/reviews — ratings, service/staff scores, generated copy. */
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

/** clients/{clientId}/feedback — anonymous by design; no identity fields exist. */
export const feedbackService = {
  async list(clientId: string): Promise<FeedbackDoc[]> {
    const rows = await listSub<FeedbackDoc>(clientId, SUB.feedback, [], 200);
    return rows.sort(byDesc);
  },

  async setStatus(actor: Actor, clientId: string, feedbackId: string, status: "REVIEWED" | "ARCHIVED") {
    await patchSub(clientId, SUB.feedback, feedbackId, { status });
    await activityService.log(actor, clientId, status === "REVIEWED" ? "FEEDBACK_REVIEWED" : "FEEDBACK_ARCHIVED", feedbackId);
  },
};
