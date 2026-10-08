"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Textarea } from "@/components/ui";
import { emitToast } from "@/components/interactive";
import { fireErrorMessage } from "@/lib/firebase/firestore";
import { aiService, feedbackService } from "@/lib/firebase/services";
import { shortTime } from "@/lib/firebase/timestamps";
import type { FeedbackRecord } from "@/lib/feedback";
import type { Actor, ClientSettingsDoc } from "@/lib/firebase/types";

/**
 * Reply editor shared by the Feedback page and the Reviews/Ratings page.
 *
 * Flow (requirement: AI must never replace the customer's feedback):
 *   Generate AI reply → draft stored in `feedback.aiReply`
 *                     → admin reviews/edits the text below
 *                     → Save reply → final text stored in `feedback.adminReply`
 *
 * The textarea always works, so replies can be written and approved even when
 * AI is switched off or the AI call fails. Nothing here can touch the customer
 * message, the rating or the client scope.
 */
export function FeedbackReplyEditor({
  actor,
  clientId,
  settings,
  feedback,
  onDone,
}: {
  actor: Actor;
  /** The admin's canonical store id (admins/{uid}.clientId) — never a client claim. */
  clientId: string;
  settings: ClientSettingsDoc;
  feedback: FeedbackRecord;
  onDone?: () => void;
}) {
  // Seeded from the document; the parent re-mounts this editor with a `key`
  // that includes adminReply/aiReply, so a saved reply or a fresh AI draft is
  // shown without writing state inside an effect.
  const [draft, setDraft] = useState(feedback.adminReply ?? feedback.aiReply ?? "");
  const [busy, setBusy] = useState<"ai" | "save" | null>(null);

  const generate = () => {
    setBusy("ai");
    aiService
      .generateFeedbackReply(actor, clientId, feedback, {
        aiEnabled: settings.aiEnabled,
        aiMonthlyLimit: settings.aiMonthlyLimit,
        aiPrice: settings.aiPrice,
      })
      .then((text) => {
        setDraft(text);
        emitToast("success", "AI draft ready — review it, then save the final reply");
        onDone?.();
      })
      .catch((err) => emitToast("error", fireErrorMessage(err)))
      .finally(() => setBusy(null));
  };

  const save = () => {
    const text = draft.trim();
    if (!text) {
      emitToast("error", "Write a reply before saving.");
      return;
    }
    setBusy("save");
    feedbackService
      .saveReply(actor, clientId, feedback.id, text)
      .then(() => {
        emitToast("success", "Reply saved as the final reply");
        onDone?.();
      })
      .catch((err) => emitToast("error", fireErrorMessage(err)))
      .finally(() => setBusy(null));
  };

  const hint = feedback.adminReply
    ? `Final reply saved${feedback.repliedAtMs ? ` ${shortTime(feedback.repliedAtMs)}` : ""}${feedback.repliedBy ? ` by ${feedback.repliedBy}` : ""} — saving again replaces it.`
    : feedback.aiReply
      ? "AI draft stored in aiReply — edit it, then save it as the final reply."
      : settings.aiEnabled
        ? "Generate a draft with AI, or write the reply yourself."
        : "AI writing is switched off for this store — write the reply manually.";

  return (
    <div className="mt-3 space-y-2 border-t border-linen pt-3">
      <Textarea
        value={draft}
        rows={3}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Write the reply this guest will see…"
        aria-label="Reply to this feedback"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-mocha">{hint}</p>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button
            size="sm"
            variant="quiet"
            disabled={busy !== null || !settings.aiEnabled}
            title={settings.aiEnabled ? "Generate an AI draft (stored as aiReply)" : "AI writing is switched off for this store."}
            onClick={generate}
          >
            <Sparkles className="size-3.5" />
            {busy === "ai" ? "Drafting…" : feedback.aiReply ? "Regenerate draft" : "Generate AI reply"}
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null || !draft.trim()} onClick={save}>
            {busy === "save" ? "Saving…" : "Save reply"}
          </Button>
        </div>
      </div>
    </div>
  );
}
