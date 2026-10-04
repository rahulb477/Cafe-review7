"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StoreSetupWizard } from "@/components/client-wizard";
import { PageHeader } from "@/components/ui";
import { AdminShell } from "@/components/shell";
import { DASHBOARD_PATH, GuardScreen, ResolutionScreen, useAdminGuard } from "@/context/AuthContext";

/* ------------------------------------------------------------------ *
 * /admin/setup — FIRST-TIME STORE SETUP (normal admins only)
 *
 * This is the ONLY place a normal admin can create a store, and it is
 * reachable only from the NEEDS_SETUP state. As soon as the atomic
 * transaction in clientService.saveDraft() claims admins/{uid}.clientId,
 * this session latches onto the wizard so the in-progress setup is never
 * interrupted — and once the store is published the wizard redirects to
 * /dashboard.
 *
 * If the account already owns a store the guard sends the admin straight to
 * the dashboard: a second store can never be created from the UI.
 * ------------------------------------------------------------------ */

export function FirstTimeSetupScreen() {
  const guard = useAdminGuard();
  const router = useRouter();
  const [published, setPublished] = useState(false);

  // The wizard stays mounted for the whole first-time flow: AuthContext marks
  // the setup session (setupInProgress) so a re-resolution that now sees the
  // draft store's clientId does not interrupt the admin mid-setup.
  const showWizard = (guard.phase === "NEEDS_SETUP" || guard.setupInProgress) && Boolean(guard.admin);

  // An account that already owns a store never sees the setup wizard again.
  useEffect(() => {
    if (!showWizard && guard.phase === "READY") router.replace(DASHBOARD_PATH);
  }, [showWizard, guard.phase, router]);

  // After a successful publish: short success state, then the dashboard.
  // completeSetup() releases the latch, so /setup can never reopen for this
  // account (a manual visit now redirects straight to the dashboard).
  useEffect(() => {
    if (!published) return;
    const t = setTimeout(() => {
      guard.completeSetup();
      router.replace(DASHBOARD_PATH);
    }, 1500);
    return () => clearTimeout(t);
  }, [published, guard, router]);

  if (showWizard && guard.admin) {
    return (
      <AdminShell
        admin={{ name: guard.admin.name, email: guard.admin.email ?? "", role: guard.admin.role }}
        client={null}
        storeId={null}
      >
        <PageHeader
          eyebrow="First-time store setup"
          title="Set Up Your Store"
          subtitle="Business, branding, theme, menu, Google Reviews, social, Wi-Fi, loyalty and AI — this is done once. Afterwards you land straight on your dashboard."
        />
        <StoreSetupWizard
          actor={{ uid: guard.admin.uid, name: guard.admin.name, role: guard.admin.role }}
          onPublished={() => setPublished(true)}
          // Two-tab first-time setup: the other tab already created the store.
          // Refresh resolution and land on the dashboard instead of retrying.
          onSetupConflict={() => {
            guard.completeSetup();
            router.replace(DASHBOARD_PATH);
          }}
        />
      </AdminShell>
    );
  }

  if (guard.phase === "READY") {
    return <ResolutionScreen label="Store already set up — opening your dashboard…" />;
  }

  return <GuardScreen guard={guard} allowNeedsSetup />;
}

/* ------------------------------------------------------------------ *
 * Route aliases — /setup, /dashboard, /stores, /login
 * The app's canonical routes stay /admin, /admin/setup, /admin/login and
 * /admin/clients; these aliases exist so a manually typed URL can never land
 * a normal admin on a multi-store screen.
 * ------------------------------------------------------------------ */

export function RedirectScreen({ label }: { label: string }) {
  return <ResolutionScreen label={label} />;
}

export function AliasRedirect({
  superAdminHref,
  normalAdminHref,
  label,
}: {
  superAdminHref: string;
  normalAdminHref: string;
  label: string;
}) {
  const guard = useAdminGuard();
  const router = useRouter();
  const href = guard.phase === "READY" ? (guard.isSuperAdmin ? superAdminHref : normalAdminHref) : null;

  useEffect(() => {
    if (href) router.replace(href);
  }, [href, router]);

  if (href) return <RedirectScreen label={label} />;
  return <GuardScreen guard={guard} />;
}
