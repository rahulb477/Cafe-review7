import { where } from "firebase/firestore";
import { createStaffAuthAccount, sendReset } from "@/lib/firebase/auth";
import { COL, create, getById, listWhere, patch, remove } from "@/lib/firebase/firestore";
import type { Actor, StaffDoc } from "@/lib/firebase/types";
import { activityService } from "./activityService";

const now = () => Date.now();

/**
 * staffUsers/{uid} — credentials live in Firebase Auth, never in Firestore.
 * Each document carries clientId (primary) and clientIds (assignments) so the
 * Staff App can verify tenant access on every session.
 */
export const staffService = {
  async list(clientId: string): Promise<StaffDoc[]> {
    const rows = await listWhere<StaffDoc>(COL.staffUsers, [where("clientId", "==", clientId)], 100);
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },

  async byUid(uid: string): Promise<StaffDoc | null> {
    return getById<StaffDoc>(COL.staffUsers, uid);
  },

  async create(
    actor: Actor,
    clientId: string,
    input: { name: string; email: string; staffId: string; password: string; role: string; status: string },
  ) {
    if (!input.name.trim() || !input.email.trim()) throw new Error("Name and email are required.");
    if (input.password.length < 6) throw new Error("Password must be at least 6 characters.");
    // Firebase Auth account on a secondary app — the admin session is untouched.
    const uid = await createStaffAuthAccount(input.email, input.password);
    await create(COL.staffUsers, uid, {
      uid,
      clientId,
      clientIds: [clientId],
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      staffId: input.staffId.trim() || `STF${Date.now().toString().slice(-5)}`,
      role: input.role,
      status: input.status,
      createdAt: now(),
      updatedAt: now(),
    });
    await activityService.log(actor, clientId, "STAFF_CREATED", `${input.name} (${input.role})`, {}, {
      after: { uid, email: input.email, role: input.role },
    });
    return uid;
  },

  async update(actor: Actor, clientId: string, staffUid: string, input: Partial<StaffDoc>) {
    const before = await getById<StaffDoc>(COL.staffUsers, staffUid);
    const data: Record<string, unknown> = { updatedAt: now() };
    for (const key of ["name", "email", "staffId", "role", "status"] as const) {
      if (input[key] !== undefined) data[key] = input[key];
    }
    await patch(COL.staffUsers, staffUid, data);
    await activityService.log(actor, clientId, "STAFF_UPDATED", String(input.name ?? staffUid), {}, {
      before: before ? { role: before.role, status: before.status } : null,
      after: { role: input.role, status: input.status },
    });
  },

  /** Disabled staff are rejected by the Staff App and by Security Rules — not just hidden UI. */
  async setStatus(actor: Actor, clientId: string, staffUid: string, status: "ACTIVE" | "INACTIVE") {
    const before = await getById<StaffDoc>(COL.staffUsers, staffUid);
    await patch(COL.staffUsers, staffUid, { status, updatedAt: now() });
    await activityService.log(actor, clientId, status === "ACTIVE" ? "STAFF_ENABLED" : "STAFF_DISABLED", staffUid, {}, {
      before: { status: before?.status },
      after: { status },
    });
  },

  /** Firebase Auth owns the credential — we send the official reset email. */
  async resetPassword(actor: Actor, clientId: string, email: string) {
    await sendReset(email);
    await activityService.log(actor, clientId, "STAFF_PASSWORD_RESET", email);
  },

  async removeStaff(actor: Actor, clientId: string, staffUid: string) {
    await remove(COL.staffUsers, staffUid);
    await activityService.log(actor, clientId, "STAFF_REMOVED", staffUid);
  },
};
