import { getDatabase, push, ref } from "firebase/database";
import { doc, increment, setDoc, updateDoc } from "firebase/firestore";
import { getFirebaseApp } from "./firebaseClient";
import { COL, SUB, create, createSub, db, getById, getSub, listByClient, listSub, patch, patchSub } from "@/lib/firebase/firestore";
import type { Actor, AiUsageDoc, MetricDoc, ReviewDoc } from "@/lib/firebase/types";
import { activityService } from "./activityService";

const dayKey = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
};
const monthKey = () => new Date().toISOString().slice(0, 7);

const EVENT_NAMES: Record<string, string> = {
  qrScans: "QR_SCAN",
  menuViews: "MENU_VIEW",
  googleReviews: "GOOGLE_REVIEW_CLICK",
  socialClicks: "SOCIAL_CLICK",
  wifiConnections: "WIFI_VIEW",
  feedback: "FEEDBACK_SUBMITTED",
  stamps: "STAMP_ADDED",
  rewards: "REWARD_REDEEMED",
};

/**
 * metricsService — pre-aggregated daily counters in metricsDaily/{clientId_day}
 * so dashboards never scan raw event collections. Raw events additionally
 * stream into the Realtime Database (events/{clientId}) with
 * { clientId, eventType, timestamp } for downstream processing.
 */
export const metricsService = {
  async series(clientId: string, days: number): Promise<MetricDoc[]> {
    const since = dayKey(days - 1);
    const rows = await listByClient<MetricDoc>(COL.metricsDaily, clientId, 400);
    // Blind-merged docs may lack some counters — normalize to 0 for readers.
    return rows
      .filter((r) => r.day >= since)
      .map((r) => ({
        ...r,
        qrScans: r.qrScans ?? 0,
        menuViews: r.menuViews ?? 0,
        googleReviews: r.googleReviews ?? 0,
        socialClicks: r.socialClicks ?? 0,
        wifiConnections: r.wifiConnections ?? 0,
        feedback: r.feedback ?? 0,
        stamps: r.stamps ?? 0,
        rewards: r.rewards ?? 0,
      }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));
  },

  async record(clientId: string, field: keyof Omit<MetricDoc, "id" | "clientId" | "day">, delta = 1) {
    const id = `${clientId}_${dayKey()}`;
    // Blind upsert — NO read. The customer app records metrics while
    // unauthenticated; a read-before-write here hits the admin-only read
    // rule, throws permission-denied, and counters silently never move.
    await setDoc(
      doc(db(), COL.metricsDaily, id),
      { clientId, day: dayKey(), [field]: increment(delta) },
      { merge: true },
    );
    // RTDB raw event — best effort, never blocks the user action.
    try {
      await push(ref(getDatabase(getFirebaseApp()), `events/${clientId}`), {
        clientId,
        eventType: EVENT_NAMES[field] ?? field,
        timestamp: Date.now(),
      });
    } catch {
      /* ignore */
    }
  },
};

/**
 * aiService — monthly usage docs at clients/{clientId}/aiUsage/{YYYY-MM}.
 * AI provider API keys are NEVER stored in Firestore; any real model call
 * lives behind a trusted backend with environment secrets.
 */
export const aiService = {
  async status(clientId: string, settings: { aiEnabled: boolean; aiMonthlyLimit: number; aiPrice: number }) {
    const month = monthKey();
    const [current, history] = await Promise.all([
      getSub<AiUsageDoc>(clientId, SUB.aiUsage, month),
      listSub<AiUsageDoc>(clientId, SUB.aiUsage, [], 24),
    ]);
    const limit = settings.aiMonthlyLimit;
    const used = current?.requests ?? 0;
    return {
      enabled: settings.aiEnabled,
      limit,
      used,
      remaining: Math.max(0, limit - used),
      success: current?.success ?? 0,
      failed: current?.failed ?? 0,
      price: settings.aiPrice,
      month,
      history: history.sort((a, b) => (a.month > b.month ? -1 : 1)).slice(0, 6),
    };
  },

  async meterRequest(clientId: string, ok: boolean) {
    const month = monthKey();
    const existing = await getSub<AiUsageDoc>(clientId, SUB.aiUsage, month);
    if (existing) {
      await patchSub(clientId, SUB.aiUsage, month, {
        requests: increment(1),
        success: increment(ok ? 1 : 0),
        failed: increment(ok ? 0 : 1),
      });
    } else {
      await createSub(clientId, SUB.aiUsage, month, {
        month,
        requests: 1,
        success: ok ? 1 : 0,
        failed: ok ? 0 : 1,
      });
    }
  },

  /** Toggles clients/{id}.aiReview.{enabled,monthlyLimit}. Keys never touch Firestore. */
  async configure(actor: Actor, clientId: string, input: { aiEnabled: boolean; aiMonthlyLimit: number }) {
    const limit = Math.max(0, Number(input.aiMonthlyLimit) || 0);
    await patch(COL.clients, clientId, {
      "aiReview.enabled": input.aiEnabled,
      "aiReview.monthlyLimit": limit,
      updatedAt: Date.now(),
    });
    await activityService.log(
      actor,
      clientId,
      "AI_SETTINGS_UPDATED",
      `${input.aiEnabled ? "enabled" : "disabled"} · ${limit}/mo`,
      {},
      { after: { aiEnabled: input.aiEnabled, aiMonthlyLimit: limit } },
    );
  },

  async generateReply(
    actor: Actor,
    clientId: string,
    review: ReviewDoc,
    settings: { aiEnabled: boolean; aiMonthlyLimit: number; aiPrice: number },
  ) {
    const status = await this.status(clientId, settings);
    if (!status.enabled) throw new Error("AI review writing is switched off for this business.");
    if (status.remaining <= 0) throw new Error("Monthly AI limit reached. Increase the limit to continue.");
    await this.meterRequest(clientId, true);
    const content = `Thank you for the thoughtful note${review.items ? ` about the ${review.items}` : ""}. Our team works hard on every plate and cup, and we're delighted it showed. See you again soon.`;
    await patchSub(clientId, SUB.reviews, review.id, { content, source: "AI" });
    await activityService.log(actor, clientId, "AI_REVIEW_GENERATED", review.id);
    return content;
  },
};


