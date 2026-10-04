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
import type { AdminDoc, AdminRole } from "@/lib/firebase/types";
import { BrandMark } from "@/components/brand";
import { Button, Card, Skeleton } from "@/components/ui";

/**
 * ONE ADMIN = ONE STORE — the single auth + store-resolution state machine.
 *
 *   AUTH_LOADING     Firebase session not resolved yet
 *   STORE_RESOLVING  signed in; admins/{uid} + clientId being resolved
 *   NEEDS_SETUP      authenticated CLIENT_ADMIN with no clientId → /setup
 *   READY            authenticated admin with a store (or SUPER_ADMIN)
 *   SIGNED_OUT       no Firebase session → /login
 *   ERROR            disabled/unknown admin, Firestore failure, managers with
 *                    no assigned store, or another fatal resolution problem
 *
 * Nothing renders a dashboard or a store until the state is READY — the
 * login → dashboard → setup → dashboard flicker is impossible by design.
 */
export type AuthPhase =
  | "AUTH_LOADING"
  | "STORE_RESOLVING"
  | "NEEDS_SETUP"
  | "READY"
  | "SIGNED_OUT"
  | "ERROR";

type AuthState = {
  phase: AuthPhase;
  user: User | null;
  admin: AdminDoc | null;
  role: AdminRole | null;
  /** SUPER_ADMIN manages the platform; normal admins never get this. */
  isSuperAdmin: boolean;
  /** The admin's ONE store (admins/{uid}.clientId). null for SUPER_ADMIN or before setup. */
  storeId: string | null;
  /**
   * Query scope: null = SUPER_ADMIN (every client). Otherwise exactly the
   * admin's single store — never a list of clients to filter on the client.
   */
  allowedClientIds: string[] | null;
  /**
   * True while THIS session is inside the first-time setup wizard. It lets the
   * wizard survive a store-resolution refresh (the draft transaction writes
   * admins/{uid}.clientId mid-flow) without ever re-showing setup to an admin
   * who simply opened /setup with a store already configured.
   */
  setupInProgress: boolean;
  error: string | null;
};

type AuthContextValue = AuthState & {
  logout: () => Promise<void>;
  refresh: () => void;
  /**
   * Ends the first-time setup session: after this the wizard closes for good
   * and /setup always resolves to the dashboard for this account.
   */
  completeSetup: () => void;
};

const INITIAL: AuthState = {
  phase: "AUTH_LOADING",
  user: null,
  admin: null,
  role: null,
  isSuperAdmin: false,
  storeId: null,
  allowedClientIds: [],
  setupInProgress: false,
  error: null,
};

