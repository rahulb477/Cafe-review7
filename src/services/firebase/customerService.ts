import { where } from "firebase/firestore";
import { COL, SUB, create, getById, listByClient, listSub, newId, watchWhere } from "@/lib/firebase/firestore";
import type { Actor, CustomerDoc, LoyaltyDoc, RedemptionDoc, StampTxDoc } from "@/lib/firebase/types";
import { activityService } from "./activityService";

const now = () => Date.now();
const byDesc = <T extends { createdAt: number }>(a: T, b: T) => b.createdAt - a.createdAt;

export type CustomerWithLoyalty = CustomerDoc & { account: LoyaltyDoc | null };

/** customers/{customerId} — top-level, always carrying clientId. */
export const customerService = {
  async list(clientId: string): Promise<CustomerWithLoyalty[]> {
    const [customers, accounts] = await Promise.all([
      listByClient<CustomerDoc>(COL.customers, clientId, 400),
      listByClient<LoyaltyDoc>(COL.loyaltyAccounts, clientId, 400),
    ]);
    return customers
      .sort((a, b) => (b.lastVisitAt ?? 0) - (a.lastVisitAt ?? 0))
      .map((c) => ({ ...c, account: accounts.find((a) => a.customerId === c.id) ?? null }));
  },

  /** Real-time customers + loyalty for the Staff App counter view. */
  watchList(
    clientId: string,
    onData: (rows: CustomerWithLoyalty[]) => void,
    onError?: (message: string) => void,
  ) {
    let customers: CustomerDoc[] = [];
    let accounts: LoyaltyDoc[] = [];
    const emit = () =>
      onData(
        customers
          .slice()
          .sort((a, b) => (b.lastVisitAt ?? 0) - (a.lastVisitAt ?? 0))
          .map((c) => ({ ...c, account: accounts.find((a) => a.customerId === c.id) ?? null })),
      );
    const un1 = watchWhere<CustomerDoc>(COL.customers, [where("clientId", "==", clientId)], (rows) => {
      customers = rows;
      emit();
    }, onError);
    const un2 = watchWhere<LoyaltyDoc>(COL.loyaltyAccounts, [where("clientId", "==", clientId)], (rows) => {
      accounts = rows;
      emit();
    }, onError);
    return () => {
      un1();
      un2();
    };
  },

  async detail(clientId: string, customerId: string) {
    const customer = await getById<CustomerDoc>(COL.customers, customerId);
    if (!customer || customer.clientId !== clientId) return null;
    const [account, txs, redemptions] = await Promise.all([
      getById<LoyaltyDoc>(COL.loyaltyAccounts, customerId),
      listSub<StampTxDoc>(clientId, SUB.stampTransactions, [where("customerId", "==", customerId)], 50),
      listSub<RedemptionDoc>(clientId, SUB.rewardRedemptions, [where("customerId", "==", customerId)], 50),
    ]);
    return {
      customer,
      account,
      txs: txs.sort(byDesc),
      redemptions: redemptions.sort(byDesc),
    };
  },

  async create(actor: Actor, clientId: string, input: { name: string; phone: string; email: string }) {
    if (!input.name.trim()) throw new Error("Customer name is required.");
    const id = newId("cus");
    const code = `#C${Math.floor(1000 + Math.random() * 8999)}`;
    await create(COL.customers, id, {
      clientId,
      code,
      name: input.name.trim(),
      phone: input.phone,
      email: input.email,
      totalVisits: 0,
      lastVisitAt: null,
      createdAt: now(),
    });
    await create(COL.loyaltyAccounts, id, {
      clientId,
      customerId: id,
      stamps: 0,
      lifetimeStamps: 0,
      rewardsEarned: 0,
      rewardsRedeemed: 0,
      updatedAt: now(),
    });
    await activityService.log(actor, clientId, "CUSTOMER_CREATED", `${input.name} ${code}`);
    return { id, code };
  },
};
