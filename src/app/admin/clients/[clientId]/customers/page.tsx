"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import { ClientPage, type ClientCtx } from "@/components/admin-page";
import { AddCustomerModal } from "@/components/staff-actions";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  SkeletonRows,
  shortTime,
} from "@/components/ui";
import { customerService } from "@/lib/firebase/services";
import { useLoad } from "@/lib/use-load";

export default function CustomersPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <Customers ctx={ctx} />}</ClientPage>;
}

function Customers({ ctx }: { ctx: ClientCtx }) {
  const { client, settings, actor } = ctx;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("ALL");
  const load = useLoad(() => customerService.list(client.id), [client.id]);
  const target = settings.stampTarget;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (load.data ?? []).filter((c) => {
      const stamps = c.account?.stamps ?? 0;
      if (filter === "REWARD" && stamps < target) return false;
      if (filter === "ACTIVE" && c.totalVisits <= 3) return false;
      if (filter === "NEW" && c.totalVisits > 3) return false;
      return !needle || c.name.toLowerCase().includes(needle) || c.code.toLowerCase().includes(needle);
    });
  }, [load.data, q, filter, target]);

  return (
    <>
      <PageHeader
        eyebrow={`${load.data?.length ?? 0} guests · ${target} stamps per reward`}
        title="Customer Management"
        subtitle="Loyalty progress, visits and full stamp history for every guest of this business."
        actions={<AddCustomerModal actor={actor} clientId={client.id} reload={load.reload} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or ID…" className="sm:max-w-xs" />
        {[
          ["ALL", "All"],
          ["ACTIVE", "Active"],
          ["REWARD", "With reward"],
          ["NEW", "New"],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
              filter === value ? "bg-espresso text-cream" : "bg-paper text-mocha hover:bg-linen"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {load.loading && !load.data ? (
        <SkeletonRows rows={4} />
      ) : load.error && !load.data ? (
        <ErrorState message={load.error} action={<Button onClick={load.reload}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No customers yet"
          body="Guests appear here the first time staff stamp their card at the counter."
          icon={<Users className="size-5" />}
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((c) => {
            const stamps = c.account?.stamps ?? 0;
            return (
              <Link key={c.id} href={`/admin/clients/${client.id}/customers/${c.id}`} className="block">
                <Card className="p-3.5 transition-all duration-150 hover:-translate-y-0.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-espresso">{c.name}</p>
                      <p className="truncate text-[11px] text-mocha">
                        {c.code} · {stamps}/{target} stamps · {c.totalVisits} visits · last visit {shortTime(c.lastVisitAt)}
                      </p>
                    </div>
                    {stamps >= target ? <Badge tone="gold">Reward ready</Badge> : null}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
