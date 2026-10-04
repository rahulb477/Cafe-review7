"use client";

import { FirstTimeSetupScreen } from "@/components/setup-screen";

/**
 * Canonical first-time store setup route (the /setup alias renders the same
 * screen). Reachable only while store resolution reports NEEDS_SETUP:
 * authenticated CLIENT_ADMIN with no admins/{uid}.clientId.
 */
export default function AdminSetupPage() {
  return <FirstTimeSetupScreen />;
}
