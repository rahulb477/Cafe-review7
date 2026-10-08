"use client";

import { use, useMemo, useState } from "react";
import { Reply, Star } from "lucide-react";
import { ClientPage, opToast, type ClientCtx } from "@/components/admin-page";
import { FeedbackReplyEditor } from "@/components/feedback-reply";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  MeterBar,
  PageHeader,
  SkeletonRows,
  Stars,
  shortTime,
} from "@/components/ui";
import { feedbackService } from "@/lib/firebase/services";
import { VALID_RATINGS, computeRatingSummary, formatCount, type FeedbackRecord } from "@/lib/feedback";
import { useFeedbackFeed } from "@/lib/use-feedback";
import { runOp } from "@/lib/use-load";

export default function ReviewsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <Reviews ctx={ctx} />}</ClientPage>;
}

const STATUS_TONE: Record<FeedbackRecord["status"], "gold" | "green" | "neutral"> = {
  new: "gold",
  reviewed: "green",
  archived: "neutral",
};

function Reviews({ ctx }: { ctx: ClientCtx }) {
  const { client, actor, settings, storeId } = ctx;
  // Canonical scope: the admin's own store (admins/{uid}.clientId). A
  // SUPER_ADMIN (storeId === null) falls back to the guarded route clientId.
  const scopeId = storeId ?? client.id;
  const [rating, setRating] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [replyState, setReplyState] = useState("ALL");
  const [openReply, setOpenReply] = useState<string | null>(null);

  /**
   * Reviews/Ratings is an AGGREGATION OF THE FEEDBACK COLLECTION ONLY:
   * clients/{clientId}/feedback/*.rating. There is no separate reviews or
   * ratings source — Google/AI review copies, menu item ratings and AI replies
   * never participate in these numbers.
   */
  const feed = useFeedbackFeed(scopeId);
  const all = feed.rows;

  const summary = useMemo(() => computeRatingSummary(all), [all]);

  const rows = useMemo(
    () =>
      all.filter(
        (r) =>
          (rating === "ALL" || (rating === "NONE" ? !r.hasRating : r.rating === Number(rating))) &&
          (status === "ALL" || r.status === status) &&
          (replyState === "ALL" || (replyState === "REPLIED" ? Boolean(r.adminReply) : !r.adminReply)),
      ),
    [all, rating, status, replyState],
  );

  return (
    <>
      <PageHeader
        eyebrow={`${all.length} feedback notes`}
        title="Reviews"
        subtitle="Every rating below comes from anonymous customer feedback — text-only notes are listed without a star rating."
      />

      <Card className="mb-5 p-5">
        <div className="grid gap-6 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <p className="display-num text-[44px] leading-none text-espresso">{summary.averageText}</p>
            <p className="label-caps mt-1">Average of {formatCount(summary.totalRated)} rated reviews</p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              {[
                ["Total rated reviews", summary.totalRated],
                ["Text-only notes", summary.totalTextOnly],
                ["All feedback notes", summary.total],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-linen/60 px-2.5 py-2">
                  <dt className="label-caps">{label}</dt>
                  <dd className="display-num text-[20px] text-espresso">{formatCount(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="space-y-2">
            {VALID_RATINGS.map((star) => (
              <MeterBar
                key={star}
                label={`${star} ★`}
                value={summary.counts[star]}
                max={Math.max(1, summary.totalRated)}
                right={formatCount(summary.counts[star])}
              />
            ))}
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={rating} onChange={(e) => setRating(e.target.value)} className="rounded-xl border border-linen bg-paper px-3 py-2.5 text-[12px]">
          <option value="ALL">All ratings</option>
          {VALID_RATINGS.map((n) => (
            <option key={n} value={n}>
              {n} stars
            </option>
          ))}
          <option value="NONE">No rating (text only)</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-linen bg-paper px-3 py-2.5 text-[12px]">
          <option value="ALL">All statuses</option>
          <option value="new">New</option>
          <option value="reviewed">Reviewed</option>
          <option value="archived">Archived</option>
        </select>
        <select value={replyState} onChange={(e) => setReplyState(e.target.value)} className="rounded-xl border border-linen bg-paper px-3 py-2.5 text-[12px]">
          <option value="ALL">All replies</option>
          <option value="AWAITING">Awaiting reply</option>
          <option value="REPLIED">Replied</option>
        </select>
      </div>

      {feed.loading && all.length === 0 ? (
        <SkeletonRows rows={4} />
      ) : feed.error && all.length === 0 ? (
        <ErrorState message={feed.error} action={<Button onClick={feed.reload}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={all.length === 0 ? "No reviews yet" : "No feedback matches these filters"}
          body={
            all.length === 0
              ? "Star ratings guests leave in the customer app's feedback form will collect here."
              : "Clear a filter to see the rest of this store's feedback."
          }
          icon={<Star className="size-5" />}
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {r.hasRating ? (
                    <Stars value10={(r.rating ?? 0) * 10} />
                  ) : (
                    <Badge tone="neutral">No rating</Badge>
                  )}
                  <span className="text-[11px] text-mocha">{shortTime(r.createdAtMs)}</span>
                </div>
                <Badge tone={STATUS_TONE[r.status]}>{r.status.toUpperCase()}</Badge>
              </div>

              <p className="mt-2 text-[12.5px] text-espresso">{r.message || "No message"}</p>

              {r.adminReply ? (
                <div className="mt-2 rounded-xl bg-linen/60 px-3 py-2">
                  <p className="label-caps">
                    Reply · {r.repliedAtMs ? shortTime(r.repliedAtMs) : "—"}
                    {r.repliedBy ? ` · ${r.repliedBy}` : ""}
                  </p>
                  <p className="mt-1 text-[12.5px] text-espresso">{r.adminReply}</p>
                </div>
              ) : r.aiReply ? (
                <div className="mt-2 rounded-xl border border-dashed border-mocha/30 px-3 py-2">
                  <p className="label-caps">AI draft · awaiting approval</p>
                  <p className="mt-1 text-[12.5px] text-mocha">{r.aiReply}</p>
                </div>
              ) : null}

              {openReply === r.id ? (
                <FeedbackReplyEditor
                  key={`${r.id}:${r.adminReply ?? ""}:${r.aiReply ?? ""}`}
                  actor={actor}
                  clientId={scopeId}
                  settings={settings}
                  feedback={r}
                  onDone={feed.reload}
                />
              ) : null}

              <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                <Button size="sm" variant="quiet" onClick={() => setOpenReply((current) => (current === r.id ? null : r.id))}>
                  <Reply className="size-3.5" />
                  {r.adminReply ? "Edit reply" : "Reply"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={r.status === "reviewed"}
                  onClick={() =>
                    runOp(() => feedbackService.markReviewed(actor, scopeId, r.id), opToast(feed.reload), "Marked as reviewed")
                  }
                >
                  Mark reviewed
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
