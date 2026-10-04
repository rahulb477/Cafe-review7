"use client";

import { use } from "react";
import { WorkspacePage } from "@/components/admin-page";
import { useAuth } from "@/context/AuthContext";
import { LinkButton } from "@/components/ui";
import { ErrorState, PageHeader, SkeletonRows } from "@/components/ui";
import { StoreSetupWizard } from "@/components/client-wizard";
import { clientService, type StoreFormData } from "@/lib/firebase/services";
import { useLoad } from "@/lib/use-load";
import type { Actor } from "@/lib/firebase/types";

export default function StoreSetupPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const { draft } = use(searchParams);
  return (
    <WorkspacePage>
      {({ actor, role }) => (
        <>
          <PageHeader
            eyebrow="Store Setup"
            title={draft ? "Resume Store Setup" : "Set Up Store"}
            subtitle="Business, branding, theme, menu, Google Reviews, social, Wi-Fi, loyalty and AI — save a draft any time, publish when ready."
          />
          <SetupGate actor={actor} role={role} draft={draft}>
          {role === "MANAGER" && !draft ? (
            <ErrorState message="Managers cannot create new stores. Ask a Super Admin or Client Admin to set up the store — you can manage existing assigned stores from the Stores list." />
          ) : draft ? (
            <ResumeDraft actor={actor} draftId={draft} />
          ) : (
            <StoreSetupWizard actor={actor} />
          )}
          </SetupGate>
        </>
      )}
    </WorkspacePage>
  );
}

function ResumeDraft({ actor, draftId }: { actor: Actor; draftId: string }) {
  const load = useLoad(() => clientService.loadDraft(draftId), [draftId]);
  if (load.loading && !load.data) return <SkeletonRows rows={4} />;
  if (load.error && !load.data) return <ErrorState message={load.error} />;
  if (!load.data) return <ErrorState message={`Draft ${draftId} was not found in Firestore.`} />;
  const { status: _status, ...form } = load.data;
  return <StoreSetupWizard actor={actor} initialDraft={form as StoreFormData} initialStoreId={draftId} />;
}

/**
 * ONE ADMIN = ONE STORE. A normal admin who already owns a store cannot open a
 * second setup wizard — they are pointed at their existing store instead.
 * Resuming their own draft is still allowed.
 */
function SetupGate({
  actor,
  role,
  draft,
  children,
}: {
  actor: Actor;
  role: string;
  draft?: string;
  children: React.ReactNode;
}) {
  const { primaryStoreId } = useAuth();
  void actor;
  const locked = role !== "SUPER_ADMIN" && Boolean(primaryStoreId) && draft !== primaryStoreId;
  if (!locked) return <>{children}</>;
  return (
    <ErrorState
      message="Store Setup is already complete for this account — each admin manages exactly one store."
      action={<LinkButton href={`/admin/clients/${primaryStoreId}`}>Open my store</LinkButton>}
    />
  );
}
