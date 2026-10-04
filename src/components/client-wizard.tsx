"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Plus, QrCode, Settings, Store, Trash2 } from "lucide-react";
import { clientService, validateStoreForPublish, type DraftMenuItem, type StoreFormData } from "@/lib/firebase/services";
import { fireErrorMessage } from "@/lib/firebase/firestore";
import { firebaseAuth } from "@/lib/firebase/auth";
import type { Actor } from "@/lib/firebase/types";
import { ImagePicker } from "@/components/image-picker";
import { ToggleField } from "@/components/toggle-field";
import { emitToast } from "@/components/interactive";
import { Badge, Button, Card, Field, Input, LinkButton, SectionTitle, Textarea, cn } from "@/components/ui";

const STEPS = ["Business", "Branding", "Theme", "Menu", "Google Reviews", "Social", "Wi-Fi", "Loyalty", "AI", "Review & Publish"] as const;

const PUBLISH_STAGES = ["Validating", "Saving Store", "Saving Settings", "Publishing", "Complete"] as const;
type StageState = "pending" | "active" | "ok" | "fail";
type PublishPhase = "idle" | "publishing" | "success" | "error";

const emptyForm = (): StoreFormData => ({
  businessName: "",
  displayName: "",
  tagline: "",
  description: "",
  address: "",
  phone: "",
  email: "",
  category: "",
  slug: "",
  logoUrl: null,
  faviconUrl: null,
  coverImageUrl: null,
  primaryColor: "#3A2116",
  secondaryColor: "#5A3524",
  accentColor: "#C0651E",
  backgroundColor: "#F7EFE3",
  textColor: "#23130C",
  googleReviewUrl: "",
  instagram: "",
  facebook: "",
  youtube: "",
  website: "",
  wifiEnabled: true,
  wifiSsid: "",
  wifiMessage: "",
  loyaltyEnabled: true,
  stampTarget: 8,
  rewardName: "Free Coffee",
  rewardDescription: "",
  rewardImageUrl: null,
  aiEnabled: false,
  aiMonthlyLimit: 200,
  aiPrice: 100,
  draftMenu: [],
});