const AuthCtx = createContext<AuthContextValue>({
  ...INITIAL,
  logout: async () => {},
  refresh: () => {},
  completeSetup: () => {},
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
          ...INITIAL,
          phase: "ERROR",
          error: `Firebase configuration error: ${CONFIG_ERROR}`,
        }
      : INITIAL,
  );
  const [tick, setTick] = useState(0);
  const resolvedRef = useRef(false);
  /** uid whose first-time setup wizard is currently open, if any. */
  const setupUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (CONFIG_ERROR) return; // nothing to resolve until the config is fixed
    resolvedRef.current = false;

    // Never leave the screen spinning: hard timeout on auth resolution.
    const timeout = setTimeout(() => {
      if (!resolvedRef.current) {
        setState((s) =>
          s.phase === "AUTH_LOADING" || s.phase === "STORE_RESOLVING"
            ? {
                ...s,
                phase: "ERROR",
                error:
                  "Firebase authentication timed out. Check your network connection and the cafe-review7 Firebase configuration.",
              }
            : s,
        );
      }
    }, AUTH_TIMEOUT_MS);

    const unsub = watchAuth(async (user) => {
      /* ---------- signed out ---------- */
      if (!user) {
        resolvedRef.current = true;
        setupUidRef.current = null;
        setState({ ...INITIAL, phase: "SIGNED_OUT" });
        return;
      }

      /* ---------- signed in: resolve admins/{uid} → clientId ---------- */
      setState({
        ...INITIAL,
        phase: "STORE_RESOLVING",
        user,
        setupInProgress: setupUidRef.current === user.uid,
      });
      try {
        const adminDoc = await resolveAdminProfile(user);

        // SUPER_ADMIN keeps the platform-level (multi-client) scope.
        if (adminDoc.role === "SUPER_ADMIN") {
          resolvedRef.current = true;
          setState({
            phase: "READY",
            user,
            admin: adminDoc,
            role: adminDoc.role,
            isSuperAdmin: true,
            storeId: null,
            allowedClientIds: null,
            setupInProgress: false,
            error: null,
          });
          return;
        }

        // Canonical ownership: admins/{uid}.clientId (legacy clientIds[] fallback).
        const storeId = adminService.primaryStoreOf(adminDoc);

        if (!storeId) {
          resolvedRef.current = true;
          // Managers never run Store Setup — they cannot create stores.
          if (adminDoc.role === "MANAGER") {
            setState({
              phase: "ERROR",
              user,
              admin: adminDoc,
              role: adminDoc.role,
              isSuperAdmin: false,
              storeId: null,
              allowedClientIds: [],
              setupInProgress: false,
              error:
                "This manager account has no store assigned. Ask a super admin to assign you to a store — manager accounts cannot create one.",
            });
            return;
          }
          // First-time CLIENT_ADMIN: the ONLY path that reaches /setup.
          setupUidRef.current = user.uid;
          setState({
            phase: "NEEDS_SETUP",
            user,
            admin: adminDoc,
            role: adminDoc.role,
            isSuperAdmin: false,
            storeId: null,
            allowedClientIds: [],
            setupInProgress: true,
            error: null,
          });
          return;
        }

        resolvedRef.current = true;
        setState({
          phase: "READY",
          user,
          admin: adminDoc,
          role: adminDoc.role,
          isSuperAdmin: false,
          storeId,
          // Exactly ONE store — never a list to filter client-side.
          allowedClientIds: [storeId],
          // A wizard opened earlier in this session keeps running until publish.
          setupInProgress: setupUidRef.current === user.uid,
          error: null,
        });
      } catch (err) {
        resolvedRef.current = true;
        if (err instanceof AdminResolveError) {
          // Disabled / unknown admins are signed out so they cannot retry Firestore reads.
          if (err.code === "NOT_AN_ADMIN" || err.code === "ADMIN_DISABLED" || err.code === "UID_MISMATCH") {
            await signOutUser().catch(() => undefined);
          }
          setState({ ...INITIAL, phase: "ERROR", user: null, error: err.message });
          return;
        }
        setState({
          ...INITIAL,
          phase: "ERROR",
          user,
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
    setupUidRef.current = null;
    setState({ ...INITIAL, phase: "SIGNED_OUT" });
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const completeSetup = useCallback(() => {
    setupUidRef.current = null;
    setTick((t) => t + 1);
  }, []);

  const value = useMemo(() => ({ ...state, logout, refresh, completeSetup }), [state, logout, refresh, completeSetup]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ------------------------------------------------------------------ *
 * Route guards — explicit loading / resolving / setup / forbidden / error
 * ------------------------------------------------------------------ */

export const DASHBOARD_PATH = "/admin";
export const LOGIN_PATH = "/admin/login";
export const SETUP_PATH = "/admin/setup";
export const STORES_PATH = "/admin/clients";

/** Where a resolved session belongs, given the store-resolution state. */
export function homePathFor(phase: AuthPhase): string | null {
  if (phase === "NEEDS_SETUP") return SETUP_PATH;
  if (phase === "READY") return DASHBOARD_PATH;
  if (phase === "SIGNED_OUT") return LOGIN_PATH;
  return null;
}

export function useAdminGuard(clientId?: string) {
  const ctx = useAuth();
  const forbidden =
    ctx.phase === "READY" &&
    Boolean(clientId) &&
    ctx.allowedClientIds !== null &&
    !ctx.allowedClientIds.includes(clientId!);
  return { ...ctx, forbidden };
}

/** Shared full-screen state shown while Firebase/auth/store resolution runs. */
export function ResolutionScreen({ label }: { label: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-cream px-6">
      <div className="w-full max-w-sm text-center">
        <BrandMark className="mx-auto mb-4 size-12 animate-pulse" />
        <p className="label-caps mb-4">{label}</p>
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4 mx-auto" />
        </div>
      </div>
    </main>
  );
}

export function GuardScreen({
  guard,
  allowNeedsSetup = false,
}: {
  guard: ReturnType<typeof useAdminGuard>;
  /** true only on the setup page itself, which renders the wizard instead. */
  allowNeedsSetup?: boolean;
}) {
  const router = useRouter();
  const phase = guard.phase;

  // Explicit redirects — never render the wrong screen first.
  useEffect(() => {
    if (phase === "SIGNED_OUT") router.replace(LOGIN_PATH);
    else if (phase === "NEEDS_SETUP" && !allowNeedsSetup) router.replace(SETUP_PATH);
    else if (phase === "READY" && !guard.admin) router.replace(LOGIN_PATH);
  }, [phase, router, allowNeedsSetup, guard.admin]);

  if (phase === "AUTH_LOADING") return <ResolutionScreen label="Resolving Firebase session…" />;
  if (phase === "STORE_RESOLVING") return <ResolutionScreen label="Loading your store…" />;

  if (phase === "SIGNED_OUT") {
    return (
      <main className="grid min-h-dvh place-items-center bg-cream px-6">
        <p className="label-caps">Redirecting to sign in…</p>
      </main>
    );
  }

  if (phase === "NEEDS_SETUP" && !allowNeedsSetup) {
    return (
      <main className="grid min-h-dvh place-items-center bg-cream px-6">
        <p className="label-caps">Setting up your store…</p>
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
          {guard.forbidden ? "No access to this store" : "Can’t open the admin console"}
        </h1>
        <p className="mt-2 text-[12.5px] text-mocha">
          {guard.forbidden
            ? "Your admin account manages one store only. Ask a super admin if you need access to another store."
            : (guard.error ?? "Something went wrong resolving your Firebase session.")}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={() => guard.refresh()}>Try again</Button>
          {guard.forbidden ? (
            <Link
              href={DASHBOARD_PATH}
              className="inline-flex items-center gap-2 rounded-xl border border-espresso/25 px-4 py-2.5 text-[13px] font-semibold text-espresso"
            >
              Back to dashboard
            </Link>
          ) : null}
          <Button variant="danger" onClick={() => guard.logout().then(() => (window.location.href = LOGIN_PATH))}>
            <LogOut className="size-3.5" /> Sign out
          </Button>
        </div>
      </Card>
    </main>
  );
}
