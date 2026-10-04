"use client";

import { use } from "react";
import { ExternalLink } from "lucide-react";
import { ClientPage, type ClientCtx } from "@/components/admin-page";
import { MenuItemForm } from "@/components/menu-item-form";
import { EmptyState, ErrorState, LinkButton, PageHeader, SkeletonRows } from "@/components/ui";
import { menuService } from "@/lib/firebase/services";
import { useLoad } from "@/lib/use-load";

export default function EditMenuItemPage({ params }: { params: Promise<{ clientId: string; itemId: string }> }) {
  const { clientId, itemId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <EditItem ctx={ctx} itemId={itemId} />}</ClientPage>;
}

function EditItem({ ctx, itemId }: { ctx: ClientCtx; itemId: string }) {
  const { client, actor } = ctx;
  const load = useLoad(
    async () => {
      const [item, cats] = await Promise.all([menuService.item(client.id, itemId), menuService.categories(client.id)]);
      return { item, cats };
    },
    [client.id, itemId],
  );

  if (load.loading && !load.data) return <SkeletonRows rows={4} />;
  if (load.error && !load.data) return <ErrorState message={load.error} />;
  if (!load.data?.item)
    return <EmptyState title="Menu item not found" body="It may have been deleted, or it belongs to another business." />;

  return (
    <>
      <PageHeader
        eyebrow={`${client.displayName} · /${load.data.item.slug}`}
        title="Edit Menu Item"
        subtitle="Changes are live in the customer and staff apps as soon as you save."
        actions={
          <LinkButton href={`/${client.slug}/menu`} external variant="outline">
            <ExternalLink className="size-3.5" /> View Customer Menu
          </LinkButton>
        }
      />
      <MenuItemForm
        actor={actor}
        clientId={client.id}
        categories={load.data.cats.map((c) => ({ id: c.id, name: c.name, active: c.active }))}
        item={load.data.item}
      />
    </>
  );
}
