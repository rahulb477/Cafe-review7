import { SUB, createSub, listSub, newId, patchSub } from "@/lib/firebase/firestore";
import type { Actor, RedemptionDoc, RewardDoc } from "@/lib/firebase/types";
import { activityService } from "./activityService";

const now = () => Date.now();

/** Rewards catalogue at clients/{clientId}/rewards; redemptions are read-only history. */
export const rewardService = {
  async list(clientId: string): Promise<RewardDoc[]> {
    return listSub<RewardDoc>(clientId, SUB.rewards, [], 30);
  },

  async save(
    actor: Actor,
    clientId: string,
    input: { name: string; description: string; stampTarget: number; active: boolean },
  ) {
    await createSub(clientId, SUB.rewards, newId("rwd"), {
      name: input.name,
      description: input.description,
      imageUrl: null,
      stampTarget: input.stampTarget,
      active: input.active,
      createdAt: now(),
    });
    await activityService.log(actor, clientId, "REWARD_UPDATED", input.name, {}, { after: { ...input } });
  },

  async syncWithLoyalty(clientId: string, name: string, description: string, stampTarget: number, imageUrl: string | null) {
    const rewards = await listSub<RewardDoc>(clientId, SUB.rewards, [], 30);
    await Promise.all(
      rewards.map((r) => patchSub(clientId, SUB.rewards, r.id, { name, description, stampTarget, imageUrl })),
    );
  },

  async redemptions(clientId: string): Promise<RedemptionDoc[]> {
    const rows = await listSub<RedemptionDoc>(clientId, SUB.rewardRedemptions, [], 50);
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
};
