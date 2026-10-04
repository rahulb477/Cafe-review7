"use client";

import { use } from "react";
import { ClientPage, type ClientCtx } from "@/components/admin-page";
import { CustomerLoyaltyActions } from "@/components/staff-actions";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SectionTitle,
  SkeletonRows,
  StampCard,
  shortDate,
  shortTime,
} from "@/components/ui";
import { customerService } from "@/lib/firebase/services";
import { useLoad } from "@/lib/use-load";

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ clientId: string; customerId: string }>;
}) {
  const { clientId, customerId } = use(params);
  return <ClientPage clientId={clientId}>{(ctx) => <Detail ctx={ctx} customerId={customerId} />}</ClientPage>;
}

function Detail({ ctx, customerId }: { ctx: ClientCtx; customerId: string }) {
  const { client, settings, actor } = ctx;
  const load = useLoad(() => customerService.detail(client.id, customerId), [client.id, customerId]);

  if (load.loading && !load.data) return <SkeletonRows rows={4} />;
  if (load.error && !load.data) return <ErrorState message={load.error} action={<Button onClick={load.reload}>Retry</Button>} />;
  if (!load.data)
    return <EmptyState title="Customer not found" body="They may have been removed, or they belong to another business." />;

  const { customer, account, txs, redemptions } = load.data;
  const target = settings.stampTarget;
  const current = account?.stamps ?? 0;

  return (
    <>
      <PageHeader
        eyebrow={`${customer.code} · joined ${shortDate(customer.createdAt)}`}
        title={customer.name}
        subtitle={`${customer.email || customer.phone || "No contact on file"} · ${customer.totalVisits} visits`}
        actions={
          <CustomerLoyaltyActions
            actor={actor}
            clientId={client.id}
            customerId={customer.id}
            target={target}
            rewardName={settings.rewardName}
            stamps={current}
            reload={load.reload}
          />
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle>Loyalty progress</SectionTitle>
            <div className="mb-4 flex items-center gap-4">
              <Avatar name={customer.name} size={56} />
              <div>
                <p className="display-num text-[34px] leading-none text-espresso">
                  {current}
                  <span className="text-[20px] text-mocha">/{target}</span>
                </p>
                <p className="text-[12px] text-mocha">
                  {current >= target ? (
                    <Badge tone="gold">{settings.rewardName} ready</Badge>
                  ) : (
                    `${target - current} stamps to ${settings.rewardName}`
                  )}
                </p>
              </div>
            </div>
            <StampCard stamps={current} target={target} rewardName={settings.rewardName} />
            <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-linen pt-4">
              {[
                ["Lifetime stamps", account?.lifetimeStamps ?? 0],
                ["Rewards earned", account?.rewardsEarned ?? 0],
                ["Rewards redeemed", account?.rewardsRedeemed ?? 0],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt className="label-caps">{label}</dt>
                  <dd className="display-num text-[22px] text-espresso">{value as number}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-5">
            <SectionTitle right={<span className="text-[11px] text-mocha">append-only ledger</span>}>Stamp history</SectionTitle>
            {txs.length ? (
              <ul className="divide-y divide-linen">
                {txs.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] text-mocha">{t.transactionId}</p>
                      <p className="text-[12.5px] font-semibold text-espresso">{t.reason}</p>
                      <p className="text-[11px] text-mocha">
                        {t.actorName} · {t.actorType} · {shortTime(t.createdAt)}
                      </p>
                    </div>
                    <span className={t.delta > 0 ? "font-bold text-stamp" : "font-bold text-ember"}>
                      {t.delta > 0 ? `+${t.delta}` : t.delta}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No stamp activity" body="Every stamp added, adjusted or spent appears here with a transaction ID." />
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <SectionTitle>Customer information</SectionTitle>
            <dl className="space-y-2.5 text-[12.5px]">
              {[
                ["Customer ID", customer.code],
                ["Name", customer.name],
                ["Phone", customer.phone || "—"],
                ["Email", customer.email || "—"],
                ["Total visits", String(customer.totalVisits)],
                ["Last visit", shortTime(customer.lastVisitAt)],
                ["Joined", shortDate(customer.createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-linen pb-2 last:border-0">
                  <dt className="label-caps pt-0.5">{label}</dt>
                  <dd className="text-right font-semibold text-espresso">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card className="p-5">
            <SectionTitle>Reward history</SectionTitle>
            {redemptions.length ? (
              <ul className="space-y-2.5">
                {redemptions.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-3 rounded-xl bg-linen/50 px-3 py-2">
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
              <EmptyState title="No rewards yet" body="Redeemed rewards will be listed here with the staff member who issued them." />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
