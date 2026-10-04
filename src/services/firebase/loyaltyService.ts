import { doc, increment, updateDoc } from "firebase/firestore";
import { COL, SUB, create, createSub, db, getById, newId, patch, txId } from "@/lib/firebase/firestore";
import type { Actor, LoyaltyDoc } from "@/lib/firebase/types";
import { activityService } from "./activityService";
import { metricsService } from "./analyticsService";
import { clientService } from "./clientService";
import { rewardService } from "./rewardService";

const now = () => Date.now();

/**
 * Loyalty configuration lives embedded at clients/{clientId}.loyalty;
 * balances at loyaltyAccounts/{customerId}; the ledger is the append-only
 * clients/{clientId}/stampTransactions subcollection. Corrections are
 * adjustment transactions — never edits of history.
 */
export const loyaltyService = {
  async adjust(
    actor: Actor,
    clientId: string,
    customerId: string,
    delta: number,
    reason: string,
    actorType: "ADMIN" | "STAFF" = "ADMIN",
  ) {
    let account = await getById<LoyaltyDoc>(COL.loyaltyAccounts, customerId);
    if (account && account.clientId !== clientId) throw new Error("Customer belongs to another business.");
    if (!account) {
      await create(COL.loyaltyAccounts, customerId, {
        clientId,
        customerId,
        stamps: 0,
        lifetimeStamps: 0,
        rewardsEarned: 0,
        rewardsRedeemed: 0,
        updatedAt: now(),
      });
      account = (await getById<LoyaltyDoc>(COL.loyaltyAccounts, customerId))!;
    }
    const next = Math.max(0, account.stamps + delta);
    const transactionId = txId();
    await patch(COL.loyaltyAccounts, customerId, {
      stamps: next,
      lifetimeStamps: Math.max(0, account.lifetimeStamps + Math.max(0, delta)),
      updatedAt: now(),
    });
    await createSub(clientId, SUB.stampTransactions, newId("txn"), {
      customerId,
      transactionId,
      delta,
      reason: reason || (delta > 0 ? "Stamp added" : "Stamp adjusted"),
      actorType,
      actorName: actor.name,
      createdAt: now(),
    });
    if (delta > 0) {
      await updateDoc(doc(db(), COL.customers, customerId), {
        totalVisits: increment(1),
        lastVisitAt: now(),
      });
      await metricsService.record(clientId, "stamps", delta).catch(() => undefined);
    }
    await activityService.log(
      actor,
      clientId,
      delta > 0 ? "STAMP_ADDED" : "STAMP_ADJUSTED",
      customerId,
      { delta, reason, transactionId },
      { before: { stamps: account.stamps }, after: { stamps: next } },
    );
    return { stamps: next, transactionId };
  },

  async reset(actor: Actor, clientId: string, customerId: string) {
    const account = await getById<LoyaltyDoc>(COL.loyaltyAccounts, customerId);
    return this.adjust(actor, clientId, customerId, -(account?.stamps ?? 0), "Loyalty card reset by admin");
  },

  async redeem(actor: Actor, clientId: string, customerId: string, actorType: "ADMIN" | "STAFF" = "ADMIN") {
    const [account, bundle] = await Promise.all([
      getById<LoyaltyDoc>(COL.loyaltyAccounts, customerId),
      clientService.get(clientId),
    ]);
    const target = bundle?.settings.stampTarget ?? 8;
    const rewardName = bundle?.settings.rewardName ?? "Reward";
    if (!account || account.clientId !== clientId || account.stamps < target)
      throw new Error(`This customer needs ${target - (account?.stamps ?? 0)} more stamps.`);
    const transactionId = txId();
    await patch(COL.loyaltyAccounts, customerId, {
      stamps: account.stamps - target,
      rewardsRedeemed: account.rewardsRedeemed + 1,
      updatedAt: now(),
    });
    await createSub(clientId, SUB.rewardRedemptions, newId("rdm"), {
      customerId,
      rewardName,
      stampCost: target,
      actorName: actor.name,
      createdAt: now(),
    });
    await createSub(clientId, SUB.stampTransactions, newId("txn"), {
      customerId,
      transactionId,
      delta: -target,
      reason: `${rewardName} redeemed`,
      actorType,
      actorName: actor.name,
      createdAt: now(),
    });
    await metricsService.record(clientId, "rewards", 1).catch(() => undefined);
    await activityService.log(actor, clientId, "REWARD_REDEEMED", customerId, { rewardName, stampCost: target, transactionId });
    return { rewardName, transactionId };
  },

  /** Saves the embedded clients/{id}.loyalty config — Customer & Staff apps read it live. */
  async saveSettings(
    actor: Actor,
    clientId: string,
    input: {
      loyaltyEnabled: boolean;
      stampTarget: number;
      rewardName: string;
      rewardDescription: string;
      rewardImageUrl: string | null;
    },
  ) {
    const target = Math.max(1, Math.min(30, Number(input.stampTarget) || 8));
    await clientService.updateSettings(
      actor,
      clientId,
      {
        loyaltyEnabled: input.loyaltyEnabled,
        stampTarget: target,
        rewardName: input.rewardName,
        rewardDescription: input.rewardDescription,
        rewardImageUrl: input.rewardImageUrl,
      },
      "LOYALTY_UPDATED",
    );
    await rewardService
      .syncWithLoyalty(clientId, input.rewardName, input.rewardDescription, target, input.rewardImageUrl)
      .catch(() => undefined);
    return target;
  },
};
