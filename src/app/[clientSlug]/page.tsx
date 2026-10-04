"use client";

import { use } from "react";
import Link from "next/link";
import { ExternalLink, Wifi } from "lucide-react";
import { clientService, metricsService } from "@/lib/firebase/services";
import { Avatar, Badge, Card, EmptyState, LinkButton, SectionTitle, Skeleton, StampCard, Stars, inr } from "@/components/ui";
import { isLiveStatus } from "@/lib/firebase/types";
import { useLoad } from "@/lib/use-load";

/** CUSTOMER APP — /{clientSlug} (same Firebase project: cafe-review7) */
export default function CustomerHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string }>;
  searchParams: Promise<{ table?: string }>;
}) {
  const { clientSlug } = use(params);
  const sp = use(searchParams);
  const load = useLoad(
    async () => {
      const bundle = await clientService.publicBundle(clientSlug);
      if (bundle && isLiveStatus(bundle.client.status) && sp.table) {
        await metricsService.record(bundle.client.id, "qrScans", 1).catch(() => undefined);
      }
      return bundle;
    },
    [clientSlug],
  );

  if (load.loading && !load.data) {
    return (
      <main className="mx-auto max-w-2xl space-y-4 px-5 py-10">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </main>
    );
  }

  const bundle = load.data;
  if (!bundle) {
    return (
      <main className="grid min-h-dvh place-items-center bg-cream px-6 text-center">
        <div>
          <h1 className="display-num text-[34px] text-espresso">Not on Grounds</h1>
          <p className="mt-2 text-[13px] text-mocha">
            No business is published at <span className="font-mono">/{clientSlug}</span>.
          </p>
        </div>
      </main>
    );
  }

  const { client, settings, items } = bundle;
  const bg = settings?.backgroundColor ?? "#F7EFE3";
  const text = settings?.textColor ?? "#23130C";
  const primary = settings?.primaryColor ?? "#3A2116";
  const secondary = settings?.secondaryColor ?? "#5A3524";
  const accent = settings?.accentColor ?? "#C0651E";

  if (!isLiveStatus(client.status)) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center" style={{ background: bg, color: text }}>
        <div>
          {client.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={client.logoUrl} alt={client.businessName} className="mx-auto mb-4 size-20 rounded-2xl object-cover" />
          ) : null}
          <p className="label-caps" style={{ color: accent }}>
            {client.businessName}
          </p>
          <h1 className="display-num mt-2 text-[38px] leading-none" style={{ color: primary }}>
            Back shortly
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-[13px]">
            This outlet is currently paused for maintenance. Ordering and loyalty stamps are temporarily unavailable — your
            stamps are safe.
          </p>
        </div>
      </main>
    );
  }

  const featured = items.filter((i) => i.featured).slice(0, 3);
  const socials = [
    ["Instagram", settings?.instagram],
    ["Facebook", settings?.facebook],
    ["YouTube", settings?.youtube],
    ["Website", settings?.website],
  ].filter(([, href]) => href) as [string, string][];

  return (
    <main style={{ background: bg, color: text }} className="min-h-dvh pb-16">
      <div className="relative h-[240px] w-full overflow-hidden sm:h-[320px]">
        {client.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={client.coverImageUrl} alt="" aria-hidden className="size-full object-cover" />
        ) : (
          <div className="size-full" style={{ background: primary }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto flex max-w-2xl items-end gap-3 px-5 pb-5">
          {client.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={client.logoUrl} alt={client.businessName} className="size-16 rounded-2xl object-cover ring-2 ring-white/50" />
          ) : null}
          <div className="text-white">
            <p className="label-caps !text-white/70">{client.tagline}</p>
            <h1 className="display-num text-[clamp(28px,7vw,44px)] leading-none">{client.businessName}</h1>
          </div>
        </div>
        {sp.table ? (
          <span className="absolute right-4 top-4 rounded-full bg-white/85 px-3 py-1 text-[11px] font-bold text-espresso">
            Table {sp.table}
          </span>
        ) : null}
      </div>

      <div className="mx-auto max-w-2xl px-5 pt-6">
        <p className="text-[13px] leading-relaxed" style={{ color: secondary }}>
          {client.description}
        </p>
        <p className="mt-2 text-[12px] opacity-70">
          {client.address} · {client.phone}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/${clientSlug}/menu`}
            className="inline-flex items-center rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white"
            style={{ background: primary }}
          >
            View Menu
          </Link>
          {settings?.googleReviewUrl ? (
            <LinkButton href={settings.googleReviewUrl} external variant="outline">
              Review us on Google <ExternalLink className="size-3.5" />
            </LinkButton>
          ) : null}
          {socials.map(([label, href]) => (
            <LinkButton key={label} href={href} external variant="quiet">
              {label}
            </LinkButton>
          ))}
        </div>

        {settings?.loyaltyEnabled ? (
          <Card className="mt-7 p-5">
            <SectionTitle right={<Badge tone="gold">{settings.rewardName}</Badge>}>Loyalty card</SectionTitle>
            <p className="mb-4 text-[12.5px] opacity-75">{settings.rewardDescription}</p>
            <StampCard stamps={0} target={settings.stampTarget} rewardName={settings.rewardName} size={38} />
            <p className="mt-3 text-[11.5px] opacity-70">
              Ask the counter to scan your card — {settings.stampTarget} stamps unlock a {settings.rewardName.toLowerCase()}.
            </p>
          </Card>
        ) : null}

        {featured.length ? (
          <section className="mt-7">
            <SectionTitle>House favourites</SectionTitle>
            <ul className="space-y-3">
              {featured.map((item) => (
                <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-black/5 bg-white/70 p-3">
                  <Avatar name={item.name} src={item.imageUrl} size={56} square />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{item.name}</p>
                    <p className="truncate text-[11.5px] opacity-70">{item.shortDescription}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Stars value10={item.rating10} />
                      <span className="text-[11px] font-bold">{inr(item.price)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="mt-7">
            <EmptyState title="Menu coming soon" body="The kitchen is still writing it. Check back shortly." />
          </div>
        )}

        {settings?.wifiEnabled ? (
          <Card className="mt-7 p-5">
            <SectionTitle>Free Wi-Fi</SectionTitle>
            <p className="flex items-center gap-2 text-[13px]">
              <Wifi className="size-4" />
              <span className="font-bold">{settings.wifiSsid}</span>
            </p>
            {settings.wifiMessage ? <p className="mt-2 text-[12.5px] opacity-75">{settings.wifiMessage}</p> : null}
            <p className="mt-2 text-[11px] opacity-60">Ask the counter for the password — it is never published here.</p>
          </Card>
        ) : null}

        <p className="mt-10 text-center text-[11px] opacity-50">
          powered by Grounds ·{" "}
          <Link href={`/staff/${clientSlug}`} className="underline">
            staff app
          </Link>
        </p>
      </div>
    </main>
  );
}
