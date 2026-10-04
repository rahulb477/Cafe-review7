"use client";

import { AliasRedirect } from "@/components/setup-screen";
import { DASHBOARD_PATH, STORES_PATH } from "@/context/AuthContext";

/**
 * /stores is NOT a page in the single-store model.
 *   normal admin   → /admin (their dashboard, their one store)
 *   SUPER_ADMIN    → /admin/clients (existing platform-level store list)
 */
export default function StoresAliasPage() {
  return (
    <AliasRedirect
      superAdminHref={STORES_PATH}
      normalAdminHref={DASHBOARD_PATH}
      label="Redirecting to your dashboard…"
    />
  );
}
