"use client";

import { use, useMemo, useState } from "react";
import { MessageSquare, Reply } from "lucide-react";
import { ClientPage, opToast, type ClientCtx } from "@/components/admin-page";
import { FeedbackReplyEditor } from "@/components/feedback-reply";
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SkeletonRows, Stars, shortTime } from "@/components/ui";
import { feedbackService } from "@/lib/firebase/services";
import { FEEDBACK_FILTERS, matchesFeedbackFilter, type FeedbackFilter, type FeedbackRecord } from "@/lib/feedback";
import { useFeedbackFeed } from "@/lib/use-feedback";
import { runOp } from "@/lib/use-load";

export default function FeedbackPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <Feedback ctx={ctx} />}</ClientPage>;
}

const STATUS_TONE: Record<FeedbackRecord["status"], "gold" | "green" | "neutral"> = {
  new: "gold",
  reviewed: "green",
  archived: "neutral",
};

function Feedback({ ctx }: { ctx: ClientCtx }) {
  const { client, actor, settings, storeId } = ctx;
  const [filter, setFilter] = useState<FeedbackFilter>("ALL");
  const [openReply, setOpenReply] = useState<string | null>(null);

  // Canonical scope: the store resolved from the authenticated admin record
  // (admins/{uid}.clientId). The route's clientId is only used for a
  // SUPER_ADMIN, who legitimately operates on any store — and only after
  // ClientPage/useAdminGuard has accepted the route.
  const scopeId = storeId ?? client.id;

  // clients/{clientId}/feedback — the ONLY feedback source (live listener).
  const feed = useFeedbackFeed(scopeId);
  const rows = useMemo(() => feed.rows.filter((f) => matchesFeedbackFilter(f, filter)), [feed.rows, filter]);

  return (
    <>
      <PageHeader
        eyebrow={`${feed.rows.length} notes · identity is never recorded`}
        title="Feedback"
        subtitle="Guests leave these anonymously from the customer app. There is no identity to reveal."
        actions={
          <div className="flex gap-1.5">
            {FEEDBACK_FILTERS.map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  filter === value ? "bg-espresso text-cream" : "bg-paper text-mocha hover:bg-linen"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        }
      />

      {feed.loading && feed.rows.length === 0 ? (
        <SkeletonRows rows={3} />
      ) : feed.error && feed.rows.length === 0 ? (
        <ErrorState message={feed.error} action={<Button onClick={feed.reload}>Retry</Button>} />
      ) : feed.rows.length === 0 ? (
        <EmptyState
          title="No feedback yet"
          body="Anonymous notes from guests will appear here without any identifying information."
          icon={<MessageSquare className="size-5" />}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={`Nothing ${filter.toLowerCase() === "all" ? "" : `${filter.toLowerCase()} `}in this filter`}
          body="Feedback with another status is still available — switch the filter above."
          icon={<MessageSquare className="size-5" />}
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((f) => (
            <Card key={f.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                {f.hasRating ? (
                  <Stars value10={(f.rating ?? 0) * 10} size={14} />
                ) : (
                  <Badge tone="neutral">No rating</Badge>
                )}
                <Badge tone={STATUS_TONE[f.status]}>{f.status.toUpperCase()}</Badge>
                {f.sentiment ? (
                  <Badge tone={f.sentiment === "POSITIVE" ? "green" : f.sentiment === "NEGATIVE" ? "red" : "neutral"}>
                    {f.sentiment}
                  </Badge>
                ) : null}
                <span className="text-[11px] text-mocha">{shortTime(f.createdAtMs)}</span>
              </div>

              <p className="mt-2 text-[12.5px] text-espresso">{f.message || "No message"}</p>

              {f.adminReply ? (
                <div className="mt-2 rounded-xl bg-linen/60 px-3 py-2">
                  <p className="label-caps">
                    Reply · {f.repliedAtMs ? shortTime(f.repliedAtMs) : "—"}
                    {f.repliedBy ? ` · ${f.repliedBy}` : ""}
                  </p>
                  <p className="mt-1 text-[12.5px] text-espresso">{f.adminReply}</p>
                </div>
              ) : f.aiReply ? (
                <div className="mt-2 rounded-xl border border-dashed border-mocha/30 px-3 py-2">
                  <p className="label-caps">AI draft · awaiting approval</p>
                  <p className="mt-1 text-[12.5px] text-mocha">{f.aiReply}</p>
                </div>
              ) : null}

              {openReply === f.id ? (
                <FeedbackReplyEditor
                  key={`${f.id}:${f.adminReply ?? ""}:${f.aiReply ?? ""}`}
                  actor={actor}
                  clientId={scopeId}
                  settings={settings}
                  feedback={f}
                  onDone={feed.reload}
                />
              ) : null}

              <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() => setOpenReply((current) => (current === f.id ? null : f.id))}
                >
                  <Reply className="size-3.5" />
                  {f.adminReply ? "Edit reply" : "Reply"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={f.status === "reviewed"}
                  onClick={() =>
                    runOp(() => feedbackService.markReviewed(actor, scopeId, f.id), opToast(feed.reload), "Marked as reviewed")
                  }
                >
                  Mark reviewed
                </Button>
                <Button
                  size="sm"
                  variant="quiet"
                  disabled={f.status === "archived"}
                  onClick={() => runOp(() => feedbackService.archive(actor, scopeId, f.id), opToast(feed.reload), "Archived")}
                >
                  Archive
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
