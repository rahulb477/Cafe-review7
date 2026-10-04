"use client";

import { FirstTimeSetupScreen } from "@/components/setup-screen";

/**
 * /setup — first-time onboarding only.
 *   authenticated + no clientId → wizard
 *   authenticated + clientId    → /dashboard (guard redirects)
 *   unauthenticated             → /admin/login
 */
export default function SetupAliasPage() {
  return <FirstTimeSetupScreen />;
}
