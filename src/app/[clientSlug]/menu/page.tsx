"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";
import { clientService, metricsService } from "@/lib/firebase/services";
import { Avatar, Badge, EmptyState, LinkButton, SectionTitle, Skeleton, Stars, inr } from "@/components/ui";
import { useLoad } from "@/lib/use-load";
import { isLiveStatus } from "@/lib/firebase/types";

/** CUSTOMER APP — /{clientSlug}/menu */
export default function CustomerMenuPage({ params }: { params: Promise<{ clientSlug: string }> }) {
  const { clientSlug } = use(params);
  const [active, setActive] = useState<string>("ALL");
  const tracked = useRef(false);

  const load = useLoad(
    async () => {
      const bundle = await clientService.publicBundle(clientSlug);
      if (bundle && isLiveStatus(bundle.client.status) && !tracked.current) {
        tracked.current = true;
        await metricsService.record(bundle.client.id, "menuViews", 1).catch(() => undefined);
      }
      return bundle;
    },
    [clientSlug],
  );

  if (load.loading && !load.data) {
    return (
      <main className="mx-auto max-w-2xl space-y-3 px-5 py-10">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </main>
    );
  }

  const bundle = load.data;
  if (!bundle) {
    return (
      <main className="grid min-h-dvh place-items-center bg-cream px-6 text-center">
        <p className="display-num text-2xl text-espresso">No menu published at /{clientSlug}</p>
      </main>
    );
  }

  const { client, settings, categories, items } = bundle;
  const bg = settings?.backgroundColor ?? "#F7EFE3";
  const text = settings?.textColor ?? "#23130C";
  const primary = settings?.primaryColor ?? "#3A2116";
  const accent = settings?.accentColor ?? "#C0651E";

  if (!isLiveStatus(client.status)) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center" style={{ background: bg, color: text }}>
        <div>
          <h1 className="display-num text-[34px]" style={{ color: primary }}>
            Back shortly
          </h1>
          <p className="mt-2 text-[13px]">This outlet is paused — the menu will return soon.</p>
        </div>
      </main>
    );
  }

  const shown = active === "ALL" ? items : items.filter((i) => i.categoryId === active);

  return (
    <main style={{ background: bg, color: text }} className="min-h-dvh pb-16">
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-5 py-4 backdrop-blur"
        style={{ background: `${bg}e6`, borderBottom: "1px solid rgba(0,0,0,0.08)" }}
      >
        <Link href={`/${clientSlug}`} aria-label="Back" className="rounded-lg p-1.5 hover:bg-black/5">
          <ArrowLeft className="size-4" />
        </Link>
        {client.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={client.logoUrl} alt={client.businessName} className="size-9 rounded-xl object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold">{client.businessName}</p>
          <p className="truncate text-[11px] opacity-60">{client.tagline}</p>
        </div>
        {items.length ? <Badge tone="neutral">{items.length} items</Badge> : null}
      </header>

      <div className="mx-auto max-w-2xl px-5 pt-5">
        <h1 className="display-num text-[34px] leading-none" style={{ color: primary }}>
          Menu
        </h1>
        <p className="mt-1 text-[12.5px] opacity-70">Freshly prepared, served all day.</p>

        <nav className="mt-4 flex flex-wrap gap-1.5">
          <button
            onClick={() => setActive("ALL")}
            className={`rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors ${active === "ALL" ? "text-white" : "bg-white/70"}`}
            style={active === "ALL" ? { background: primary } : undefined}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={`rounded-full px-3 py-1.5 text-[11.5px] font-bold transition-colors ${active === c.id ? "text-white" : "bg-white/70"}`}
              style={active === c.id ? { background: primary } : undefined}
            >
              {c.name}
            </button>
          ))}
        </nav>

        <section className="mt-6">
          <SectionTitle>{shown.length} dishes</SectionTitle>
          {shown.length ? (
            <ul className="space-y-3">
              {shown.map((item) => (
                <li
                  key={item.id}
                  id={`items-${item.slug}`}
                  className="flex items-start gap-3 rounded-2xl border border-black/5 bg-white/75 p-3 transition-transform duration-150 hover:-translate-y-0.5"
                >
                  <Avatar name={item.name} src={item.imageUrl} size={76} square />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-bold">{item.name}</p>
                      <span className="shrink-0 text-[13px] font-bold" style={{ color: accent }}>
                        {inr(item.price)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] opacity-75">{item.shortDescription}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Stars value10={item.rating10} />
                      <span className="text-[11px] opacity-60">{(item.rating10 / 10).toFixed(1)}</span>
                      {item.dietary ? <Badge tone="green">{item.dietary}</Badge> : null}
                      {item.calories ? <span className="text-[11px] opacity-50">{item.calories} kcal</span> : null}
                      <span className="text-[11px] opacity-50">{item.prepTimeMinutes} min</span>
                    </div>
                    {item.allergens ? <p className="mt-1 text-[11px] opacity-50">Contains {item.allergens.toLowerCase()}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No items in this section"
              body="The kitchen hasn't added anything here yet — try another section."
              icon={<Star className="size-5" />}
            />
          )}
        </section>

        <div className="mt-8 flex flex-wrap gap-2">
          <LinkButton href={`/${clientSlug}`} variant="outline">
            Back to {client.displayName}
          </LinkButton>
          <LinkButton href={`/staff/${clientSlug}`} variant="quiet">
            Staff app
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
