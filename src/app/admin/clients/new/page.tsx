"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WorkspacePage } from "@/components/admin-page";
import { SETUP_PATH } from "@/context/AuthContext";
import { PageHeader, SkeletonRows } from "@/components/ui";
import { StoreSetupWizard } from "@/components/client-wizard";
import type { Actor } from "@/lib/firebase/types";

/**
 * PLATFORM store creation — SUPER_ADMIN only.
 *
 * A normal admin creates their ONE store through first-time setup
 * (/admin/setup), so they are redirected there instead. There is no
 * "add another store" path for them anywhere in the console.
 */
export default function StoreSetupPage() {
  return <WorkspacePage>{({ actor, role }) => <PlatformStoreSetup actor={actor} role={role} />}</WorkspacePage>;
}

function PlatformStoreSetup({ actor, role }: { actor: Actor; role: string }) {
  const router = useRouter();
  const isSuper = role === "SUPER_ADMIN";

  useEffect(() => {
    if (!isSuper) router.replace(SETUP_PATH);
  }, [isSuper, router]);

  if (!isSuper) {
    return (
      <div className="space-y-4">
        <SkeletonRows rows={3} />
        <p className="label-caps">Single-store admins set up their own store — opening setup…</p>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform Store Setup"
        title="Set Up Store"
        subtitle="Business, branding, theme, menu, Google Reviews, social, Wi-Fi, loyalty and AI — save a draft any time, publish when ready."
      />
      <StoreSetupWizard actor={actor} />
    </>
  );
}
