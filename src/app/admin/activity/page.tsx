"use client";

import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { WorkspacePage } from "@/components/admin-page";
import { useAuth } from "@/context/AuthContext";
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, SkeletonRows, shortTime } from "@/components/ui";
import { activityService, clientService } from "@/lib/firebase/services";
import { useLoad } from "@/lib/use-load";

export default function GlobalActivityPage() {
  return <WorkspacePage>{({ role }) => <GlobalActivity role={role} />}</WorkspacePage>;
}

function GlobalActivity({ role }: { role: string }) {
  const { allowedClientIds } = useAuth();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("ALL");

  const load = useLoad(
    async () => {
      const [rows, clients] = await Promise.all([
        activityService.global(allowedClientIds),
        clientService.listAllowed(allowedClientIds),
      ]);
      return { rows, clients };
    },
    [allowedClientIds],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (load.data?.rows ?? []).filter(
      (r) =>
        (scope === "ALL" || r.clientId === scope) &&
        (!needle || r.target.toLowerCase().includes(needle) || r.action.toLowerCase().includes(needle)),
    );
  }, [load.data, q, scope]);

  const clientName = (id: string | null) =>
    id ? (load.data?.clients.find((c) => c.id === id)?.businessName ?? "Unknown client") : null;

  return (
    <>
      <PageHeader
        eyebrow={role === "SUPER_ADMIN" ? "Platform-wide · every business" : "Restricted to the businesses assigned to you"}
        title="Global Activity"
        subtitle="Cross-tenant audit trail from the activityLogs collection. Client admins only ever see their own businesses."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity…" className="sm:max-w-xs" />
        <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-xl border border-linen bg-paper px-3 py-2.5 text-[12px]">
          <option value="ALL">All businesses</option>
          {(load.data?.clients ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.businessName}
            </option>
          ))}
        </select>
      </div>

      {load.loading && !load.data ? (
        <SkeletonRows rows={4} />
      ) : load.error && !load.data ? (
        <ErrorState message={load.error} action={<Button onClick={load.reload}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState title="No activity yet" body="Platform and tenant actions will stream into this log." icon={<Activity className="size-5" />} />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <Card key={r.id} className="p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-espresso">{r.action.replace(/_/g, " ")}</span>
                {r.clientId ? <Badge tone="neutral">{clientName(r.clientId)}</Badge> : <Badge tone="ink">Platform</Badge>}
              </div>
              <p className="mt-1 text-[12px] text-mocha">{r.target || "—"}</p>
              <p className="mt-1 text-[11px] text-mocha">
                {r.actorName} ({r.actorRole}) · {shortTime(r.createdAt)} · <span className="font-mono">{r.transactionId || "—"}</span>
              </p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
