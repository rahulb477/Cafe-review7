"use client";

import { use, useMemo, useState } from "react";
import { MessageSquare } from "lucide-react";
import { ClientPage, opToast, type ClientCtx } from "@/components/admin-page";
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SkeletonRows, shortTime } from "@/components/ui";
import { feedbackService } from "@/lib/firebase/services";
import { runOp, useLoad } from "@/lib/use-load";

export default function FeedbackPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <Feedback ctx={ctx} />}</ClientPage>;
}

function Feedback({ ctx }: { ctx: ClientCtx }) {
  const { client, actor } = ctx;
  const [status, setStatus] = useState("ALL");
  const load = useLoad(() => feedbackService.list(client.id), [client.id]);
  const rows = useMemo(
    () => (load.data ?? []).filter((f) => status === "ALL" || f.status === status),
    [load.data, status],
  );

  return (
    <>
      <PageHeader
        eyebrow={`${load.data?.length ?? 0} notes · identity is never recorded`}
        title="Feedback"
        subtitle="Guests leave these anonymously from the customer app. There is no identity to reveal."
        actions={
          <div className="flex gap-1.5">
            {["ALL", "NEW", "REVIEWED", "ARCHIVED"].map((value) => (
              <button
                key={value}
                onClick={() => setStatus(value)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  status === value ? "bg-espresso text-cream" : "bg-paper text-mocha hover:bg-linen"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        }
      />

      {load.loading && !load.data ? (
        <SkeletonRows rows={3} />
      ) : load.error && !load.data ? (
        <ErrorState message={load.error} action={<Button onClick={load.reload}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No feedback yet"
          body="Anonymous notes from guests will appear here without any identifying information."
          icon={<MessageSquare className="size-5" />}
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((f) => (
            <Card key={f.id} className="p-4">
              <p className="text-[12.5px] text-espresso">{f.message}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={f.sentiment === "POSITIVE" ? "green" : f.sentiment === "NEGATIVE" ? "red" : "neutral"}>{f.sentiment}</Badge>
                <Badge tone={f.status === "NEW" ? "gold" : f.status === "REVIEWED" ? "green" : "neutral"}>{f.status}</Badge>
                <span className="text-[11px] text-mocha">{shortTime(f.createdAt)}</span>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={f.status === "REVIEWED"}
                  onClick={() => runOp(() => feedbackService.setStatus(actor, client.id, f.id, "REVIEWED"), opToast(load.reload), "Marked as reviewed")}
                >
                  Mark reviewed
                </Button>
                <Button
                  size="sm"
                  variant="quiet"
                  disabled={f.status === "ARCHIVED"}
                  onClick={() => runOp(() => feedbackService.setStatus(actor, client.id, f.id, "ARCHIVED"), opToast(load.reload), "Archived")}
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
