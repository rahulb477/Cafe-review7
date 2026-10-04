"use client";

import { use, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { ClientPage, type ClientCtx } from "@/components/admin-page";
import { StaffRowActions } from "@/components/staff-actions";
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
  shortTime,
} from "@/components/ui";
import { staffService } from "@/lib/firebase/services";
import { useLoad } from "@/lib/use-load";

export default function StaffPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <Staff ctx={ctx} />}</ClientPage>;
}

function Staff({ ctx }: { ctx: ClientCtx }) {
  const { client, actor } = ctx;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const load = useLoad(() => staffService.list(client.id), [client.id]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (load.data ?? []).filter(
      (s) =>
        (status === "ALL" || s.status === status) &&
        (!needle || s.name.toLowerCase().includes(needle) || s.email.includes(needle)),
    );
  }, [load.data, q, status]);

  return (
    <>
      <PageHeader
        eyebrow={`${load.data?.length ?? 0} accounts · Firebase Auth sign in at /staff/${client.slug}`}
        title="Staff Management"
        subtitle="Create accounts, change roles, disable access or send password resets. Credentials live only in Firebase Auth."
        actions={<LinkButton href={`/admin/clients/${client.id}/staff/new`}>+ Add Staff</LinkButton>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff…" className="sm:max-w-xs" />
        {["ALL", "ACTIVE", "INACTIVE"].map((value) => (
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

      {load.loading && !load.data ? (
        <SkeletonRows rows={3} />
      ) : load.error && !load.data ? (
        <ErrorState message={load.error} action={<Button onClick={load.reload}>Retry</Button>} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No staff accounts"
          body="Create the first account so your team can run the counter from the staff app."
          icon={<Users className="size-5" />}
          action={<LinkButton href={`/admin/clients/${client.id}/staff/new`}>+ Add Staff</LinkButton>}
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((s) => (
            <Card key={s.id} className="p-3.5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={s.name} size={42} />
                  <div className="min-w-0">
                    <p className="truncate font-bold text-espresso">{s.name}</p>
                    <p className="truncate text-[11px] text-mocha">
                      {s.staffId} · {s.role.replace("_", " ")} · {s.email}
                    </p>
                    <p className="truncate text-[11px] text-mocha">Last login {shortTime(s.lastLoginAt ?? null)}</p>
                  </div>
                  <Badge tone={s.status === "ACTIVE" ? "green" : "red"}>{s.status}</Badge>
                </div>
                <StaffRowActions actor={actor} clientId={client.id} clientSlug={client.slug} staff={s} reload={load.reload} />
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-5 p-4">
        <p className="label-caps mb-2">Security notes</p>
        <ul className="list-inside list-disc space-y-1 text-[11.5px] text-mocha">
          <li>Staff credentials are Firebase Auth accounts — plaintext passwords are never stored anywhere.</li>
          <li>“Reset” sends Firebase’s official password-reset email to the staff member.</li>
          <li>Disabling flips the Firestore status; the staff app checks it on every sign-in and session.</li>
          <li>Each staff document carries clientId, so a BAKE account can never operate Sharma Cafe.</li>
        </ul>
      </Card>
    </>
  );
}
