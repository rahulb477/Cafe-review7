"use client";

import { use, useState } from "react";
import { ExternalLink, Pencil, QrCode, Users, UtensilsCrossed, Wifi } from "lucide-react";
import { ClientPage, opToast, type ClientCtx } from "@/components/admin-page";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Input,
  LinkButton,
  PageHeader,
  SectionTitle,
  Skeleton,
  StatTile,
  shortDate,
} from "@/components/ui";
import { clientService } from "@/lib/firebase/services";
import { useLoad, runOp } from "@/lib/use-load";

export default function ClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <Detail ctx={ctx} />}</ClientPage>;
}

function Detail({ ctx }: { ctx: ClientCtx }) {
  const { client, settings, actor, role } = ctx;
  const statsLoad = useLoad(() => clientService.stats(client.id), [client.id]);
  const stats = statsLoad.data;
  const [dupName, setDupName] = useState("");

  return (
    <>
      <div className="settle relative -mx-4 mb-6 overflow-hidden bg-espresso md:-mx-8">
        {client.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={client.coverImageUrl} alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-55" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-bean/95 via-espresso/75 to-espresso/40" />
        <div className="relative mx-auto flex max-w-[1180px] flex-col gap-4 px-4 py-7 sm:flex-row sm:items-end sm:justify-between md:px-8">
          <div className="flex items-end gap-4">
            <Avatar name={client.businessName} src={client.logoUrl} size={72} square className="ring-2 ring-cream/40" />
            <div className="text-cream">
              <div className="mb-1 flex items-center gap-2">
                <Badge tone={client.status === "ACTIVE" || client.status === "PUBLISHED" ? "green" : client.status === "DRAFT" ? "gold" : client.status === "SUSPENDED" ? "red" : "neutral"}>
                  {client.status}
                </Badge>
                <span className="label-caps !text-cream/60">/{client.slug}</span>
              </div>
              <h1 className="display-num text-[clamp(26px,4.5vw,40px)] leading-none">{client.businessName}</h1>
              <p className="mt-1 max-w-xl text-[12.5px] text-cream/75">{client.tagline}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/${client.slug}`} external variant="outline" className="border-cream/30 bg-cream/10 text-cream">
              <ExternalLink className="size-3.5" /> View Customer App
            </LinkButton>
            <LinkButton href={`/staff/${client.slug}`} external variant="outline" className="border-cream/30 bg-cream/10 text-cream">
              <ExternalLink className="size-3.5" /> View Staff App
            </LinkButton>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1180px]">
        <PageHeader eyebrow="Store details" title="Overview" subtitle={client.description} />

        <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats ? (
            <>
              <StatTile label="Customers" value={stats.customers} href={`/admin/clients/${client.id}/customers`} icon={<Users className="size-4" />} />
              <StatTile label="Staff" value={stats.staff} href={`/admin/clients/${client.id}/staff`} icon={<Users className="size-4" />} />
              <StatTile label="Menu items" value={stats.menu} href={`/admin/clients/${client.id}/menu`} icon={<UtensilsCrossed className="size-4" />} />
              <StatTile label="QR scans (90d)" value={stats.qrScans.toLocaleString("en-IN")} href={`/admin/clients/${client.id}/qr`} icon={<QrCode className="size-4" />} />
              <StatTile label="Reviews" value={stats.googleReviews} href={`/admin/clients/${client.id}/reviews`} />
              <StatTile label="Stamps (90d)" value={stats.stamps} href={`/admin/clients/${client.id}/customers`} />
              <StatTile label="Rewards redeemed" value={stats.rewards} href={`/admin/clients/${client.id}/loyalty`} />
              <StatTile label="Feedback notes" value={stats.feedback} href={`/admin/clients/${client.id}/feedback`} />
            </>
          ) : (
            Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="p-5">
            <SectionTitle>Business information</SectionTitle>
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Business name", client.businessName],
                ["Display name", client.displayName],
                ["Slug", `/${client.slug}`],
                ["Phone", client.phone || "—"],
                ["Address", client.address || "—"],
                ["Onboarded", shortDate(client.createdAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="label-caps">{label}</dt>
                  <dd className="text-[13px] font-semibold text-espresso">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <LinkButton href={`/admin/clients/${client.id}/branding`} variant="outline">
                <Pencil className="size-3.5" /> Edit branding & theme
              </LinkButton>
              <LinkButton href={`/admin/clients/${client.id}/menu`} variant="outline">
                <UtensilsCrossed className="size-3.5" /> Manage menu
              </LinkButton>
              <LinkButton href={`/admin/clients/${client.id}/staff`} variant="outline">
                <Users className="size-3.5" /> Manage staff
              </LinkButton>
              <LinkButton href={`/admin/clients/${client.id}/loyalty`} variant="outline">
                <Pencil className="size-3.5" /> Loyalty settings
              </LinkButton>
              <LinkButton href={`/admin/clients/${client.id}/qr`} variant="outline">
                <QrCode className="size-3.5" /> Generate QR
              </LinkButton>
              <LinkButton href={`/${client.slug}/menu`} variant="outline" external>
                <ExternalLink className="size-3.5" /> View customer menu
              </LinkButton>
            </div>

            {role === "SUPER_ADMIN" ? (
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-linen pt-4">
                <Button
                  variant={client.status === "SUSPENDED" ? "primary" : "danger"}
                  size="sm"
                  onClick={() =>
                    runOp(
                      () => clientService.setStatus(actor, client.id, client.status === "SUSPENDED" ? "PUBLISHED" : "SUSPENDED"),
                      opToast(ctx.reloadClient),
                      client.status === "SUSPENDED" ? "Store reactivated" : "Store suspended",
                    )
                  }
                >
                  {client.status === "SUSPENDED" ? "Reactivate store" : "Suspend store"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    runOp(() => clientService.setStatus(actor, client.id, "ARCHIVED"), opToast(ctx.reloadClient), "Business archived")
                  }
                >
                  Archive
                </Button>
                <p className="text-[11px] text-mocha">
                  Suspension shows a maintenance screen to guests and blocks staff operations. Historical data is kept.
                </p>
              </div>
            ) : null}
          </Card>

          <div className="space-y-5">
            <Card className="p-5">
              <SectionTitle>Live configuration</SectionTitle>
              <dl className="space-y-2.5 text-[12.5px]">
                {[
                  ["Loyalty", settings.loyaltyEnabled ? `${settings.stampTarget} stamps → ${settings.rewardName}` : "Disabled"],
                  ["Google review", settings.googleReviewUrl ? "Connected" : "Not set"],
                  ["Wi-Fi", settings.wifiEnabled ? settings.wifiSsid : "Hidden from guests"],
                  ["AI review", settings.aiEnabled ? `${settings.aiMonthlyLimit} requests / month` : "Disabled"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3 border-b border-linen pb-2 last:border-0">
                    <dt className="label-caps pt-0.5">{label}</dt>
                    <dd className="text-right font-semibold text-espresso">{value}</dd>
                  </div>
                ))}
              </dl>
              {settings.wifiEnabled ? (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-linen/60 px-3 py-2 text-[11px] text-mocha">
                  <Wifi className="mt-0.5 size-3.5 shrink-0" />
                  Wi-Fi passwords are never stored in Firestore or shown to guests.
                </p>
              ) : null}
            </Card>

            {role === "SUPER_ADMIN" ? (
              <Card className="p-5">
                <SectionTitle>Duplicate store</SectionTitle>
                <p className="mb-3 text-[11.5px] text-mocha">
                  Copies brand theme, categories, menu structure, loyalty and review settings. Never customers, staff,
                  transactions, reviews, feedback or logs.
                </p>
                <Field label="New business name">
                  <Input value={dupName} onChange={(e) => setDupName(e.target.value)} placeholder={`${client.businessName} (copy)`} />
                </Field>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() =>
                    runOp(
                      () => clientService.duplicate(actor, client.id, dupName),
                      opToast(),
                      "Business duplicated (operational data excluded)",
                    )
                  }
                >
                  Duplicate Store
                </Button>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
