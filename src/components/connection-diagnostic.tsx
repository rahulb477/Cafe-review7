"use client";

import { useState } from "react";
import { Activity, Check, X } from "lucide-react";
import { deleteDoc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseAuth } from "@/lib/firebase/auth";
import { newId, subDoc } from "@/lib/firebase/firestore";
import { isImageHostingConfigured, uploadImageDataUrl } from "@/lib/imageUpload";
import { Button, Card, SectionTitle, cn } from "@/components/ui";

type StepResult = { name: string; state: "pending" | "running" | "ok" | "fail"; detail: string; ms?: number };

const INITIAL: StepResult[] = [
  { name: "Firebase Auth session", state: "pending", detail: "" },
  { name: "Firestore write (diagnostic subcollection)", state: "pending", detail: "" },
  { name: "Firestore read-back + cleanup", state: "pending", detail: "" },
  { name: "ImgBB image hosting (tiny upload)", state: "pending", detail: "" },
];

function errText(err: unknown): string {
  const code = (err as { code?: string })?.code;
  const msg = (err as Error)?.message ?? String(err);
  return code ? `${code} — ${msg}` : msg;
}

/**
 * Phase-7 style isolation tool: runs the smallest valid operation against
 * each backend the Store Setup save path touches, in order, stopping at the
 * first failure. Every result shows the REAL Firebase error code.
 */
export function ConnectionDiagnostic() {
  const [steps, setSteps] = useState<StepResult[]>(INITIAL);
  const [running, setRunning] = useState(false);

  const update = (i: number, patch: Partial<StepResult>) =>
    setSteps((s) => s.map((step, j) => (j === i ? { ...step, ...patch } : step)));

  const run = async () => {
    setRunning(true);
    setSteps(INITIAL.map((s) => ({ ...s })));
    const timed = async (i: number, fn: () => Promise<string>) => {
      update(i, { state: "running", detail: "" });
      const t = Date.now();
      try {
        const detail = await fn();
        update(i, { state: "ok", detail, ms: Date.now() - t });
        return true;
      } catch (err) {
        console.error("[DIAGNOSTIC] step failed", INITIAL[i].name, err);
        update(i, { state: "fail", detail: errText(err), ms: Date.now() - t });
        return false;
      }
    };

    try {
      // 1 — Auth
      const okAuth = await timed(0, async () => {
        const user = firebaseAuth().currentUser;
        if (!user) throw new Error("auth.currentUser is null — sign in again before running the diagnostic.");
        return `uid=${user.uid} · ${user.email ?? "no email"} · verified=${user.emailVerified}`;
      });
      if (!okAuth) return;

      // 2 — minimal Firestore write. Target: a subcollection under a phantom
      // "_diagnostic" parent — admin-writable AND admin-deletable per rules
      // (clients/{id} itself is delete:false by design, so probing there
      // would always fail cleanup and leave a ghost store in the list).
      const diagId = newId("diag");
      const probeRef = subDoc("_diagnostic", "menuItems", diagId);
      const okWrite = await timed(1, async () => {
        await setDoc(probeRef, {
          clientId: "_diagnostic",
          name: "Connection probe",
          active: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return `wrote clients/_diagnostic/menuItems/${diagId}`;
      });
      if (!okWrite) return;

      // 3 — read back + delete (leaves no residue; delete is allowed here)
      const okRead = await timed(2, async () => {
        const snap = await getDoc(probeRef);
        if (!snap.exists()) throw new Error("Document wrote but does not read back.");
        await deleteDoc(probeRef);
        return "read-back OK · deleted";
      });
      if (!okRead) return;

      // 4 — tiny ImgBB upload (the operation behind logo/cover uploads)
      await timed(3, async () => {
        if (!isImageHostingConfigured()) {
          return "skipped — NEXT_PUBLIC_IMGBB_API_KEY not set (image uploads disabled, publishing still works)";
        }
        // 1×1 transparent PNG
        const px =
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
        const url = await uploadImageDataUrl(px);
        return `uploaded OK → ${url.slice(0, 40)}… (ImgBB hosting works)`;
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="p-5">
      <SectionTitle right={<span className="text-[11px] text-mocha">isolates the Store Setup save path</span>}>
        Connection diagnostic
      </SectionTitle>
      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.name} className="rounded-xl border border-linen bg-paper px-3 py-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full text-[10px]",
                  s.state === "ok" && "bg-stamp/15 text-stamp",
                  s.state === "fail" && "bg-ember/15 text-ember",
                  s.state === "running" && "bg-gold/20 text-[#8a5f10]",
                  s.state === "pending" && "bg-linen text-mocha",
                )}
              >
                {s.state === "ok" ? <Check className="size-3" /> : s.state === "fail" ? <X className="size-3" /> : s.state === "running" ? "…" : "·"}
              </span>
              <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-espresso">{s.name}</span>
              {s.ms !== undefined ? <span className="shrink-0 text-[10.5px] text-mocha">{s.ms}ms</span> : null}
            </div>
            {s.detail ? (
              <p className={cn("mt-1 break-words pl-7 text-[11px]", s.state === "fail" ? "font-semibold text-ember" : "text-mocha")}>{s.detail}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <Button className="mt-3" variant="outline" onClick={run} disabled={running}>
        <Activity className="size-4" /> {running ? "Running…" : "Run diagnostic"}
      </Button>
      <p className="mt-2 text-[10.5px] text-mocha">
        Runs the smallest valid operation against each backend the Store Setup save uses, stopping at the first failure.
        All test data is deleted afterwards.
      </p>
    </Card>
  );
}
