"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientPage, PageSkeleton, type ClientCtx } from "@/components/admin-page";
import { StoreSetupWizard } from "@/components/client-wizard";
import { ErrorState, PageHeader } from "@/components/ui";
import { clientService, type StoreFormData } from "@/lib/firebase/services";
import { useLoad } from "@/lib/use-load";

/**
 * Store Setup for the admin's OWN single store.
 *
 * This is the "store management" half of the old Stores experience, now
 * scoped to the store the admin owns: it always edits clients/{clientId}
 * (never creates another one), so a draft store can still be finished and
 * published after the first-time wizard was left early.
 */
export default function StoreScopedSetupPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <StoreSetup ctx={ctx} />}</ClientPage>;
}

function StoreSetup({ ctx }: { ctx: ClientCtx }) {
  const { actor, client } = ctx;
  const router = useRouter();
  const load = useLoad(() => clientService.loadDraft(client.id), [client.id]);
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (!published) return;
    const t = setTimeout(() => router.replace(`/admin/clients/${client.id}`), 1200);
    return () => clearTimeout(t);
  }, [published, router, client.id]);

  return (
    <>
      <PageHeader
        eyebrow={client.status === "DRAFT" ? "Draft store" : `Live at /${client.slug}`}
        title="Store Setup"
        subtitle="Update business, branding, theme, menu, Google Reviews, social, Wi-Fi, loyalty and AI. Publishing updates THIS store — it never creates a duplicate."
      />
      {load.loading && !load.data ? (
        <PageSkeleton />
      ) : load.error && !load.data ? (
        <ErrorState message={load.error} />
      ) : !load.data ? (
        <ErrorState message="This store was not found in Firestore." />
      ) : (
        <StoreSetupWizard
          actor={actor}
          initialStoreId={client.id}
          initialDraft={stripStatus(load.data)}
          onPublished={() => setPublished(true)}
        />
      )}
    </>
  );
}

function stripStatus(data: StoreFormData & { status: unknown }): StoreFormData {
  const { status: _status, ...form } = data;
  return form as StoreFormData;
}
