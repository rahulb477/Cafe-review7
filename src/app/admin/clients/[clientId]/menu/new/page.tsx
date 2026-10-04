"use client";

import { use } from "react";
import { ClientPage } from "@/components/admin-page";
import { MenuItemForm } from "@/components/menu-item-form";
import { PageHeader } from "@/components/ui";
import { menuService } from "@/lib/firebase/services";
import { useLoad } from "@/lib/use-load";

export default function NewMenuItemPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return (
    <ClientPage clientId={clientId}>
      {({ actor, client }) => <NewItem actor={actor} clientId={client.id} displayName={client.displayName} />}
    </ClientPage>
  );
}

function NewItem({ actor, clientId, displayName }: { actor: { uid: string; name: string; role: string }; clientId: string; displayName: string }) {
  const cats = useLoad(() => menuService.categories(clientId), [clientId]);
  return (
    <>
      <PageHeader
        eyebrow={displayName}
        title="Add Menu Item"
        subtitle="Upload an image, set the price and publish — it lands on the customer menu instantly."
      />
      <MenuItemForm
        actor={actor}
        clientId={clientId}
        categories={(cats.data ?? []).map((c) => ({ id: c.id, name: c.name, active: c.active }))}
        item={null}
      />
    </>
  );
}
