"use client";

import { Database, ShieldCheck } from "lucide-react";
import { WorkspacePage, opToast } from "@/components/admin-page";
import { useAuth } from "@/context/AuthContext";
import { Avatar, Badge, Button, Card, PageHeader, SectionTitle, SkeletonRows, shortTime } from "@/components/ui";
import { adminService } from "@/lib/firebase/services";
import { seedDemoClients } from "@/lib/firebase/seed";
import { ConnectionDiagnostic } from "@/components/connection-diagnostic";
import type { Actor } from "@/lib/firebase/types";
import { runOp, useLoad } from "@/lib/use-load";
import { SUPER_ADMIN_UID } from "@/lib/firebase/client";

const ROLE_COPY: Record<string, string> = {
  SUPER_ADMIN: "Platform-level access: every store, global activity and admin accounts.",
  CLIENT_ADMIN: "Owns exactly ONE store. No store list, no store switcher — everything is scoped to that store.",
  MANAGER: "Operational management of the one store assigned to them. Cannot create or suspend stores.",
};

export default function SettingsPage() {
  return <WorkspacePage>{({ actor, role }) => <Settings actor={actor} role={role} />}</WorkspacePage>;
}

function Settings({ actor, role }: { actor: Actor; role: string }) {
  const { admin, logout } = useAuth();
  const adminsLoad = useLoad(() => (role === "SUPER_ADMIN" ? adminService.listAdmins() : Promise.resolve([])), [role]);

  return (
    <>
      <PageHeader
        eyebrow="Workspace settings · Firebase project cafe-review7"
        title="Settings"
        subtitle="Your admin identity, role permissions and platform security posture."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {role === "SUPER_ADMIN" ? (
            <Card className="p-5">
              <SectionTitle right={<Badge tone="neutral">{adminsLoad.data?.length ?? 0} accounts</Badge>}>
                Admin accounts (admins collection)
              </SectionTitle>
              {adminsLoad.loading ? (
                <SkeletonRows rows={2} />
              ) : (
                <ul className="divide-y divide-linen">
                  {(adminsLoad.data ?? []).map((a) => (
                    <li key={a.id} className="flex items-center gap-3 py-2.5">
                      <Avatar name={a.name} size={38} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-espresso">
                          {a.name} {a.uid === SUPER_ADMIN_UID ? <Badge tone="gold">root</Badge> : null}
                        </p>
                        <p className="truncate text-[11px] text-mocha">
                          {a.email || a.uid} · last login {shortTime(a.lastLoginAt ?? null)}
                        </p>
                      </div>
                      <Badge tone="ink">{a.role.replace("_", " ")}</Badge>
                      <Badge tone={a.status === "ACTIVE" ? "green" : "red"}>{a.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : null}

          <Card className="p-5">
            <SectionTitle>Role permissions</SectionTitle>
            <ul className="space-y-3">
              {Object.entries(ROLE_COPY).map(([r, copy]) => (
                <li key={r} className="rounded-xl border border-linen bg-paper px-4 py-3">
                  <p className="label-caps">{r.replace("_", " ")}</p>
                  <p className="mt-1 text-[12.5px] text-mocha">{copy}</p>
                </li>
              ))}
            </ul>
          </Card>

          {role === "SUPER_ADMIN" ? <ConnectionDiagnostic /> : null}

          {role === "SUPER_ADMIN" ? (
            <Card className="p-5">
              <SectionTitle>Demo workspace</SectionTitle>
              <p className="mb-3 text-[12px] text-mocha">
                Creates the BAKE, Sharma Cafe and Royal Restaurant demo stores in Firestore with menus, customers, loyalty, reviews and 30
                days of metrics. Idempotent — existing slugs are skipped.
              </p>
              <Button
                variant="outline"
                onClick={() => runOp(() => seedDemoClients(actor), opToast(), "Demo stores created in cafe-review7")}
              >
                <Database className="size-4" /> Use Demo Store
              </Button>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle>Your profile</SectionTitle>
            <div className="flex items-center gap-3">
              <Avatar name={admin?.name ?? "Admin"} size={54} />
              <div>
                <p className="display-num text-xl text-espresso">{admin?.name}</p>
                <p className="text-[12px] text-mocha">{admin?.email || admin?.uid}</p>
                <Badge tone="ink">{role.replace("_", " ")}</Badge>
              </div>
            </div>
            <button
              className="mt-4 w-full rounded-xl border border-ember/30 bg-ember/8 px-4 py-2.5 text-[12px] font-bold text-ember transition-colors hover:bg-ember hover:text-cream"
              onClick={() => logout().then(() => (window.location.href = "/admin/login"))}
            >
              Sign out of this device
            </button>
          </Card>

          <Card className="p-5">
            <SectionTitle>Security</SectionTitle>
            <p className="flex items-start gap-2 text-[11.5px] text-mocha">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-stamp" />
              <span>
                Authentication is Firebase Auth; authorization is the <span className="font-mono">admins/{"{uid}"}</span>{" "}
                role document plus Firestore Security Rules (see <span className="font-mono">firestore.rules</span>).
                Every tenant document carries <span className="font-semibold text-espresso">clientId</span>, Wi-Fi
                passwords are never written to Firestore, and AI provider keys stay server-side.
              </span>
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
