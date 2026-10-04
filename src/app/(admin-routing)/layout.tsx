import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";

export const metadata: Metadata = {
  title: "Grounds — Admin",
  description: "Single-store admin console for the Grounds QR café platform.",
};

/**
 * Auth + store-resolution context for the top-level aliases (/setup,
 * /stores, /dashboard, /login). These render the same guards as the
 * canonical /admin/** routes.
 */
export default function AdminRoutingLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
