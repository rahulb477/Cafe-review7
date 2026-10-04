"use client";

import { use, useState } from "react";
import { Activity, QrCode, Star, UtensilsCrossed, Wifi } from "lucide-react";
import { ClientPage, type ClientCtx } from "@/components/admin-page";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  MeterBar,
  PageHeader,
  SectionTitle,
  SkeletonRows,
  StatTile,
} from "@/components/ui";
import { BarChart } from "@/components/interactive";
import { menuService, metricsService, reviewService } from "@/lib/firebase/services";
import { useLoad } from "@/lib/use-load";

export default function AnalyticsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <Analytics ctx={ctx} />}</ClientPage>;
}

const METRIC_LABELS: [keyof MetricRow, string][] = [
  ["qrScans", "QR Scans"],
  ["menuViews", "Menu Views"],
  ["googleReviews", "Google Reviews"],
  ["socialClicks", "Social Clicks"],
  ["wifiConnections", "Wi-Fi Connections"],
  ["feedback", "Feedback"],
  ["stamps", "Stamps"],
  ["rewards", "Rewards"],
];

type MetricRow = {
  day: string;
  qrScans: number;
  menuViews: number;
  googleReviews: number;
  socialClicks: number;
  wifiConnections: number;
  feedback: number;
  stamps: number;
  rewards: number;
};

function Analytics({ ctx }: { ctx: ClientCtx }) {
  const { client } = ctx;
  const [range, setRange] = useState(30);
  const [tab, setTab] = useState<"overview" | "menu" | "reviews" | "loyalty">("overview");

  const load = useLoad(
    async () => {
      const [series, items, reviews] = await Promise.all([
        metricsService.series(client.id, range),
        menuService.items(client.id),
        reviewService.list(client.id),
      ]);
      return { series: series as MetricRow[], items, reviews };
    },
    [client.id, range],
  );

  if (load.loading && !load.data) return <SkeletonRows rows={4} />;
  if (load.error && !load.data) return <ErrorState message={load.error} action={<Button onClick={load.reload}>Retry</Button>} />;

  const series = load.data?.series ?? [];
  const items = load.data?.items ?? [];
  const reviews = load.data?.reviews ?? [];
  const totals = Object.fromEntries(METRIC_LABELS.map(([k]) => [k, series.reduce((a, m) => a + (m[k] as number), 0)]));
  const topMenu = [...items].sort((a, b) => b.views - a.views).slice(0, 5);
  const label = (day: string) => new Date(day).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const buckets = [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews.filter((r) => r.rating === star).length }));

  return (
    <>
      <PageHeader
        eyebrow={`${client.displayName} · metricsDaily collection`}
        title="Store Analytics"
        subtitle="QR scans, menu views, reviews, social taps, Wi-Fi joins, feedback, stamps and rewards."
        actions={
          <>
            {[7, 30, 90].map((r) => (
              <Button key={r} size="sm" variant={range === r ? "primary" : "outline"} onClick={() => setRange(r)}>
                {r} Days
              </Button>
            ))}
          </>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {(
          [
            ["overview", "Overview"],
            ["menu", "Menu"],
            ["reviews", "Reviews"],
            ["loyalty", "Loyalty"],
          ] as const
        ).map(([key, lbl]) => (
          <Button key={key} size="sm" variant={tab === key ? "primary" : "quiet"} onClick={() => setTab(key)}>
            {lbl}
          </Button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {METRIC_LABELS.map(([key, lbl], i) => (
              <StatTile
                key={key}
                label={lbl}
                value={(totals[key] ?? 0).toLocaleString("en-IN")}
                wide={i === 0}
                icon={
                  key === "qrScans" ? (
                    <QrCode className="size-4" />
                  ) : key === "wifiConnections" ? (
                    <Wifi className="size-4" />
                  ) : key === "stamps" ? (
                    <Activity className="size-4" />
                  ) : (
                    <Star className="size-4" />
                  )
                }
              />
            ))}
          </section>

          <Card className="p-5">
            <SectionTitle right={<span className="text-[11px] text-mocha">last {series.length} days</span>}>QR Scans trend</SectionTitle>
            {series.length ? (
              <BarChart data={series.map((d) => d.qrScans)} labels={series.map((d) => label(d.day))} height={180} unit="scans" />
            ) : (
              <EmptyState title="No data for this period" body="Scans will chart here once your QR codes are in use." />
            )}
          </Card>

          {series.length ? (
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <Card className="p-5">
                <SectionTitle>Menu views trend</SectionTitle>
                <BarChart data={series.map((d) => d.menuViews)} labels={series.map((d) => label(d.day))} height={140} tone="#C0651E" unit="views" />
              </Card>
              <Card className="p-5">
                <SectionTitle>Stamps per day</SectionTitle>
                <BarChart data={series.map((d) => d.stamps)} labels={series.map((d) => label(d.day))} height={140} tone="#3F8F5B" unit="stamps" />
              </Card>
            </div>
          ) : null}
        </>
      ) : null}

      {tab === "menu" ? (
        <Card className="p-5">
          <SectionTitle right={<span className="text-[11px] text-mocha">views & clicks</span>}>Top Menu Items</SectionTitle>
          {topMenu.length ? (
            <ul className="space-y-4">
              {topMenu.map((item) => (
                <li key={item.id} className="flex items-center gap-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-linen text-espresso">
                    <UtensilsCrossed className="size-4" />
                  </span>
                  <div className="flex-1">
                    <MeterBar label={item.name} value={item.views} max={Math.max(1, topMenu[0].views)} right={`${item.views} views`} />
                    <p className="mt-1 text-[11px] text-mocha">{item.clicks} menu clicks · ₹{item.price}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No menu items" body="Add items to start collecting menu analytics." />
          )}
        </Card>
      ) : null}

      {tab === "reviews" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <SectionTitle>Rating spread</SectionTitle>
            <div className="space-y-3">
              {buckets.map((b) => (
                <MeterBar key={b.star} label={`${b.star} ★`} value={b.count} max={Math.max(1, reviews.length)} right={String(b.count)} />
              ))}
            </div>
          </Card>
          <Card className="p-5">
            <SectionTitle>Review totals</SectionTitle>
            <p className="display-num text-[52px] leading-none text-espresso">
              {reviews.length ? (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1) : "—"}
            </p>
            <p className="label-caps mt-1">{reviews.length} reviews · {totals.googleReviews ?? 0} via Google metric</p>
          </Card>
        </div>
      ) : null}

      {tab === "loyalty" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <SectionTitle>Loyalty totals ({range}d)</SectionTitle>
            <dl className="grid grid-cols-2 gap-3">
              {[
                ["Stamps", totals.stamps ?? 0],
                ["Rewards", totals.rewards ?? 0],
                ["QR scans", totals.qrScans ?? 0],
                ["Wi-Fi joins", totals.wifiConnections ?? 0],
              ].map(([lbl, value]) => (
                <div key={String(lbl)} className="rounded-xl bg-linen/60 px-3 py-2.5">
                  <dt className="label-caps">{lbl}</dt>
                  <dd className="display-num text-[26px] text-espresso">{value as number}</dd>
                </div>
              ))}
            </dl>
          </Card>
          {series.length ? (
            <Card className="p-5">
              <SectionTitle>Stamps per day</SectionTitle>
              <BarChart data={series.map((d) => d.stamps)} labels={series.map((d) => label(d.day))} height={150} tone="#3F8F5B" unit="stamps" />
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
