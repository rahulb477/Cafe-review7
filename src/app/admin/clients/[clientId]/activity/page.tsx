"use client";

import { use, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { ClientPage, type ClientCtx } from "@/components/admin-page";
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, SkeletonRows, shortTime } from "@/components/ui";
import { activityService } from "@/lib/firebase/services";
import { useLoad } from "@/lib/use-load";

export default function ActivityPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <ActivityLog ctx={ctx} />}</ClientPage>;
}

function ActivityLog({ ctx }: { ctx: ClientCtx }) {
  const { client } = ctx;
  const [q, setQ] = useState("");
  const [action, setAction] = useState("ALL");
  const load = useLoad(() => activityService.forClient(client.id), [client.id]);

  const actions = useMemo(() => ["ALL", ...Array.from(new Set((load.data ?? []).map((r) => r.action)))], [load.data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (load.data ?? []).filter(
      (r) =>
        (action === "ALL" || r.action === action) &&
        (!needle || r.target.toLowerCase().includes(needle) || r.actorName.toLowerCase().includes(needle)),
    );
  }, [load.data, q, action]);

  return (
    <>
      <PageHeader
        eyebrow={`${load.data?.length ?? 0} entries · append-only activityLogs`}
        title="Activity Log"
        subtitle="Every admin and staff action with actor UID, role, target and transaction ID. Records are never edited or deleted."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search targets or actors…" className="sm:max-w-xs" />
        <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-xl border border-linen bg-paper px-3 py-2.5 text-[12px]">
          {actions.map((a) => (
            <option key={a} value={a}>
              {a.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {load.loading && !load.data ? (
        <SkeletonRows rows={4} />
      ) : load.error && !load.data ? (
        <ErrorState message={load.error} action={<Button onClick={load.reload}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No activity yet"
          body="Actions taken in this workspace will be listed here, newest first."
          icon={<ClipboardList className="size-5" />}
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <Card key={r.id} className="p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12px] font-bold text-espresso">{r.action.replace(/_/g, " ")}</span>
                <Badge tone={r.actorRole === "SUPER_ADMIN" ? "ink" : "neutral"}>{r.actorRole}</Badge>
              </div>
              <p className="mt-1 text-[12px] text-mocha">{r.target || "—"}</p>
              <p className="mt-1 text-[11px] text-mocha">
                {r.actorName} · {shortTime(r.createdAt)} · <span className="font-mono">{r.transactionId || "—"}</span>
              </p>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
