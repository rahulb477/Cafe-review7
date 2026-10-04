"use client";

import { use, useState } from "react";
import { BadgePercent, Gift } from "lucide-react";
import { ClientPage, opToast, type ClientCtx } from "@/components/admin-page";
import { ToggleField } from "@/components/toggle-field";
import { ImagePicker } from "@/components/image-picker";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SectionTitle,
  StampCard,
  Textarea,
  shortDate,
} from "@/components/ui";
import { loyaltyService, rewardService } from "@/lib/firebase/services";
import { runOp, useLoad } from "@/lib/use-load";

export default function LoyaltyPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <Loyalty ctx={ctx} />}</ClientPage>;
}

function Loyalty({ ctx }: { ctx: ClientCtx }) {
  const { client, settings, actor } = ctx;
  const [enabled, setEnabled] = useState(settings.loyaltyEnabled);
  const rewardsLoad = useLoad(
    async () => ({
      rewards: await rewardService.list(client.id),
      redemptions: await rewardService.redemptions(client.id),
    }),
    [client.id],
  );

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    runOp(
      () =>
        loyaltyService.saveSettings(actor, client.id, {
          loyaltyEnabled: enabled,
          stampTarget: Number(fd.get("stampTarget") ?? 8),
          rewardName: String(fd.get("rewardName") ?? "Free Coffee"),
          rewardDescription: String(fd.get("rewardDescription") ?? ""),
          rewardImageUrl: String(fd.get("rewardImageUrl") ?? "") || null,
        }),
      opToast(() => {
        ctx.reloadClient();
        rewardsLoad.reload();
      }),
      "Loyalty saved — live in the Customer and Staff apps",
    );
  };

  const addReward = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    runOp(
      () =>
        rewardService.save(actor, client.id, {
          name: String(fd.get("name") ?? ""),
          description: String(fd.get("description") ?? ""),
          stampTarget: Number(fd.get("stampTarget") ?? settings.stampTarget),
          active: true,
        }),
      opToast(rewardsLoad.reload),
      "Reward saved",
    );
  };

  return (
    <>
      <PageHeader
        eyebrow={client.displayName}
        title="Store Loyalty"
        subtitle="The stamp card shown in both the customer and staff apps — nothing here is hardcoded."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <form onSubmit={save}>
          <Card className="p-5">
            <SectionTitle>Programme</SectionTitle>
            <div className="mb-4 flex items-center justify-between rounded-xl border border-linen bg-paper px-4 py-3">
              <div>
                <p className="text-[13px] font-bold text-espresso">Enable Loyalty Program</p>
                <p className="text-[11px] text-mocha">Switching off hides the stamp card everywhere.</p>
              </div>
              <ToggleField checked={settings.loyaltyEnabled} name="loyaltyEnabled" label="Loyalty program" onChange={setEnabled} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Stamp target" hint="Number of stamps required for a reward.">
                <Input name="stampTarget" type="number" min={1} max={30} defaultValue={settings.stampTarget} />
              </Field>
              <Field label="Reward name">
                <Input name="rewardName" defaultValue={settings.rewardName} />
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Reward description">
                <Textarea name="rewardDescription" defaultValue={settings.rewardDescription} />
              </Field>
            </div>

            <div className="mt-4">
              <Field label="Reward image" hint="Uploads to ImgBB; only the URL is saved.">
                <ImagePicker name="rewardImageUrl" defaultValue={settings.rewardImageUrl} aspect="aspect-[16/9]" />
              </Field>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-linen pt-4">
              <p className="text-[11px] text-mocha">These settings are reflected in both Customer and Staff apps instantly.</p>
              <Button type="submit">Save loyalty</Button>
            </div>
          </Card>
        </form>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle>Live card preview</SectionTitle>
            <StampCard stamps={5} target={settings.stampTarget} rewardName={settings.rewardName} size={38} />
            <p className="mt-4 rounded-xl bg-linen/60 px-3 py-2 text-[11.5px] text-mocha">
              <span className="font-bold text-espresso">{settings.stampTarget} stamps</span> →{" "}
              <span className="font-bold text-espresso">{settings.rewardName}</span>. {settings.rewardDescription}
            </p>
          </Card>

          <Card className="p-5">
            <SectionTitle>Add reward</SectionTitle>
            <form onSubmit={addReward} className="space-y-3">
              <Field label="Reward name" required>
                <Input name="name" required placeholder="Free Pizza" />
              </Field>
              <Field label="Description">
                <Textarea name="description" className="min-h-16" placeholder="Collect 10 stamps and the pizza is on the house." />
              </Field>
              <Field label="Stamp cost">
                <Input name="stampTarget" type="number" min={1} defaultValue={settings.stampTarget} />
              </Field>
              <Button type="submit" variant="outline" size="sm">
                <Gift className="size-3.5" /> Save reward
              </Button>
            </form>
          </Card>
        </div>
      </div>

      <Card className="mt-5 p-5">
        <SectionTitle right={<Badge tone="neutral">{rewardsLoad.data?.rewards.length ?? 0} rewards</Badge>}>Reward catalogue</SectionTitle>
        {rewardsLoad.data?.rewards.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rewardsLoad.data.rewards.map((r) => (
              <li key={r.id} className="rounded-2xl border border-linen bg-paper p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="display-num text-lg text-espresso">{r.name}</p>
                  <Badge tone={r.active ? "green" : "neutral"}>{r.active ? "Active" : "Off"}</Badge>
                </div>
                <p className="mt-1 text-[11.5px] text-mocha">{r.description || "No description"}</p>
                <p className="label-caps mt-2">
                  <BadgePercent className="mr-1 inline size-3" />
                  {r.stampTarget} stamps
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No rewards yet" body="Create your first reward so staff know what a full card unlocks." />
        )}
      </Card>

      <Card className="mt-5 p-5">
        <SectionTitle>Recent redemptions</SectionTitle>
        {rewardsLoad.data?.redemptions.length ? (
          <ul className="divide-y divide-linen">
            {rewardsLoad.data.redemptions.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div>
                  <p className="text-[12.5px] font-bold text-espresso">{r.rewardName}</p>
                  <p className="text-[11px] text-mocha">
                    {r.stampCost} stamps · {r.actorName || "counter"}
                  </p>
                </div>
                <span className="text-[11px] text-mocha">{shortDate(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No redemptions yet" body="Rewards claimed at the counter show up here." />
        )}
      </Card>
    </>
  );
}
