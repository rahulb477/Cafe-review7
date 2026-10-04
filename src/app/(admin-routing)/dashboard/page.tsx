"use client";

import { AliasRedirect } from "@/components/setup-screen";

/**
 * /dashboard alias → the project's canonical dashboard route (/admin).
 * A first-time admin without a store is sent to /setup instead.
 */
export default function DashboardAliasPage() {
  return (
    <AliasRedirect superAdminHref="/admin" normalAdminHref="/admin" label="Opening your dashboard…" />
  );
}
