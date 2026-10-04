"use client";

import { use, useState } from "react";
import { Sparkles } from "lucide-react";
import { ClientPage, opToast, type ClientCtx } from "@/components/admin-page";
import { ToggleField } from "@/components/toggle-field";
import { Badge, Button, Card, Field, Input, MeterBar, PageHeader, SectionTitle, SkeletonRows } from "@/components/ui";
import { aiService } from "@/lib/firebase/services";
import { runOp, useLoad } from "@/lib/use-load";

export default function AiReviewPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <AiReview ctx={ctx} />}</ClientPage>;
}

function AiReview({ ctx }: { ctx: ClientCtx }) {
  const { client, settings, actor } = ctx;
  const load = useLoad(
    () =>
      aiService.status(client.id, {
        aiEnabled: settings.aiEnabled,
        aiMonthlyLimit: settings.aiMonthlyLimit,
        aiPrice: settings.aiPrice,
      }),
    [client.id, settings.aiEnabled, settings.aiMonthlyLimit],
  );
  const [enabled, setEnabled] = useState(settings.aiEnabled);
  const status = load.data;

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    runOp(
      () => aiService.configure(actor, client.id, { aiEnabled: enabled, aiMonthlyLimit: Number(fd.get("aiMonthlyLimit") ?? 100) }),
      opToast(() => {
        ctx.reloadClient();
        load.reload();
      }),
      "AI review settings saved",
    );
  };

  return (
    <>
      <PageHeader
        eyebrow={`Billing ₹${status?.price ?? settings.aiPrice}/month · provider keys never reach the browser`}
        title="Store AI"
        subtitle="Automated reply writing for guest reviews. Usage is metered per calendar month in the aiUsage collection."
        actions={<Badge tone={settings.aiEnabled ? "green" : "neutral"}>{settings.aiEnabled ? "Enabled" : "Disabled"}</Badge>}
      />

      {!status ? (
        <SkeletonRows rows={2} />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Monthly limit", status.limit],
              ["Current usage", status.used],
              ["Remaining", status.remaining],
              ["Failed requests", status.failed],
            ].map(([label, value]) => (
              <Card key={String(label)} className="p-4">
                <p className="label-caps">{label}</p>
                <p className="display-num mt-1 text-[30px] text-espresso">{value as number}</p>
              </Card>
            ))}
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="p-5">
              <SectionTitle>Plan & usage</SectionTitle>
              <MeterBar
                label={`Requests used in ${status.month}`}
                value={status.used}
                max={Math.max(1, status.limit)}
                right={`${status.used} / ${status.limit}`}
              />
              <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                {[
                  ["Successful", status.success],
                  ["Failed", status.failed],
                  ["Price", `₹${status.price}/mo`],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-linen/60 px-3 py-2.5">
                    <dt className="label-caps">{label}</dt>
                    <dd className="display-num text-[22px] text-espresso">{value as string}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-5 border-t border-linen pt-4">
                <p className="label-caps mb-2">Monthly history</p>
                {status.history.length ? (
                  <ul className="divide-y divide-linen">
                    {status.history.map((h) => (
                      <li key={h.id} className="flex items-center justify-between py-2 text-[12px]">
                        <span className="font-semibold text-espresso">{h.month}</span>
                        <span className="text-mocha">
                          {h.requests} requests · {h.success} ok · {h.failed} failed
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-mocha">No AI usage recorded yet.</p>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <SectionTitle>Configuration</SectionTitle>
              <form onSubmit={save} className="space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-linen bg-paper px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-espresso" />
                    <div>
                      <p className="text-[13px] font-bold text-espresso">AI Review Enabled</p>
                      <p className="text-[11px] text-mocha">Metered monthly, enforced on every request.</p>
                    </div>
                  </div>
                  <ToggleField checked={settings.aiEnabled} name="aiEnabled" label="AI review" onChange={setEnabled} />
                </div>
                <Field label="Monthly limit" hint="Requests are rejected once the limit is reached.">
                  <Input name="aiMonthlyLimit" type="number" min={0} defaultValue={settings.aiMonthlyLimit} />
                </Field>
                <Button type="submit">Save AI settings</Button>
              </form>
              <p className="mt-4 rounded-xl bg-linen/60 px-3 py-2 text-[11px] text-mocha">
                AI provider credentials are configured server-side (Cloud Functions / trusted backend) and are never
                written to Firestore or exposed to the admin, customer or staff apps.
              </p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
