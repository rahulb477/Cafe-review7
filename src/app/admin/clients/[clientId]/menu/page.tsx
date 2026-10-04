"use client";

import { use, useMemo, useState } from "react";
import { ExternalLink, Plus, UtensilsCrossed } from "lucide-react";
import { ClientPage, opToast, type ClientCtx } from "@/components/admin-page";
import { CategoryManager, type CategoryRow } from "@/components/category-manager";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LinkButton,
  PageHeader,
  SectionTitle,
  SkeletonRows,
  Stars,
  inr,
} from "@/components/ui";
import { menuService } from "@/lib/firebase/services";
import type { MenuItemDoc } from "@/lib/firebase/types";
import { runOp, useLoad } from "@/lib/use-load";

export default function MenuPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <Menu ctx={ctx} />}</ClientPage>;
}

function Menu({ ctx }: { ctx: ClientCtx }) {
  const { client, actor } = ctx;
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("ALL");
  const [status, setStatus] = useState("ALL");

  const load = useLoad(
    async () => {
      const [cats, items] = await Promise.all([menuService.categories(client.id), menuService.items(client.id)]);
      return { cats, items };
    },
    [client.id],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (load.data?.items ?? []).filter(
      (i) =>
        (category === "ALL" || i.categoryId === category) &&
        (status === "ALL" || (status === "ACTIVE") === i.active) &&
        (!needle || i.name.toLowerCase().includes(needle)),
    );
  }, [load.data, q, category, status]);

  const catName = (id: string | null) => load.data?.cats.find((c) => c.id === id)?.name ?? "Uncategorised";

  return (
    <>
      <PageHeader
        eyebrow={`${load.data?.items.length ?? 0} items · ${load.data?.cats.length ?? 0} categories`}
        title="Store Menu"
        subtitle="Search, filter, reorder and publish. The customer menu reads the same Firestore collections."
        actions={
          <>
            <LinkButton href={`/${client.slug}/menu`} external variant="outline">
              <ExternalLink className="size-3.5" /> View Customer Menu
            </LinkButton>
            <LinkButton href={`/admin/clients/${client.id}/menu/new`}>
              <Plus className="size-4" /> Add Item
            </LinkButton>
          </>
        }
      />

      <Card className="mb-4 p-4">
        <SectionTitle right={<span className="text-[11px] text-mocha">order via arrows</span>}>Categories</SectionTitle>
        <CategoryManager actor={actor} clientId={client.id} categories={(load.data?.cats ?? []) as CategoryRow[]} reload={load.reload} />
      </Card>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search menu items…" className="sm:max-w-xs" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-linen bg-paper px-3 py-2.5 text-[12px]">
          <option value="ALL">All categories</option>
          {(load.data?.cats ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {["ALL", "ACTIVE", "INACTIVE"].map((value) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
              status === value ? "bg-espresso text-cream" : "bg-paper text-mocha hover:bg-linen"
            }`}
          >
            {value === "ALL" ? "All" : value === "ACTIVE" ? "Active" : "Inactive"}
          </button>
        ))}
      </div>

      {load.loading && !load.data ? (
        <SkeletonRows rows={4} />
      ) : load.error && !load.data ? (
        <ErrorState message={load.error} action={<Button onClick={load.reload}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No menu items"
          body="Nothing matches this filter yet. Add your first dish — it appears in the customer app immediately."
          icon={<UtensilsCrossed className="size-5" />}
          action={<LinkButton href={`/admin/clients/${client.id}/menu/new`}>+ Add Item</LinkButton>}
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <Card key={r.id} className="p-3.5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={r.name} src={r.imageUrl} size={44} square />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-espresso">
                      {r.name} {r.featured ? <Badge tone="gold">Featured</Badge> : null}
                    </p>
                    <p className="truncate text-[11px] text-mocha">
                      {catName(r.categoryId)} · {inr(r.price)}
                    </p>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <Stars value10={r.rating10} />
                      <span className="text-[11px] text-mocha">{(r.rating10 / 10).toFixed(1)}</span>
                    </span>
                  </div>
                  <Badge tone={r.active ? "green" : "neutral"}>{r.active ? "Live" : "Hidden"}</Badge>
                </div>
                <ItemActions item={r} ctx={ctx} reload={load.reload} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function ItemActions({ item, ctx, reload }: { item: MenuItemDoc; ctx: ClientCtx; reload: () => void }) {
  const { actor, client } = ctx;
  return (
    <div className="flex flex-wrap gap-1.5">
      <LinkButton href={`/admin/clients/${client.id}/menu/${item.id}`} size="sm">
        Edit
      </LinkButton>
      <Button
        size="sm"
        variant="outline"
        onClick={() => runOp(() => menuService.duplicateItem(actor, client.id, item.id), opToast(reload), "Item duplicated (saved inactive)")}
      >
        Duplicate
      </Button>
      <Button
        size="sm"
        variant={item.active ? "danger" : "quiet"}
        onClick={() =>
          runOp(
            () => menuService.toggleItem(actor, client.id, item.id, !item.active),
            opToast(reload),
            item.active ? "Item hidden from the customer menu" : "Item enabled on the customer menu",
          )
        }
      >
        {item.active ? "Disable" : "Enable"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => runOp(() => menuService.deleteItem(actor, client.id, item.id), opToast(reload), "Menu item deleted")}
      >
        Delete
      </Button>
    </div>
  );
}
