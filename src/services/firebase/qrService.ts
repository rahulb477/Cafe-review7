import { SUB, createSub, listSub, newId, patchSub, removeSub } from "@/lib/firebase/firestore";
import type { Actor, QrDoc } from "@/lib/firebase/types";
import { activityService } from "./activityService";

/**
 * QR configurations at clients/{clientId}/qrConfigurations. The encoded URL
 * only ever contains the public slug (and optional table number) — never
 * customer-sensitive data.
 */
export const qrService = {
  async list(clientId: string): Promise<QrDoc[]> {
    const rows = await listSub<QrDoc>(clientId, SUB.qrConfigurations, [], 60);
    return rows.sort((a, b) => a.createdAt - b.createdAt);
  },

  async createConfig(actor: Actor, clientId: string, input: Omit<QrDoc, "id" | "clientId" | "createdAt">) {
    await createSub(clientId, SUB.qrConfigurations, newId("qrc"), { ...input, active: true, createdAt: Date.now() });
    await activityService.log(actor, clientId, "QR_GENERATED", input.label || input.type);
  },

  async updateConfig(actor: Actor, clientId: string, id: string, input: Partial<QrDoc>) {
    await patchSub(clientId, SUB.qrConfigurations, id, {
      label: input.label,
      heading: input.heading,
      subtitle: input.subtitle,
    });
    await activityService.log(actor, clientId, "QR_UPDATED", String(input.label ?? id));
  },

  async removeConfig(actor: Actor, clientId: string, id: string) {
    await removeSub(clientId, SUB.qrConfigurations, id);
    await activityService.log(actor, clientId, "QR_DELETED", id);
  },

  path(slug: string, cfg: { type: string; tableNumber: number | null }) {
    return cfg.type === "TABLE" && cfg.tableNumber ? `/${slug}?table=${cfg.tableNumber}` : `/${slug}`;
  },
};
