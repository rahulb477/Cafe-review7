"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ExternalLink, QrCode, Users } from "lucide-react";
import { WorkspacePage, opToast } from "@/components/admin-page";
import { useAuth } from "@/context/AuthContext";
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
  SkeletonRows,
} from "@/components/ui";
import { clientService } from "@/lib/firebase/services";
import type { Actor, ClientDoc } from "@/lib/firebase/types";
import { runOp, useLoad } from "@/lib/use-load";

/**
 * PLATFORM-LEVEL Stores list — SUPER_ADMIN only.
 *
 * Normal admins own exactly ONE store, so this page is not part of their
 * experience: they are redirected to their dashboard (and /stores, the alias,
 * does the same). Store management for a normal admin happens inside their
 * own store pages (clientId is always their own).
 */
export default function ClientsPage() {
  return <WorkspacePage>{({ actor, role }) => <Clients actor={actor} role={role} />}</WorkspacePage>;
}

function Clients({ actor, role }: { actor: Actor; role: string }) {
  const router = useRouter();
  const { allowedClientIds } = useAuth();
  const isSuper = role === "SUPER_ADMIN";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");

  // A normal admin can never browse the platform store list.
  useEffect(() => {
    if (!isSuper) router.replace("/admin");
  }, [isSuper, router]);

  const { loading, error, data, reload } = useLoad(
    () => (isSuper ? clientService.listAllowed(allowedClientIds) : Promise.resolve([] as ClientDoc[])),
    [allowedClientIds, isSuper],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data ?? []).filter(
      (c) =>
        (status === "ALL" || c.status === status || (status === "PUBLISHED" && c.status === "ACTIVE")) &&
        (!needle || c.businessName.toLowerCase().includes(needle) || c.slug.includes(needle)),
    );
  }, [data, q, status]);

  if (!isSuper) {
    return (
      <div className="space-y-4">
        <SkeletonRows rows={3} />
        <p className="label-caps">Stores are not listed for single-store admins — opening your dashboard…</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={`${data?.length ?? 0} stores on the platform`}
        title="Stores"
        subtitle="Platform-level view. Each store is fully isolated; normal admins only ever see their own."
        actions={<LinkButton href="/admin/clients/new">Set Up Store</LinkButton>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search stores…" className="sm:max-w-xs" />
        {["ALL", "PUBLISHED", "DRAFT", "SUSPENDED", "ARCHIVED"].map((value) => (
          <button
            key={value}
            onClick={() => setStatus(value)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
              status === value ? "bg-espresso text-cream" : "bg-paper text-mocha hover:bg-linen"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonRows rows={3} />
      ) : error ? (
        <ErrorState message={error} action={<Button onClick={reload}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No stores match"
          body="Adjust your filters, or set up a new store to get started."
          icon={<Building2 className="size-5" />}
          action={<LinkButton href="/admin/clients/new">Set Up Store</LinkButton>}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={c.businessName} src={c.logoUrl} size={44} square />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-espresso">{c.businessName}</p>
                    <p className="truncate text-[11px] text-mocha">/{c.slug} · {c.tagline || "—"}</p>
                  </div>
                  <Badge tone={c.status === "ACTIVE" || c.status === "PUBLISHED" ? "green" : c.status === "DRAFT" ? "gold" : c.status === "SUSPENDED" ? "red" : "neutral"}>{c.status}</Badge>
                </div>
                <RowActions client={c} actor={actor} reload={reload} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function RowActions({ client, actor, reload }: { client: ClientDoc; actor: Actor; reload: () => void }) {
  if (client.status === "DRAFT") {
    return (
      <div className="flex flex-wrap gap-1.5">
        <LinkButton href={`/admin/clients/${client.id}/setup`} size="sm">
          Resume Setup
        </LinkButton>
        <LinkButton href={`/admin/clients/${client.id}`} size="sm" variant="outline">
          Open
        </LinkButton>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      <LinkButton href={`/admin/clients/${client.id}`} size="sm">
        Open
      </LinkButton>
      <LinkButton href={`/admin/clients/${client.id}/branding`} size="sm" variant="outline">
        Edit
      </LinkButton>
      <LinkButton href={`/admin/clients/${client.id}/qr`} size="sm" variant="outline">
        <QrCode className="size-3.5" /> QR
      </LinkButton>
      <LinkButton href={`/${client.slug}`} size="sm" variant="quiet" external>
        <ExternalLink className="size-3.5" /> Customer
      </LinkButton>
      <LinkButton href={`/staff/${client.slug}`} size="sm" variant="quiet" external>
        <Users className="size-3.5" /> Staff
      </LinkButton>
      <Button
        size="sm"
        variant={client.status === "SUSPENDED" ? "outline" : "danger"}
        onClick={() =>
          runOp(
            () => clientService.setStatus(actor, client.id, client.status === "SUSPENDED" ? "PUBLISHED" : "SUSPENDED"),
            opToast(reload),
            client.status === "SUSPENDED" ? "Store reactivated" : "Store suspended",
          )
        }
      >
        {client.status === "SUSPENDED" ? "Activate" : "Suspend"}
      </Button>
    </div>
  );
}
