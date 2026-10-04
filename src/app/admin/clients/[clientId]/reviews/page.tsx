"use client";

import { use, useMemo, useState } from "react";
import { Sparkles, Star } from "lucide-react";
import { ClientPage, opToast, type ClientCtx } from "@/components/admin-page";
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
import { aiService, reviewService } from "@/lib/firebase/services";
import type { ReviewDoc } from "@/lib/firebase/types";
import { runOp, useLoad } from "@/lib/use-load";

export default function ReviewsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <Reviews ctx={ctx} />}</ClientPage>;
}

function Reviews({ ctx }: { ctx: ClientCtx }) {
  const { client, actor, settings } = ctx;
  const [rating, setRating] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [source, setSource] = useState("ALL");
  const load = useLoad(() => reviewService.list(client.id), [client.id]);
  const all = useMemo(() => load.data ?? [], [load.data]);

  const rows = useMemo(
    () =>
      all.filter(
        (r) =>
          (rating === "ALL" || r.rating === Number(rating)) &&
          (status === "ALL" || r.status === status) &&
          (source === "ALL" || r.source === source),
      ),
    [all, rating, status, source],
  );

  const average = all.length ? (all.reduce((a, r) => a + r.rating, 0) / all.length).toFixed(1) : "—";
  const spread = [5, 4, 3, 2, 1].map((star) => ({ star, count: all.filter((r) => r.rating === star).length }));

  return (
    <>
      <PageHeader eyebrow={`${all.length} reviews`} title="Reviews" subtitle="Ratings collected at the counter and the replies drafted from them." />

      <Card className="mb-5 p-5">
        <div className="grid gap-6 sm:grid-cols-[220px_minmax(0,1fr)]">
          <div>
            <p className="display-num text-[44px] leading-none text-espresso">{average}</p>
            <p className="label-caps mt-1">Average of {all.length} reviews</p>
          </div>
          <div className="space-y-2">
            {spread.map((b) => (
              <MeterBar key={b.star} label={`${b.star} ★`} value={b.count} max={Math.max(1, all.length)} right={String(b.count)} />
            ))}
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={rating} onChange={(e) => setRating(e.target.value)} className="rounded-xl border border-linen bg-paper px-3 py-2.5 text-[12px]">
          <option value="ALL">All ratings</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} stars
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-linen bg-paper px-3 py-2.5 text-[12px]">
          <option value="ALL">All statuses</option>
          <option value="PUBLISHED">Published</option>
          <option value="PENDING">Pending</option>
          <option value="HIDDEN">Hidden</option>
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-xl border border-linen bg-paper px-3 py-2.5 text-[12px]">
          <option value="ALL">All sources</option>
          <option value="GOOGLE">Google</option>
          <option value="AI">AI written</option>
          <option value="DIRECT">Direct</option>
        </select>
      </div>

      {load.loading && !load.data ? (
        <SkeletonRows rows={4} />
      ) : load.error && !load.data ? (
        <ErrorState message={load.error} action={<Button onClick={load.reload}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No reviews yet"
          body="Ratings guests leave at the counter will collect here with the items they ordered."
          icon={<Star className="size-5" />}
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Stars value10={r.rating * 10} />
                  <span className="text-[11px] text-mocha">
                    {r.staffRating}★ staff · {r.serviceRating}★ service · {shortTime(r.createdAt)}
                  </span>
                </div>
                <Badge tone={r.status === "PUBLISHED" ? "green" : r.status === "PENDING" ? "gold" : "neutral"}>
                  {r.status} · {r.source}
                </Badge>
              </div>
              <p className="mt-2 text-[12.5px] text-espresso">{r.content}</p>
              <p className="mt-1 text-[11px] text-mocha">{r.items || "No items recorded"}</p>
              <div className="mt-3 flex flex-wrap justify-end gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    runOp(
                      () => reviewService.setStatus(actor, client.id, r.id, r.status === "PUBLISHED" ? "HIDDEN" : "PUBLISHED"),
                      opToast(load.reload),
                      r.status === "PUBLISHED" ? "Review hidden" : "Review published",
                    )
                  }
                >
                  {r.status === "PUBLISHED" ? "Hide" : "Publish"}
                </Button>
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={() =>
                    runOp(
                      () =>
                        aiService.generateReply(actor, client.id, r as ReviewDoc, {
                          aiEnabled: settings.aiEnabled,
                          aiMonthlyLimit: settings.aiMonthlyLimit,
                          aiPrice: settings.aiPrice,
                        }),
                      opToast(load.reload),
                      "Reply drafted and counted against this month's AI usage",
                    )
                  }
                >
                  <Sparkles className="size-3.5" /> AI reply
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
