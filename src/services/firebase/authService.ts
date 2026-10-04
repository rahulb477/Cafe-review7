import {
  authErrorMessage,
  createStaffAuthAccount,
  firebaseAuth,
  sendReset,
  signInWithPassword,
  signOutUser,
  watchAuth,
} from "@/lib/firebase/auth";
import { COL, getById, listWhere } from "@/lib/firebase/firestore";
import type { AdminDoc } from "@/lib/firebase/types";

/** Firebase Authentication wrapper — credentials never touch Firestore. */
export const authService = {
  firebaseAuth,
  watchAuth,
  signInWithPassword,
  signOutUser,
  sendReset,
  createStaffAuthAccount,
  authErrorMessage,
};

/** Admin role documents (admins/{uid}) with clientIds assignments. */
export const adminService = {
  async byUid(uid: string): Promise<AdminDoc | null> {
    return getById<AdminDoc>(COL.admins, uid);
  },

  async listAdmins(): Promise<AdminDoc[]> {
    return listWhere<AdminDoc>(COL.admins, [], 50);
  },

  /**
   * Deterministic store resolution for a non-super admin:
   * primary `clientId` first, then legacy `clientIds[]` (backward compatible
   * with existing assignments the Staff/Customer apps rely on).
   */
  async assignmentsFor(uid: string): Promise<string[]> {
    const admin = await getById<AdminDoc>(COL.admins, uid);
    if (!admin) return [];
    const ids = new Set<string>();
    if (admin.clientId) ids.add(admin.clientId);
    for (const id of admin.clientIds ?? []) ids.add(id);
    return Array.from(ids);
  },

  /** The admin's single primary store id, or null if Store Setup has not run. */
  primaryStoreOf(admin: AdminDoc | null): string | null {
    if (!admin) return null;
    return admin.clientId ?? admin.clientIds?.[0] ?? null;
  },

};