export function StoreSetupWizard({
  actor,
  initialDraft,
  initialStoreId,
  onPublished,
  onSetupConflict,
}: {
  actor: Actor;
  initialDraft?: StoreFormData | null;
  initialStoreId?: string | null;
  /** Called once the store is published — first-time setup redirects to /dashboard. */
  onPublished?: (result: { storeId: string; slug: string }) => void;
  /** Called when the atomic transaction reports that a store already exists (second tab). */
  onSetupConflict?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<StoreFormData>(() => initialDraft ?? emptyForm());
  const [storeId, setStoreId] = useState<string | null>(initialStoreId ?? null);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const [savingDraft, setSavingDraft] = useState(false);
  const [phase, setPhase] = useState<PublishPhase>("idle");
  const [stages, setStages] = useState<StageState[]>(PUBLISH_STAGES.map(() => "pending"));
  const [publishError, setPublishError] = useState<{ code?: string; message: string } | null>(null);
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  const set = <K extends keyof StoreFormData>(key: K, value: StoreFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /* ---------- per-step required-field validation ---------- */
  const businessMissing = () => {
    const missing: string[] = [];
    if (!form.businessName.trim()) missing.push("Store name");
    if (!form.category.trim()) missing.push("Business category");
    if (!form.phone.trim()) missing.push("Phone");
    if (!form.address.trim()) missing.push("Address");
    return missing;
  };

  const next = () => {
    if (step === 0) {
      const missing = businessMissing();
      if (missing.length) {
        setStepErrors(missing);
        return;
      }
    }
    setStepErrors([]);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  /* ---------- Save Draft: available on every step, always resolves ---------- */
  const saveDraft = async (silent = false): Promise<string | null> => {
    if (!form.businessName.trim()) {
      emitToast("error", "Enter the store name before saving a draft.");
      setStep(0);
      return null;
    }
    setSavingDraft(true);
    try {
      const result = await clientService.saveDraft(actor, storeId, form);
      setStoreId(result.storeId);
      if (!silent) emitToast("success", `Draft saved — /${result.slug}`);
      return result.storeId;
    } catch (err) {
      console.error("STORE_DRAFT_SAVE_ERROR", err);
      const message = fireErrorMessage(err);
      emitToast("error", message);
      // A second tab finished first: the transaction aborted, so this tab must
      // NOT retry creation — it follows the store that already exists.
      if (/already complete/i.test(message)) onSetupConflict?.();
      return null;
    } finally {
      setSavingDraft(false);
    }
  };

  /* ---------- Publish: validate → staged progress → real errors ---------- */
  const publish = async () => {
    // Validation runs BEFORE publishing starts; nothing is written if it fails.
    const missing = validateStoreForPublish(form);
    if (missing.length) {
      setPublishError({ message: `Complete these fields before publishing:\n${missing.map((m) => `• ${m}`).join("\n")}` });
      setPhase("error");
      setStages(PUBLISH_STAGES.map((_, i) => (i === 0 ? "fail" : "pending")));
      return;
    }

    setPhase("publishing");
    setPublishError(null);
    const stageState: StageState[] = PUBLISH_STAGES.map(() => "pending");
    const mark = (i: number, s: StageState) => {
      stageState[i] = s;
      setStages([...stageState]);
    };

    try {
      mark(0, "active");
      mark(0, "ok"); // client-side validation passed above

      mark(1, "active");
      const id = await clientService.saveDraft(actor, storeId, form).then((r) => {
        setStoreId(r.storeId);
        return r.storeId;
      });
      mark(1, "ok");

      const { slug } = await clientService.publishStore(actor, id, (stage) => {
        if (stage === "settings") {
          mark(2, "active");
        }
        if (stage === "publishing") {
          mark(2, "ok");
          mark(3, "active");
        }
      });
      mark(3, "ok");
      mark(4, "ok");
      setPublishedSlug(slug);
      setPhase("success");
      emitToast("success", "Store published successfully");
      // First-time setup: brief success state, then the caller navigates on.
      onPublished?.({ storeId: id, slug });
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const message = err instanceof Error ? err.message : "Store publishing failed";
      console.error({
        operation: "publishStore",
        errorCode: code ?? "unknown",
        errorMessage: message,
        uid: firebaseAuth().currentUser?.uid,
        storeId,
      });
      const failed = stageState.findIndex((s) => s === "active");
      if (failed >= 0) mark(failed, "fail");
      setPublishError({ code, message });
      setPhase("error");
      if (/already complete/i.test(message)) onSetupConflict?.();
    } finally {
      // The button can NEVER stay stuck on "Publishing…": phase is always
      // terminal here (success or error), and success renders its own panel.
      setPhase((p) => (p === "publishing" ? "error" : p));
    }
  };

  /* ---------- success panel (no redirect to an empty state) ---------- */
  if (phase === "success" && storeId) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-stamp/15 text-stamp">
          <Check className="size-7" />
        </span>
        <p className="label-caps">Store published successfully</p>
        <h2 className="display-num mt-2 text-[32px] text-espresso">{form.businessName}</h2>
        <p className="mt-1 text-[12.5px] text-mocha">
          Status <Badge tone="green">PUBLISHED</Badge> · live at <span className="font-mono">/{publishedSlug}</span>
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <LinkButton href={`/${publishedSlug}`} external>
            <Store className="size-4" /> Open Store
          </LinkButton>
          <LinkButton href={`/admin/clients/${storeId}`} variant="outline">
            Manage Store
          </LinkButton>
          <LinkButton href={`/admin/clients/${storeId}/qr`} variant="outline">
            <QrCode className="size-4" /> View QR
          </LinkButton>
          <LinkButton href={`/admin/clients/${storeId}/branding`} variant="outline">
            <Settings className="size-4" /> Store Settings
          </LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:h-fit">
        {/* compact indicator on phones — all 10 steps never need to fit on 320px */}
        <p className="label-caps mb-2 lg:hidden">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
        <ol className="flex max-w-full gap-1.5 overflow-x-auto pb-2 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  "flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-[12.5px] font-bold transition-colors",
                  i === step ? "bg-espresso text-cream" : "bg-paper text-mocha hover:bg-linen",
                )}
              >
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full text-[10px]",
                    i < step ? "bg-stamp text-cream" : i === step ? "bg-cream/20 text-cream" : "bg-linen text-mocha",
                  )}
                >
                  {i < step ? <Check className="size-3" /> : i + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
        {storeId ? (
          <p className="mt-3 hidden rounded-xl bg-linen/60 px-3 py-2 text-[10.5px] text-mocha lg:block">
            Draft saved as <span className="font-mono">{storeId}</span>. Publishing updates this store — it never creates a
            duplicate.
          </p>
        ) : null}
      </aside>

      <Card className="min-w-0 p-4 sm:p-6">
        {/* STEP 1 · Business */}
        <div className={step === 0 ? "grid gap-3 sm:grid-cols-2" : "hidden"}>
          <Field label="Store name" required className="sm:col-span-2">
            <Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="BAKE Café & Bakery" />
          </Field>
          <Field label="Display name" hint="Optional — shown on the customer app header.">
            <Input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="BAKE" />
          </Field>
          <Field label="Store slug" hint="Live at /{slug} — leave blank to generate from the name.">
            <Input value={form.slug ?? ""} onChange={(e) => set("slug", e.target.value)} placeholder="bake" />
          </Field>
          <Field label="Business category" required>
            <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Café · Bakery · Restaurant" />
          </Field>
          <Field label="Email" hint="Optional contact email.">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="hello@bake.cafe" />
          </Field>
          <Field label="Phone" required>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98450 11223" />
          </Field>
          <Field label="Address" required>
            <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="12 Rosewood Lane, Bengaluru" />
          </Field>
          <Field label="Tagline" className="sm:col-span-2">
            <Input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="Good Food • Brighter Days" />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="A cosy café & bakery serving delicious coffee and fresh pastries." />
          </Field>
        </div>

        {/* STEP 2 · Branding */}
        <div className={step === 1 ? "space-y-5" : "hidden"}>
          <Field label="Logo" hint="Uploads to ImgBB when you choose a file; only the URL is saved.">
            <ImagePicker name="_logo" defaultValue={form.logoUrl} round onChange={(v) => set("logoUrl", v || null)} />
          </Field>
          <Field label="Favicon">
            <ImagePicker name="_favicon" defaultValue={form.faviconUrl} round onChange={(v) => set("faviconUrl", v || null)} />
          </Field>
          <Field label="Cover image">
            <ImagePicker name="_cover" defaultValue={form.coverImageUrl} aspect="aspect-[16/9]" onChange={(v) => set("coverImageUrl", v || null)} />
          </Field>
        </div>

        {/* STEP 3 · Theme */}
        <div className={step === 2 ? "grid gap-3 sm:grid-cols-2" : "hidden"}>
          {(
            [
              ["Primary", "primaryColor"],
              ["Secondary", "secondaryColor"],
              ["Accent", "accentColor"],
              ["Background", "backgroundColor"],
              ["Text", "textColor"],
            ] as const
          ).map(([label, key]) => (
            <Field key={key} label={label} required={key === "primaryColor"}>
              <div className="flex items-center gap-2 rounded-xl border border-linen bg-paper px-2 py-1.5">
                <input type="color" value={form[key]} onChange={(e) => set(key, e.target.value)} className="size-8 rounded border-0 bg-transparent p-0" />
                <span className="text-[11px] text-mocha">{form[key]}</span>
              </div>
            </Field>
          ))}
        </div>

        {/* STEP 4 · Menu */}
        <div className={step === 3 ? "space-y-3" : "hidden"}>
          <p className="text-[12px] text-mocha">
            Optional starter menu — rows are written to the store menu on publish. You can manage the full menu later under
            Store Menu.
          </p>
          {form.draftMenu.map((row, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-linen bg-paper/60 p-2 sm:border-0 sm:bg-transparent sm:p-0">
              <Input
                value={row.category}
                onChange={(e) => updateMenuRow(set, form, i, { category: e.target.value })}
                placeholder="Coffee"
                className="w-full sm:w-auto sm:flex-1 sm:min-w-28"
              />
              <Input
                value={row.name}
                onChange={(e) => updateMenuRow(set, form, i, { name: e.target.value })}
                placeholder="Cappuccino"
                className="min-w-0 flex-1 sm:min-w-28"
              />
              <Input
                type="number"
                min={0}
                value={row.price || ""}
                onChange={(e) => updateMenuRow(set, form, i, { price: Number(e.target.value) })}
                placeholder="₹"
                className="w-20 shrink-0"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => set("draftMenu", form.draftMenu.filter((_, j) => j !== i))} title="Remove row">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => set("draftMenu", [...form.draftMenu, { category: "", name: "", price: 0 }])}>
            <Plus className="size-3.5" /> Add menu item
          </Button>
        </div>

        {/* STEP 5 · Google Reviews */}
        <div className={step === 4 ? "space-y-3" : "hidden"}>
          <Field label="Google review URL" hint="Optional — the customer app's review button uses this exact link.">
            <Input type="url" value={form.googleReviewUrl} onChange={(e) => set("googleReviewUrl", e.target.value)} placeholder="https://g.page/r/your-store/review" />
          </Field>
        </div>

        {/* STEP 6 · Social */}
        <div className={step === 5 ? "grid gap-3 sm:grid-cols-2" : "hidden"}>
          {(
            [
              ["Instagram", "instagram", "https://instagram.com/your.store"],
              ["Facebook", "facebook", "https://facebook.com/your.store"],
              ["YouTube", "youtube", "https://youtube.com/@yourstore"],
              ["Website", "website", "https://your.store"],
            ] as const
          ).map(([label, key, ph]) => (
            <Field key={key} label={label} hint="Optional">
              <Input value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={ph} />
            </Field>
          ))}
        </div>

        {/* STEP 7 · Wi-Fi */}
        <div className={step === 6 ? "space-y-3" : "hidden"}>
          <div className="flex items-center justify-between rounded-xl border border-linen bg-paper px-4 py-3">
            <div>
              <p className="text-[13px] font-bold text-espresso">Enable Wi-Fi sharing</p>
              <p className="text-[11px] text-mocha">Only the network name and message are ever shown to guests.</p>
            </div>
            <ToggleField checked={form.wifiEnabled} name="_wifi" label="Wi-Fi sharing" onChange={(v) => set("wifiEnabled", v)} />
          </div>
          <Field label="Network name (SSID)">
            <Input value={form.wifiSsid} onChange={(e) => set("wifiSsid", e.target.value)} placeholder="BAKE-Guest" />
          </Field>
          <Field label="Customer-facing message">
            <Textarea value={form.wifiMessage} onChange={(e) => set("wifiMessage", e.target.value)} placeholder="You're connected — enjoy a slow coffee on us." />
          </Field>
        </div>

        {/* STEP 8 · Loyalty */}
        <div className={step === 7 ? "space-y-3" : "hidden"}>
          <div className="flex items-center justify-between rounded-xl border border-linen bg-paper px-4 py-3">
            <div>
              <p className="text-[13px] font-bold text-espresso">Enable loyalty programme</p>
              <p className="text-[11px] text-mocha">Stamp cards appear in the customer and staff apps.</p>
            </div>
            <ToggleField checked={form.loyaltyEnabled} name="_loyalty" label="Loyalty" onChange={(v) => set("loyaltyEnabled", v)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Stamp target" required>
              <Input type="number" min={1} max={30} value={form.stampTarget} onChange={(e) => set("stampTarget", Number(e.target.value) || 0)} />
            </Field>
            <Field label="Reward name" required>
              <Input value={form.rewardName} onChange={(e) => set("rewardName", e.target.value)} placeholder="Free Coffee" />
            </Field>
          </div>
          <Field label="Reward description">
            <Textarea value={form.rewardDescription} onChange={(e) => set("rewardDescription", e.target.value)} placeholder="Collect 8 stamps to get a free coffee on us!" />
          </Field>
          <Field label="Reward image">
            <ImagePicker name="_reward" defaultValue={form.rewardImageUrl} aspect="aspect-[16/9]" onChange={(v) => set("rewardImageUrl", v || null)} />
          </Field>
        </div>

        {/* STEP 9 · AI */}
        <div className={step === 8 ? "space-y-3" : "hidden"}>
          <div className="flex items-center justify-between rounded-xl border border-linen bg-paper px-4 py-3">
            <div>
              <p className="text-[13px] font-bold text-espresso">Enable AI review writing</p>
              <p className="text-[11px] text-mocha">Configuration only — no AI provider is called during publish. Keys stay server-side.</p>
            </div>
            <ToggleField checked={form.aiEnabled} name="_ai" label="AI review" onChange={(v) => set("aiEnabled", v)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Monthly request limit">
              <Input type="number" min={0} value={form.aiMonthlyLimit} onChange={(e) => set("aiMonthlyLimit", Number(e.target.value) || 0)} />
            </Field>
            <Field label="Price (₹ / month)">
              <Input type="number" min={0} value={form.aiPrice} onChange={(e) => set("aiPrice", Number(e.target.value) || 0)} />
            </Field>
          </div>
        </div>

        {/* STEP 10 · Review & Publish */}
        <div className={step === 9 ? "space-y-4" : "hidden"}>
          <SectionTitle>Store summary</SectionTitle>
          <Summary form={form} />
          {phase === "publishing" || phase === "error" || phase === "success" ? (
            <div className="rounded-xl border border-linen bg-paper p-3">
              <p className="label-caps mb-2">Publish progress</p>
              <ul className="space-y-1 text-[11.5px]">
                {PUBLISH_STAGES.map((label, i) => (
                  <li key={label} className={cn(stages[i] === "fail" ? "font-bold text-ember" : stages[i] === "ok" ? "text-stamp" : stages[i] === "active" ? "text-espresso" : "text-mocha/60")}>
                    {stages[i] === "ok" ? "✓" : stages[i] === "fail" ? "✕" : stages[i] === "active" ? "…" : "·"} {i + 1}. {label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {publishError ? (
            <div role="alert" className="whitespace-pre-line break-words rounded-xl bg-ember/8 px-3 py-2 text-[12px] text-ember">
              <p className="font-bold">Publishing failed</p>
              {publishError.code ? <p className="mt-1 font-mono text-[10.5px]">Error code: {publishError.code}</p> : null}
              <p className="mt-1">{publishError.message}</p>
            </div>
          ) : null}
        </div>

        {/* step errors */}
        {stepErrors.length ? (
          <div role="alert" className="mt-4 rounded-xl bg-ember/8 px-3 py-2 text-[12px] text-ember">
            <p className="font-bold">Complete these required fields:</p>
            <ul className="mt-1 list-inside list-disc">
              {stepErrors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* footer controls */}
        <div className="mt-6 border-t border-linen pt-4 pb-[env(safe-area-inset-bottom)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-2 sm:contents">
              <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || phase === "publishing"}>
                <ChevronLeft className="size-4" /> Back
              </Button>
              <span className="label-caps">
                Step {step + 1} / {STEPS.length}
              </span>
            </div>
            <div className="flex flex-col gap-2 min-[380px]:flex-row">
              <Button type="button" variant="outline" className="w-full min-[380px]:w-auto" onClick={() => saveDraft()} disabled={savingDraft || phase === "publishing"}>
                {savingDraft ? "Saving…" : "Save Draft"}
              </Button>
              {step < STEPS.length - 1 ? (
                <Button type="button" className="w-full min-[380px]:w-auto" onClick={next}>
                  Continue <ChevronRight className="size-4" />
                </Button>
              ) : (
                <Button type="button" className="w-full min-[380px]:w-auto" onClick={publish} disabled={phase === "publishing"} variant={phase === "error" ? "danger" : "primary"}>
                  {phase === "publishing" ? "Publishing Store…" : phase === "error" ? "Publish Failed — Try Again" : "Publish Store"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function updateMenuRow(
  set: <K extends keyof StoreFormData>(k: K, v: StoreFormData[K]) => void,
  form: StoreFormData,
  index: number,
  patch: Partial<DraftMenuItem>,
) {
  set(
    "draftMenu",
    form.draftMenu.map((row, i) => (i === index ? { ...row, ...patch } : row)),
  );
}

function Summary({ form }: { form: StoreFormData }) {
  const missing = validateStoreForPublish(form);
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-3 border-b border-linen py-1.5 text-[12px] last:border-0">
      <span className="label-caps pt-0.5">{label}</span>
      <span className="text-right font-semibold text-espresso">{value || "—"}</span>
    </div>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <p className="label-caps mb-1">Business</p>
        {row("Store name", form.businessName)}
        {row("Phone", form.phone)}
        {row("Address", form.address)}
        {row("Email", form.email)}
        <p className="label-caps mb-1 mt-4">Branding</p>
        {row("Logo", form.logoUrl ? "Uploaded" : "Not set")}
        {row("Primary colour", form.primaryColor)}
        {row("Secondary colour", form.secondaryColor)}
        {row("Theme", `${form.backgroundColor} / ${form.textColor}`)}
      </div>
      <div>
        <p className="label-caps mb-1">Customer experience</p>
        {row("Google Review URL", form.googleReviewUrl ? "Connected" : "Not set")}
        {row("Instagram", form.instagram ? "Connected" : "Not set")}
        {row("Wi-Fi", form.wifiEnabled ? form.wifiSsid || "Enabled" : "Off")}
        {row("Loyalty", form.loyaltyEnabled ? `${form.stampTarget} stamps → ${form.rewardName}` : "Off")}
        {row("QR", "Main + Counter generated on publish")}
        {row("Starter menu", form.draftMenu.length ? `${form.draftMenu.length} items` : "None")}
        <p className="label-caps mb-1 mt-4">AI</p>
        {row("AI review writing", form.aiEnabled ? "Enabled" : "Disabled")}
        {row("Monthly request limit", String(form.aiMonthlyLimit))}
        {row("Pricing", `₹${form.aiPrice}/month`)}
      </div>
      {missing.length ? (
        <div className="sm:col-span-2 rounded-xl bg-gold/10 px-3 py-2 text-[11.5px] text-[#8a5f10]">
          <span className="font-bold">Still required before publish:</span> {missing.join(" · ")}
        </div>
      ) : (
        <div className="sm:col-span-2 rounded-xl bg-stamp/10 px-3 py-2 text-[11.5px] font-semibold text-stamp">
          ✓ All required fields complete — ready to publish.
        </div>
      )}
      {/* keep Link import useful for future deep links */}
      <span className="hidden">
        <Link href="/admin">·</Link>
      </span>
    </div>
  );
}
