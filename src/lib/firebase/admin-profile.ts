import type { User } from "firebase/auth";
import { SUPER_ADMIN_EMAIL, SUPER_ADMIN_UID } from "@/services/firebase/firebaseClient";
import { COL, create, getById, patch } from "./firestore";
import type { AdminDoc } from "./types";

/**
 * Typed failures for the post-authentication steps so the UI can show the
 * precise problem instead of a generic "sign-in failed":
 *
 *  UID_MISMATCH        — signed in as the Super Admin email but a different UID
 *  FIRESTORE_DENIED    — auth OK, but Security Rules refused admins/{uid}
 *  SUPER_PROFILE_MISSING — admins/{SUPER_ADMIN_UID} does not exist
 *  NOT_AN_ADMIN        — authenticated user has no admins/{uid} document
 *  ADMIN_DISABLED      — admins/{uid}.status !== ACTIVE
 */
export class AdminResolveError extends Error {
  step: string;
  code:
    | "UID_MISMATCH"
    | "FIRESTORE_DENIED"
    | "SUPER_PROFILE_MISSING"
    | "NOT_AN_ADMIN"
    | "ADMIN_DISABLED";
  firestoreCode?: string;

  constructor(code: AdminResolveError["code"], step: string, message: string, firestoreCode?: string) {
    super(message);
    this.code = code;
    this.step = step;
    this.firestoreCode = firestoreCode;
  }
}

/**
 * STEP 3–5 of the login flow (after signInWithEmailAndPassword):
 *   3. Verify the UID (never authorize by email alone)
 *   4. Read admins/{uid} — distinguishing permission-denied from missing
 *   5. Check role/status
 * Returns the active AdminDoc or throws AdminResolveError.
 */
export async function resolveAdminProfile(user: User): Promise<AdminDoc> {
  // STEP 3 — UID verification. Authorization is by UID; if the configured
  // Super Admin email resolves to a different UID, stop immediately.
  console.info("[admin-auth] step 3 · uid =", user.uid, "· email =", user.email, "· emailVerified =", user.emailVerified);
  if ((user.email ?? "").toLowerCase() === SUPER_ADMIN_EMAIL && user.uid !== SUPER_ADMIN_UID) {
    throw new AdminResolveError(
      "UID_MISMATCH",
      "UID verification",
      `This Firebase account does not match the configured Super Admin account. Signed-in UID is ${user.uid}, expected ${SUPER_ADMIN_UID}.`,
    );
  }

  // STEP 4 — read admins/{uid}. Firestore errors here are NOT sign-in failures.
  let adminDoc: AdminDoc | null = null;
  try {
    adminDoc = await getById<AdminDoc>(COL.admins, user.uid);
  } catch (err) {
    const fsCode = (err as { code?: string })?.code ?? "unknown";
    console.error("[admin-auth] step 4 · Firestore error reading admins/" + user.uid, fsCode, (err as Error)?.message);
    throw new AdminResolveError(
      "FIRESTORE_DENIED",
      "Firestore profile read",
      `Authentication succeeded, but Firestore denied access to the admin profile (admins/${user.uid}). Firestore error: ${fsCode}. Check the deployed Security Rules allow an admin to read their own document.`,
      fsCode,
    );
  }

  // Bootstrap: the canonical Super Admin document is created once for the
  // exact configured UID (never by email).
  if (!adminDoc && user.uid === SUPER_ADMIN_UID) {
    try {
      await create(COL.admins, SUPER_ADMIN_UID, {
        uid: SUPER_ADMIN_UID,
        name: "Rahul",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        email: user.email ?? SUPER_ADMIN_EMAIL,
        createdAt: Date.now(),
      });
      adminDoc = await getById<AdminDoc>(COL.admins, user.uid);
    } catch (err) {
      const fsCode = (err as { code?: string })?.code ?? "unknown";
      throw new AdminResolveError(
        "SUPER_PROFILE_MISSING",
        "Super Admin bootstrap",
        `Super Admin profile not found, and Firestore refused to create admins/${SUPER_ADMIN_UID} (${fsCode}). Create the document manually in the Firebase Console.`,
        fsCode,
      );
    }
  }

  if (!adminDoc) {
    if (user.uid === SUPER_ADMIN_UID) {
      throw new AdminResolveError("SUPER_PROFILE_MISSING", "Admin profile", "Super Admin profile not found.");
    }
    throw new AdminResolveError(
      "NOT_AN_ADMIN",
      "Admin profile",
      `You do not have admin access. No admins/${user.uid} document exists in Firestore.`,
    );
  }

  // STEP 5 — role/status verification.
  console.info("[admin-auth] step 5 · role =", adminDoc.role, "· status =", adminDoc.status);
  if (adminDoc.status !== "ACTIVE") {
    throw new AdminResolveError("ADMIN_DISABLED", "Role verification", "This admin account is disabled (status is not ACTIVE). Contact the platform owner.");
  }

  await patch(COL.admins, user.uid, { lastLoginAt: Date.now() }).catch(() => undefined);
  return adminDoc;
}
