"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GuardScreen, useAdminGuard } from "@/context/AuthContext";
import { AdminShell, type ShellClient } from "@/components/shell";
import { ErrorState, Skeleton } from "@/components/ui";
import { emitToast } from "@/components/interactive";
import { clientService } from "@/lib/firebase/services";
import type { Actor, ClientDoc, ClientSettingsDoc } from "@/lib/firebase/types";

export type ClientCtx = {
  actor: Actor;
  role: string;
  client: ClientDoc;
  settings: ClientSettingsDoc;
  reloadClient: () => void;
};

/** Toast + reload helper shared by every mutation on admin pages. */
export function opToast(reload?: () => void) {
  return (ok: boolean, message: string) => {
    emitToast(ok ? "success" : "error", message);
    if (ok) reload?.();
  };
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** Workspace-level page (no specific tenant). */
export function WorkspacePage({ children }: { children: (ctx: { actor: Actor; role: string }) => ReactNode }) {
  const guard = useAdminGuard();
  if (guard.phase !== "ready" || !guard.admin) return <GuardScreen guard={guard} />;
  const actor: Actor = { uid: guard.admin.uid, name: guard.admin.name, role: guard.admin.role };
  return (
    <AdminShell admin={{ name: guard.admin.name, email: guard.admin.email ?? "", role: guard.admin.role }} client={null}>
      {children({ actor, role: guard.admin.role })}
    </AdminShell>
  );
}

/**
 * Tenant-scoped page: verifies assignment and subscribes to the client
 * document in real time — branding, loyalty and status changes from any
 * admin session appear immediately without a refresh.
 */
export function ClientPage({
  clientId,
  children,
}: {
  clientId: string;
  children: (ctx: ClientCtx) => ReactNode;
}) {
  const guard = useAdminGuard(clientId);
  const ready = guard.phase === "ready" && !guard.forbidden && Boolean(guard.admin);
  const [live, setLive] = useState<{
    loading: boolean;
    error: string | null;
    data: Awaited<ReturnType<typeof clientService.get>> | null;
  }>({ loading: true, error: null, data: null });

  useEffect(() => {
    if (!ready) return;
    return clientService.watch(
      clientId,
      (data) => setLive({ loading: false, error: null, data }),
      (message) => setLive((s) => ({ loading: false, error: message, data: s.data })),
    );
  }, [clientId, ready]);

  const { loading, error, data } = live;
  const reload = () => undefined; // live subscription keeps data fresh

  if (guard.phase !== "ready" || guard.forbidden || !guard.admin) return <GuardScreen guard={guard} />;
  const admin = guard.admin;
  const actor: Actor = { uid: admin.uid, name: admin.name, role: admin.role };

  const shellClient: ShellClient =
    data?.client != null
      ? {
          id: data.client.id,
          name: data.client.businessName,
          displayName: data.client.displayName,
          slug: data.client.slug,
          status: data.client.status,
          logoUrl: data.client.logoUrl,
        }
      : null;

  return (
    <AdminShell admin={{ name: admin.name, email: admin.email ?? "", role: admin.role }} client={shellClient}>
      {loading && !data ? (
        <PageSkeleton />
      ) : error && !data ? (
        <ErrorState message={error} />
      ) : !data?.client || !data.settings ? (
        <ErrorState message="This business (or its settings document) was not found in Firestore." />
      ) : (
        children({ actor, role: admin.role, client: data.client, settings: data.settings, reloadClient: reload })
      )}
    </AdminShell>
  );
}
