"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "firebase/auth";
import { Eye, EyeOff, Gift, Lock, LogOut, Mail, Stamp } from "lucide-react";
import { authErrorMessage, signInWithPassword, signOutUser, watchAuth } from "@/lib/firebase/auth";
import { clientService, customerService, loyaltyService, rewardService, staffService } from "@/lib/firebase/services";
import type { CustomerWithLoyalty } from "@/lib/firebase/services";
import { isLiveStatus } from "@/lib/firebase/types";
import type { StaffDoc } from "@/lib/firebase/types";
import { ToastHost, emitToast } from "@/components/interactive";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SectionTitle,
  Skeleton,
  StampCard,
  shortTime,
} from "@/components/ui";
import { runOp, useLoad } from "@/lib/use-load";

/** STAFF APP — /staff/{clientSlug} · Firebase Auth + Firestore (cafe-review7) */
export default function StaffAppPage({ params }: { params: Promise<{ clientSlug: string }> }) {
  const { clientSlug } = use(params);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [staffDoc, setStaffDoc] = useState<StaffDoc | null>(null);

  useEffect(() => {
    const unsub = watchAuth(async (u) => {
      setUser(u);
      if (u) {
        const doc = await staffService.byUid(u.uid).catch(() => null);
        setStaffDoc(doc);
      } else {
        setStaffDoc(null);
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  const bundleLoad = useLoad(() => clientService.publicBundle(clientSlug), [clientSlug]);
  const bundle = bundleLoad.data;

  if (!authReady || (bundleLoad.loading && !bundle)) {
    return (
      <main className="grid min-h-dvh place-items-center bg-cream px-6">
        <div className="w-full max-w-sm space-y-3 text-center">
          <p className="label-caps">Loading staff app…</p>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="mx-auto h-10 w-3/4" />
        </div>
      </main>
    );
  }

  if (!bundle) {
    return (
      <main className="grid min-h-dvh place-items-center bg-cream px-6 text-center">
        <div>
          <h1 className="display-num text-[32px] text-espresso">Not on Grounds</h1>
          <p className="mt-2 text-[13px] text-mocha">
            No business is published at <span className="font-mono">/{clientSlug}</span>.
          </p>
          <Link href="/admin" className="mt-4 inline-block text-[12px] font-bold text-caramel underline">
            Go to the admin console
          </Link>
        </div>
      </main>
    );
  }

  const { client, settings } = bundle;
  const primary = settings?.primaryColor ?? "#3A2116";
  const secondary = settings?.secondaryColor ?? "#5A3524";
  const accent = settings?.accentColor ?? "#C0651E";

  const assigned = (s: StaffDoc) => s.clientId === client.id || (s.clientIds ?? []).includes(client.id);
  const validStaff = user && staffDoc && assigned(staffDoc) && staffDoc.status === "ACTIVE" ? staffDoc : null;
  const wrongClient = user && staffDoc && !assigned(staffDoc);
  const disabled = user && staffDoc && staffDoc.status !== "ACTIVE";

  if (!validStaff) {
    return (
      <ToastHost>
        <main
          className="grid min-h-dvh place-items-center px-5 py-10"
          style={{ background: `linear-gradient(160deg, ${primary}, ${secondary})` }}
        >
          <div className="mx-auto w-full max-w-[400px]">
            <Card className="p-6">
              <div className="mb-5 text-center">
                {client.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={client.logoUrl} alt={client.businessName} className="mx-auto mb-3 size-16 rounded-2xl object-cover" />
                ) : null}
                <p className="label-caps" style={{ color: accent }}>
                  {client.businessName} · Staff
                </p>
                <h1 className="display-num mt-1 text-[30px] leading-none" style={{ color: primary }}>
                  Counter Sign In
                </h1>
                <p className="mt-2 text-[12px] text-mocha">Use the Firebase account your manager created for you.</p>
              </div>

              {wrongClient ? (
                <ErrorNote text="This staff account belongs to a different business. Sign out and use the correct one." />
              ) : null}
              {disabled ? <ErrorNote text="This account has been disabled. Ask your manager." /> : null}
              {user && !staffDoc ? (
                <ErrorNote text="No staff profile found for this account. An admin must create it first." />
              ) : null}

              {user ? (
                <Button className="w-full" variant="danger" onClick={() => signOutUser()}>
                  <LogOut className="size-3.5" /> Sign out and try another account
                </Button>
              ) : (
                <StaffLoginForm />
              )}
            </Card>
          </div>
        </main>
      </ToastHost>
    );
  }

  return (
    <ToastHost>
      <StaffDashboard
        clientSlug={clientSlug}
        staff={validStaff}
        clientId={client.id}
        blocked={!isLiveStatus(client.status)}
        clientStatus={client.status}
        branding={{ primary, secondary, logoUrl: client.logoUrl, name: client.businessName }}
        loyalty={{
          enabled: Boolean(settings?.loyaltyEnabled),
          target: settings?.stampTarget ?? 8,
          rewardName: settings?.rewardName ?? "Reward",
        }}
      />
    </ToastHost>
  );
}

function ErrorNote({ text }: { text: string }) {
  return <p className="mb-3 rounded-xl bg-ember/8 px-3 py-2 text-[12px] font-semibold text-ember">{text}</p>;
}

function StaffLoginForm() {
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await signInWithPassword(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
      // onAuthStateChanged resolves the staffUsers/{uid} document.
    } catch (err) {
      setError(authErrorMessage(err));
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Email address">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mocha" />
          <Input name="email" type="email" required autoComplete="username" placeholder="you@bake.com" className="pl-9" />
        </div>
      </Field>
      <Field label="Password">
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mocha" />
          <Input name="password" type={show ? "text" : "password"} required className="pl-9 pr-10" />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-mocha hover:bg-linen"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      {error ? <ErrorNote text={error} /> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign In →"}
      </Button>
    </form>
  );
}

function StaffDashboard({
  clientSlug,
  staff,
  clientId,
  blocked,
  clientStatus,
  branding,
  loyalty,
}: {
  clientSlug: string;
  staff: StaffDoc;
  clientId: string;
  blocked: boolean;
  clientStatus: string;
  branding: { primary: string; secondary: string; logoUrl: string | null; name: string };
  loyalty: { enabled: boolean; target: number; rewardName: string };
}) {
  // Real-time: stamps added anywhere (another till, the admin console)
  // appear on this counter immediately via Firestore listeners.
  const [customers, setCustomers] = useState<CustomerWithLoyalty[] | null>(null);
  useEffect(
    () => customerService.watchList(clientId, (rows) => setCustomers(rows.slice(0, 12))),
    [clientId],
  );
  const load = useLoad(
    async () => ({ redemptions: (await rewardService.redemptions(clientId)).slice(0, 8) }),
    [clientId],
  );

  const actor = { uid: staff.uid, name: `${staff.name} (${staff.role})`, role: "STAFF" };
  const done = (ok: boolean, message: string) => {
    emitToast(ok ? "success" : "error", message);
    if (ok) load.reload();
  };

  return (
    <main className="min-h-dvh bg-cream pb-16">
      <header className="px-5 py-5 text-white" style={{ background: `linear-gradient(120deg, ${branding.primary}, ${branding.secondary})` }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.name} className="size-11 rounded-xl object-cover" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="label-caps !text-white/60">{branding.name} · counter</p>
            <p className="display-num text-[22px] leading-none">Hello, {staff.name.split(" ")[0]}</p>
          </div>
          <button
            className="rounded-xl bg-white/15 px-3 py-2 text-[11px] font-bold text-white"
            onClick={() => signOutUser().then(() => window.location.reload())}
          >
            <LogOut className="mr-1 inline size-3.5" /> Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 pt-6">
        {blocked ? (
          <Card className="mb-5 p-5">
            <SectionTitle>Operations paused</SectionTitle>
            <p className="text-[12.5px] text-mocha">
              This business is currently {clientStatus.toLowerCase()}. Operational actions are disabled until an admin
              reactivates it — historical data stays intact.
            </p>
          </Card>
        ) : null}

        <PageHeader
          eyebrow={staff.role.replace("_", " ")}
          title="Today at the counter"
          subtitle={loyalty.enabled ? `${loyalty.target} stamps → ${loyalty.rewardName}` : "Loyalty is switched off."}
        />

        <Card className="mb-5 p-5">
          <SectionTitle right={<Badge tone="gold">{loyalty.rewardName}</Badge>}>Loyalty programme</SectionTitle>
          <StampCard stamps={0} target={loyalty.target} rewardName={loyalty.rewardName} size={34} />
        </Card>

        <Card className="p-5">
          <SectionTitle right={<span className="text-[11px] text-mocha">{customers?.length ?? 0} guests · live</span>}>
            Stamp a guest
          </SectionTitle>
          {customers === null ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : !customers.length ? (
            <EmptyState title="No guests yet" body="Guests appear here as soon as they join the loyalty card." icon={<Stamp className="size-5" />} />
          ) : (
            <ul className="divide-y divide-linen">
              {customers.map((row) => {
                const stamps = row.account?.stamps ?? 0;
                return (
                  <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Avatar name={row.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-espresso">
                        {row.name} <span className="text-[11px] text-mocha">{row.code}</span>
                      </p>
                      <p className="text-[11px] text-mocha">
                        {stamps}/{loyalty.target} stamps · last visit {shortTime(row.lastVisitAt)}
                      </p>
                    </div>
                    {stamps >= loyalty.target ? <Badge tone="gold">Reward ready</Badge> : null}
                    {!blocked ? (
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          onClick={() =>
                            runOp(
                              () => loyaltyService.adjust(actor, clientId, row.id, 1, "Visit stamp (counter)", "STAFF"),
                              done,
                              "Stamp added",
                            )
                          }
                        >
                          <Stamp className="size-3.5" /> Add stamp
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={stamps < loyalty.target}
                          onClick={() =>
                            runOp(() => loyaltyService.redeem(actor, clientId, row.id, "STAFF"), done, `${loyalty.rewardName} redeemed`)
                          }
                        >
                          <Gift className="size-3.5" /> Redeem
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="mt-5 p-5">
          <SectionTitle>Recent redemptions</SectionTitle>
          {load.data?.redemptions.length ? (
            <ul className="divide-y divide-linen">
              {load.data.redemptions.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2.5 text-[12px]">
                  <span className="font-bold text-espresso">{r.rewardName}</span>
                  <span className="text-mocha">
                    {r.stampCost} stamps · {shortTime(r.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing redeemed yet" body="Rewards claimed at this counter will show up here." />
          )}
        </Card>

        <p className="mt-8 text-center text-[11px] text-mocha">
          <Link href={`/${clientSlug}`} className="underline">
            Customer app
          </Link>{" "}
          · <span className="font-mono">/staff/{clientSlug}</span> · Firebase cafe-review7
        </p>
      </div>
    </main>
  );
}
