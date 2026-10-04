"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  BadgePercent,
  Building2,
  QrCode,
  Sparkles,
  Star,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { WorkspacePage, opToast } from "@/components/admin-page";
import {
  Card,
  EmptyState,
  LinkButton,
  MeterBar,
  PageHeader,
  SectionTitle,
  Skeleton,
  StatTile,
  shortTime,
} from "@/components/ui";
import { BarChart } from "@/components/interactive";
import { useAuth } from "@/context/AuthContext";
import {
  activityService,
  clientService,
  menuService,
  metricsService,
  reviewService,
} from "@/lib/firebase/services";
import { seedDemoClients } from "@/lib/firebase/seed";
import { useLoad, runOp } from "@/lib/use-load";

export default function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; range?: string }>;
}) {
  const params = use(searchParams);
  return <WorkspacePage>{({ actor }) => <Dashboard actor={actor} params={params} />}</WorkspacePage>;
}

function Dashboard({
  actor,
  params,
}: {
  actor: { uid: string; name: string; role: string };
  params: { client?: string; range?: string };
}) {
  const { allowedClientIds, primaryStoreId } = useAuth();
  const isSuper = actor.role === "SUPER_ADMIN";
  const range = params.range === "7" || params.range === "90" ? Number(params.range) : 30;

  const clientsLoad = useLoad(() => clientService.listAllowed(allowedClientIds), [allowedClientIds]);
  const clients = useMemo(() => clientsLoad.data ?? [], [clientsLoad.data]);
  // ONE ADMIN = ONE STORE: normal admins always land on their own store.
  // SUPER_ADMIN keeps the platform-level store selector.
  const active = isSuper
    ? (clients.find((c) => c.id === params.client) ?? clients[0] ?? null)
    : (clients.find((c) => c.id === primaryStoreId) ?? clients[0] ?? null);

  const dataLoad = useLoad(
    async () => {
      if (!active) return null;
      const [stats, series, items, reviews, recent, settings] = await Promise.all([
        clientService.stats(active.id),
        metricsService.series(active.id, range),
        menuService.items(active.id),
        reviewService.list(active.id),
        activityService.forClient(active.id),
        clientService.get(active.id).then((r) => r?.settings ?? null),
      ]);
      return { stats, series, items, reviews, recent: recent.slice(0, 6), settings };
    },
    [active?.id, range],
    Boolean(active),
  );

  if (clientsLoad.loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!clients.length) {
    return (
      <EmptyState
        title="Set up your store"
        body="Create your store profile, branding, menu, loyalty program, QR experience and customer settings. This is done once — afterwards you land straight on your dashboard."
        icon={<Building2 className="size-5" />}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <LinkButton href="/admin/clients/new">Set Up Store</LinkButton>
            {isSuper ? (
              <button
                className="rounded-xl border border-espresso/25 px-4 py-2.5 text-[13px] font-semibold text-espresso hover:bg-linen/50"
                onClick={() => runOp(() => seedDemoClients(actor), opToast(clientsLoad.reload), "Demo store created")}
              >
                Use Demo Store
              </button>
            ) : null}
          </div>
        }
      />
    );
  }

  const d = dataLoad.data;
  const stats = d?.stats;
  const tiles = [
    { label: "Total Customers", value: stats?.customers ?? "…", icon: <Users className="size-4" />, wide: true, href: `/admin/clients/${active!.id}/customers` },
    { label: "Active Staff", value: stats?.staff ?? "…", icon: <Users className="size-4" />, href: `/admin/clients/${active!.id}/staff` },
    { label: "Menu Items", value: stats?.menu ?? "…", icon: <UtensilsCrossed className="size-4" />, href: `/admin/clients/${active!.id}/menu` },
    { label: "QR Scans", value: stats?.qrScans?.toLocaleString("en-IN") ?? "…", icon: <QrCode className="size-4" />, href: `/admin/clients/${active!.id}/qr` },
    { label: "Google Reviews", value: stats?.googleReviews ?? "…", icon: <Star className="size-4" />, href: `/admin/clients/${active!.id}/reviews` },
    { label: "AI Reviews", value: stats?.aiReviews ?? "…", icon: <Sparkles className="size-4" />, href: `/admin/clients/${active!.id}/ai-review` },
    { label: "Stamps", value: stats?.stamps ?? "…", icon: <Activity className="size-4" />, href: `/admin/clients/${active!.id}/customers` },
    { label: "Rewards Redeemed", value: stats?.rewards ?? "…", icon: <BadgePercent className="size-4" />, href: `/admin/clients/${active!.id}/loyalty` },
  ];

  const quickActions = [
    { href: `/admin/clients/${active!.id}/menu`, label: "Manage Menu", icon: <UtensilsCrossed className="size-4" /> },
    { href: `/admin/clients/${active!.id}/staff`, label: "Manage Staff", icon: <Users className="size-4" /> },
    { href: `/admin/clients/${active!.id}/loyalty`, label: "Loyalty Settings", icon: <BadgePercent className="size-4" /> },
    { href: `/admin/clients/${active!.id}/qr`, label: "Generate QR Code", icon: <QrCode className="size-4" /> },
  ];

  const scanSeries = (d?.series ?? []).slice(-14);
  const topItems = [...(d?.items ?? [])].sort((a, b) => b.views - a.views).slice(0, 5);
  const reviews = d?.reviews ?? [];
  const avgRating = reviews.length ? (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1) : "—";
  const buckets = [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews.filter((r) => r.rating === star).length }));

  return (
    <>
      <div className="settle -mx-4 mb-6 bg-espresso px-4 py-5 text-cream md:-mx-8 md:px-8">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-caps !text-cream/50">Live workspace · /{active!.slug} · Firebase cafe-review7</p>
            <h1 className="display-num mt-1 text-[clamp(28px,5vw,44px)] leading-none">{active!.displayName}</h1>
            <p className="mt-1.5 text-[12.5px] text-cream/70">Welcome back, {actor.name.split(" ")[0]}. Here’s your overview.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(isSuper ? clients : []).map((c) => (
              <Link
                key={c.id}
                href={`/admin?client=${c.id}&range=${range}`}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
                  c.id === active!.id ? "bg-cream text-espresso" : "bg-cream/10 text-cream/70 hover:bg-cream/20"
                }`}
              >
                {c.displayName}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1180px]">
        <PageHeader
          eyebrow="Store overview"
          title={`${active!.businessName} — ${range} days`}
          subtitle={active!.tagline}
          actions={
            <>
              {(["7", "30", "90"] as const).map((r) => (
                <LinkButton key={r} href={`/admin?client=${active!.id}&range=${r}`} size="sm" variant={String(range) === r ? "primary" : "outline"}>
                  {r} days
                </LinkButton>
              ))}
            </>
          }
        />

        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <StatTile key={t.label} {...t} />
          ))}
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <Card className="p-5">
              <SectionTitle right={<span className="text-[11px] text-mocha">Last {scanSeries.length} days</span>}>QR Scans trend</SectionTitle>
              {scanSeries.length ? (
                <BarChart
                  data={scanSeries.map((m) => m.qrScans)}
                  labels={scanSeries.map((m) => new Date(m.day).toLocaleDateString("en-IN", { day: "numeric", month: "short" }))}
                  unit="scans"
                />
              ) : (
                <EmptyState title="No scan data" body="Scan activity will chart here once the first QR is printed." />
              )}
            </Card>

            <Card className="p-5">
              <SectionTitle>Quick actions</SectionTitle>
              <ul className="space-y-2">
                {quickActions.map((a) => (
                  <li key={a.href}>
                    <Link
                      href={a.href}
                      className="group flex items-center gap-3 rounded-xl border border-linen bg-paper px-3 py-3 transition-all duration-150 hover:border-espresso/30 hover:bg-linen/40"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-espresso text-cream transition-colors group-hover:bg-caramel">
                        {a.icon}
                      </span>
                      <span className="flex-1 text-[13px] font-bold text-espresso">{a.label}</span>
                      <ArrowUpRight className="size-4 text-mocha transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-5">
              <SectionTitle right={<LinkButton href={`/admin/clients/${active!.id}/activity`} size="sm" variant="ghost">All</LinkButton>}>
                Recent activity
              </SectionTitle>
              {(d?.recent ?? []).length ? (
                <ul className="divide-y divide-linen">
                  {d!.recent.map((r) => (
                    <li key={r.id} className="flex items-start gap-3 py-2.5">
                      <Activity className="mt-0.5 size-3.5 shrink-0 text-caramel" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-espresso">
                          {r.action.replace(/_/g, " ").toLowerCase()} · {r.target || "—"}
                        </p>
                        <p className="text-[11px] text-mocha">
                          {r.actorName} · {shortTime(r.createdAt)}{r.transactionId ? ` · ${r.transactionId}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No activity yet" body="Every admin and staff action will be recorded here." />
              )}
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="p-5">
              <SectionTitle right={<span className="text-[11px] text-mocha">by menu views</span>}>Top menu items</SectionTitle>
              {topItems.length ? (
                <ul className="space-y-3">
                  {topItems.map((item) => (
                    <li key={item.id}>
                      <MeterBar label={item.name} value={item.views} max={Math.max(1, topItems[0].views)} right={`${item.views.toLocaleString("en-IN")} views`} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No menu items" body="Add items to see which dishes get the most attention." />
              )}
            </Card>

            <Card className="p-5">
              <SectionTitle>Review statistics</SectionTitle>
              <div className="mb-3 flex items-end gap-3">
                <p className="display-num text-[40px] text-espresso">{avgRating}</p>
                <div className="pb-1.5">
                  <p className="label-caps">Average rating</p>
                  <p className="text-[11px] text-mocha">{reviews.length} reviews</p>
                </div>
              </div>
              <div className="space-y-2">
                {buckets.map((b) => (
                  <MeterBar key={b.star} label={`${b.star} ★`} value={b.count} max={Math.max(1, reviews.length)} right={String(b.count)} />
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle>Loyalty statistics</SectionTitle>
              <dl className="grid grid-cols-2 gap-3">
                {[
                  ["Stamps (90d)", stats?.stamps ?? "…"],
                  ["Rewards redeemed", stats?.rewards ?? "…"],
                  ["Customers", stats?.customers ?? "…"],
                  ["Feedback notes", stats?.feedback ?? "…"],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-linen/60 px-3 py-2.5">
                    <dt className="label-caps">{label}</dt>
                    <dd className="display-num text-[22px] text-espresso">{value as number}</dd>
                  </div>
                ))}
              </dl>
              {d?.settings ? (
                <p className="mt-3 text-[11px] text-mocha">
                  Current programme: <span className="font-semibold text-espresso">{d.settings.stampTarget} stamps</span> →{" "}
                  <span className="font-semibold text-espresso">{d.settings.rewardName}</span>
                </p>
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
