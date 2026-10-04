"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import { authErrorCode, authErrorMessage, sendReset, signInWithPassword, signOutUser } from "@/lib/firebase/auth";
import { AdminResolveError, resolveAdminProfile } from "@/lib/firebase/admin-profile";
import { validateFirebaseConfig, firebaseConfig } from "@/services/firebase/firebaseClient";
import { useAuth } from "@/context/AuthContext";
import { Button, Card, Field, Input } from "@/components/ui";
import { ToastHost, emitToast } from "@/components/interactive";
import { BrandMark } from "@/components/shell";

type StepState = "pending" | "ok" | "fail";
type Diagnostic = { error: string; code?: string; steps: [string, StepState][] } | null;

const STEPS = [
  "Firebase Authentication (signInWithEmailAndPassword)",
  "Firebase user resolved",
  "UID verification",
  "Firestore admins/{uid} profile",
  "Role & status check",
] as const;

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const [show, setShow] = useState(false);
  const [pending, setPending] = useState(false);
  const [diag, setDiag] = useState<Diagnostic>(null);
  const [remember, setRemember] = useState(true);

  // Config preflight — a corrupted apiKey is reported before any attempt,
  // instead of surfacing later as a confusing auth failure.
  const configError = useMemo(() => validateFirebaseConfig(), []);

  // Already authenticated and authorized → straight to the dashboard.
  useEffect(() => {
    if (auth.phase === "ready") router.replace("/admin");
  }, [auth.phase, router]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    if (!email || !password) {
      setDiag({ error: "Enter your email and password to continue.", steps: [] });
      return;
    }
    if (configError) {
      setDiag({ error: `Firebase configuration error: ${configError}`, steps: [[STEPS[0], "fail"]] });
      return;
    }

    setPending(true);
    setDiag(null);
    const trail: [string, StepState][] = [];
    try {
      // STEP 1 — Firebase Authentication. Nothing else runs until this succeeds.
      let user;
      try {
        user = await signInWithPassword(email, password);
        trail.push([STEPS[0], "ok"]);
      } catch (err) {
        trail.push([STEPS[0], "fail"]);
        setDiag({ error: authErrorMessage(err), code: authErrorCode(err), steps: trail });
        setPending(false);
        return;
      }

      // STEP 2 — authenticated Firebase user.
      console.info("[admin-auth] step 2 · user.uid =", user.uid, "· user.email =", user.email, "· emailVerified =", user.emailVerified);
      trail.push([STEPS[1], "ok"]);

      // STEPS 3–5 — UID verification, admins/{uid} read, role/status.
      try {
        await resolveAdminProfile(user);
        trail.push([STEPS[2], "ok"], [STEPS[3], "ok"], [STEPS[4], "ok"]);
      } catch (err) {
        if (err instanceof AdminResolveError) {
          const failedIndex = err.code === "UID_MISMATCH" ? 2 : err.code === "ADMIN_DISABLED" ? 4 : 3;
          for (let i = 2; i <= 4; i++) trail.push([STEPS[i], i < failedIndex ? "ok" : i === failedIndex ? "fail" : "pending"]);
          // Don't leave a half-authorized session around for non-admins.
          if (err.code !== "FIRESTORE_DENIED" && err.code !== "SUPER_PROFILE_MISSING") {
            await signOutUser().catch(() => undefined);
          }
          setDiag({ error: err.message, code: err.firestoreCode, steps: trail });
          setPending(false);
          return;
        }
        throw err;
      }

      // STEP 6 — open /admin (AuthContext re-resolves and renders the dashboard).
      router.replace("/admin");
    } catch (err) {
      setDiag({ error: authErrorMessage(err), code: authErrorCode(err), steps: trail });
      setPending(false);
    }
  };

  const forgot = async () => {
    const email = (document.querySelector('input[name="email"]') as HTMLInputElement | null)?.value?.trim();
    if (!email) {
      setDiag({ error: "Type your email above first, then tap Forgot password.", steps: [] });
      return;
    }
    try {
      await sendReset(email);
      emitToast("success", "Password reset email sent (if the account exists).");
    } catch (err) {
      setDiag({ error: authErrorMessage(err), code: authErrorCode(err), steps: [] });
    }
  };

  return (
    <ToastHost>
      <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-espresso px-4 py-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="images/login-cafe.jpg" alt="" aria-hidden className="absolute inset-0 size-full object-cover opacity-45" />
        <div className="absolute inset-0 bg-gradient-to-b from-espresso/85 via-espresso/70 to-bean/95" />

        <div className="relative z-10 w-full max-w-[380px]">
          <div className="mb-6 text-center text-cream">
            <div className="mb-3 flex items-center justify-center gap-2">
              <BrandMark className="size-7" />
              <span className="label-caps !text-cream/60">Grounds Admin · Firebase</span>
            </div>
            <div className="mx-auto mb-3 grid size-16 place-items-center rounded-full bg-caramel/20 ring-1 ring-caramel/40">
              <BrandMark className="size-11" />
            </div>
            <h1 className="display-num text-[38px] leading-none">Admin Portal</h1>
            <p className="mx-auto mt-2 max-w-[280px] text-[12.5px] text-cream/70">
              Manage your café, menu, staff, loyalty and more.
            </p>
          </div>

          <Card className="p-5">
            <form onSubmit={submit} className="space-y-3">
              <Field label="Email">
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mocha" />
                  <Input name="email" type="email" required autoComplete="username" placeholder="you@company.com" className="pl-9" />
                </div>
              </Field>
              <Field label="Password">
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mocha" />
                  <Input
                    name="password"
                    type={show ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pl-9 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-mocha transition-colors hover:bg-linen hover:text-espresso"
                  >
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              <div className="flex items-center justify-between pt-1">
                <label className="flex cursor-pointer items-center gap-2 text-[12px] text-mocha">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="size-3.5 accent-espresso"
                  />
                  Remember me
                </label>
                <button type="button" onClick={forgot} className="text-[12px] font-semibold text-caramel underline-offset-2 hover:underline">
                  Forgot password?
                </button>
              </div>

              <Button type="submit" className="w-full" disabled={pending || Boolean(configError)}>
                {pending ? "Signing in…" : "Sign In →"}
              </Button>

              {/* Real Firebase errors — never a generic "sign-in failed". */}
              {configError ? (
                <div role="alert" className="break-words rounded-xl bg-ember/8 px-3 py-2 text-[12px] font-semibold text-ember">
                  <p className="label-caps mb-1 !text-ember">Firebase configuration error</p>
                  {configError}
                </div>
              ) : null}
              {diag ? (
                <div role="alert" className="rounded-xl bg-ember/8 px-3 py-2 text-[12px] text-ember">
                  <p className="break-words font-semibold">{diag.error}</p>
                  {diag.code ? <p className="mt-1 font-mono text-[10.5px] opacity-80">error code: {diag.code}</p> : null}
                  {diag.steps.length ? (
                    <ul className="mt-2 space-y-0.5 border-t border-ember/20 pt-2 text-[10.5px]">
                      {diag.steps.map(([label, s]) => (
                        <li key={label} className={s === "fail" ? "font-bold" : s === "pending" ? "opacity-50" : "opacity-80"}>
                          {s === "ok" ? "✓" : s === "fail" ? "✕" : "·"} {label}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {auth.phase === "error" && !diag && !configError ? (
                <p role="alert" className="rounded-xl bg-ember/8 px-3 py-2 text-[12px] font-semibold text-ember">
                  {auth.error}
                </p>
              ) : null}
            </form>
          </Card>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-cream/60">
            <ShieldCheck className="size-3.5" /> Firebase Authentication · project {firebaseConfig.projectId}
          </p>
          <p className="mt-2 text-center text-[10.5px] text-cream/50">
            Access requires a Firebase Auth account plus an active document in the <span className="font-mono">admins</span> collection.
            Firebase keeps “remember me” sessions persistent by default.
          </p>
        </div>
      </main>
    </ToastHost>
  );
}
