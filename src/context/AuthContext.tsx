"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { AlertTriangle, LogOut, ShieldOff } from "lucide-react";
import { validateFirebaseConfig } from "@/services/firebase/firebaseClient";
import { signOutUser, watchAuth } from "@/lib/firebase/auth";
import { AdminResolveError, resolveAdminProfile } from "@/lib/firebase/admin-profile";
import { fireErrorMessage } from "@/lib/firebase/firestore";
import { adminService } from "@/lib/firebase/services";
import type { AdminDoc } from "@/lib/firebase/types";
import { BrandMark } from "@/components/brand";
import { Button, Card, Skeleton } from "@/components/ui";

export type AuthPhase = "loading" | "signedOut" | "ready" | "error";

type AuthState = {
  phase: AuthPhase;
  user: User | null;
  admin: AdminDoc | null;
  /** null = SUPER_ADMIN (all clients); otherwise the assigned client ids. */
  allowedClientIds: string[] | null;
  /** Normal admins: their ONE store (null until Store Setup completes). SUPER_ADMIN: null. */
  primaryStoreId: string | null;
  error: string | null;
};

type AuthContextValue = AuthState & {
  logout: () => Promise<void>;
  refresh: () => void;
};

const AuthCtx = createContext<AuthContextValue>({
  phase: "loading",
  user: null,
  admin: null,
  allowedClientIds: null,
  primaryStoreId: null,
  error: null,
  logout: async () => {},
  refresh: () => {},
});

export const useAuth = () => useContext(AuthCtx);

const AUTH_TIMEOUT_MS = 15000;

// Config preflight — static, evaluated once. A corrupted apiKey/projectId is
// a configuration error, not a sign-in failure, and is reported as such.
const CONFIG_ERROR = validateFirebaseConfig();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() =>
    CONFIG_ERROR
      ? {
          phase: "error",
          user: null,
          admin: null,
          allowedClientIds: null,
          primaryStoreId: null,
          error: `Firebase configuration error: ${CONFIG_ERROR}`,
        }
      : { phase: "loading", user: null, admin: null, allowedClientIds: null, primaryStoreId: null, error: null },
  );
  const [tick, setTick] = useState(0);
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (CONFIG_ERROR) return; // nothing to resolve until the config is fixed
    resolvedRef.current = false;

    // Never leave the screen spinning: hard timeout on auth resolution.
    const timeout = setTimeout(() => {
      if (!resolvedRef.current) {
        setState((s) =>
          s.phase === "loading"
            ? {
                ...s,
                phase: "error",
                error:
                  "Firebase authentication timed out. Check your network connection and the cafe-review7 Firebase configuration.",
              }
            : s,
        );
      }
    }, AUTH_TIMEOUT_MS);

    const unsub = watchAuth(async (user) => {
      if (!user) {
        resolvedRef.current = true;
        setState({ phase: "signedOut", user: null, admin: null, allowedClientIds: null, primaryStoreId: null, error: null });
        return;
      }
      try {
        const adminDoc = await resolveAdminProfile(user);
        const allowed = adminDoc.role === "SUPER_ADMIN" ? null : await adminService.assignmentsFor(user.uid);
        const primaryStoreId = adminDoc.role === "SUPER_ADMIN" ? null : adminService.primaryStoreOf(adminDoc);
        resolvedRef.current = true;
        setState({ phase: "ready", user, admin: adminDoc, allowedClientIds: allowed, primaryStoreId, error: null });
      } catch (err) {
        resolvedRef.current = true;
        if (err instanceof AdminResolveError) {
          // Disabled / unknown admins are signed out so they cannot retry Firestore reads.
          if (err.code === "NOT_AN_ADMIN" || err.code === "ADMIN_DISABLED" || err.code === "UID_MISMATCH") {
            await signOutUser().catch(() => undefined);
          }
          setState({ phase: "error", user: null, admin: null, allowedClientIds: null, primaryStoreId: null, error: err.message });
          return;
        }
        setState({
          phase: "error",
          user,
          admin: null,
          allowedClientIds: null,
          primaryStoreId: null,
          error: fireErrorMessage(err),
        });
      }
    });
    return () => {
      clearTimeout(timeout);
      unsub();
    };
  }, [tick]);

  const logout = useCallback(async () => {
    await signOutUser().catch(() => undefined);
    setState({ phase: "signedOut", user: null, admin: null, allowedClientIds: null, primaryStoreId: null, error: null });
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const value = useMemo(() => ({ ...state, logout, refresh }), [state, logout, refresh]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ------------------------------------------------------------------ *
 * Guard — explicit loading / unauthenticated / forbidden / error states
 * ------------------------------------------------------------------ */

export function useAdminGuard(clientId?: string) {
  const ctx = useAuth();
  const forbidden =
    ctx.phase === "ready" &&
    Boolean(clientId) &&
    ctx.allowedClientIds !== null &&
    !ctx.allowedClientIds.includes(clientId!);
  return { ...ctx, forbidden };
}

export function GuardScreen({
  guard,
}: {
  guard: ReturnType<typeof useAdminGuard>;
}) {
  const router = useRouter();
  const { phase } = guard;

  useEffect(() => {
    if (phase === "signedOut") router.replace("/admin/login");
  }, [phase, router]);

  if (phase === "loading") {
    return (
      <main className="grid min-h-dvh place-items-center bg-cream px-6">
        <div className="w-full max-w-sm text-center">
          <BrandMark className="mx-auto mb-4 size-12 animate-pulse" />
          <p className="label-caps mb-4">Resolving Firebase session…</p>
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-3/4 mx-auto" />
          </div>
        </div>
      </main>
    );
  }

  if (phase === "signedOut") {
    return (
      <main className="grid min-h-dvh place-items-center bg-cream px-6">
        <p className="label-caps">Redirecting to sign in…</p>
      </main>
    );
  }

  // error or forbidden
  return (
    <main className="grid min-h-dvh place-items-center bg-cream px-6">
      <Card className="w-full max-w-md p-6 text-center">
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-ember/10 text-ember">
          {guard.forbidden ? <ShieldOff className="size-5" /> : <AlertTriangle className="size-5" />}
        </span>
        <h1 className="display-num text-2xl text-espresso">
          {guard.forbidden ? "No access to this business" : "Can’t open the admin console"}
        </h1>
        <p className="mt-2 text-[12.5px] text-mocha">
          {guard.forbidden
            ? "Your admin account is not assigned to this client. Ask a super admin for access."
            : (guard.error ?? "Something went wrong resolving your Firebase session.")}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={() => guard.refresh()}>Try again</Button>
          {guard.forbidden ? (
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-xl border border-espresso/25 px-4 py-2.5 text-[13px] font-semibold text-espresso"
            >
              Back to dashboard
            </Link>
          ) : null}
          <Button variant="danger" onClick={() => guard.logout().then(() => (window.location.href = "/admin/login"))}>
            <LogOut className="size-3.5" /> Sign out
          </Button>
        </div>
      </Card>
    </main>
  );
}
