import { orderBy, where } from "firebase/firestore";
import { COL, create, listWhere, newId, txId } from "@/lib/firebase/firestore";
import type { Actor, ActivityDoc } from "@/lib/firebase/types";

const byDesc = (a: ActivityDoc, b: ActivityDoc) => b.createdAt - a.createdAt;

/**
 * Append-only audit trail (activityLogs). Records carry actorUid, actorRole,
 * clientId, action, targetId and optional before/after snapshots. Security
 * Rules forbid update/delete — corrections are new records.
 */
export const activityService = {
  async log(
    actor: Actor,
    clientId: string | null,
    action: string,
    target = "",
    metadata: Record<string, unknown> = {},
    snapshots?: { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null },
  ) {
    await create(COL.activityLogs, newId("log"), {
      clientId,
      actorUid: actor.uid,
      actorName: actor.name,
      actorRole: actor.role,
      action,
      target,
      targetId: target,
      transactionId: txId(),
      before: snapshots?.before ?? null,
      after: snapshots?.after ?? null,
      metadata,
      createdAt: Date.now(),
    });
  },

  async forClient(clientId: string): Promise<ActivityDoc[]> {
    const rows = await listWhere<ActivityDoc>(COL.activityLogs, [where("clientId", "==", clientId)], 300);
    return rows.sort(byDesc);
  },

  /** Platform-wide for SUPER_ADMIN (null); otherwise only the assigned clients. */
  async global(allowedClientIds: string[] | null): Promise<ActivityDoc[]> {
    if (allowedClientIds === null) {
      return listWhere<ActivityDoc>(COL.activityLogs, [orderBy("createdAt", "desc")], 150);
    }
    const chunks = await Promise.all(
      allowedClientIds.slice(0, 10).map((cid) => listWhere<ActivityDoc>(COL.activityLogs, [where("clientId", "==", cid)], 100)),
    );
    return chunks.flat().sort(byDesc).slice(0, 150);
  },
};
