import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirebaseApp, getWorkerApp } from "@/services/firebase/firebaseClient";

export function firebaseAuth(): Auth {
  return getAuth(getFirebaseApp());
}

export function watchAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(firebaseAuth(), callback, () => callback(null));
}

export async function signInWithPassword(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(firebaseAuth(), email.trim(), password);
  return cred.user;
}

export async function signOutUser(): Promise<void> {
  await signOut(firebaseAuth());
}

export async function sendReset(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth(), email.trim());
}

/**
 * Creates a staff Firebase Auth account on a secondary app instance so the
 * admin's own session is untouched. Returns the new UID. The password goes
 * straight to Firebase Auth — it is never stored anywhere else.
 */
export async function createStaffAuthAccount(email: string, password: string): Promise<string> {
  const workerAuth = getAuth(getWorkerApp());
  const cred = await createUserWithEmailAndPassword(workerAuth, email.trim(), password);
  const uid = cred.user.uid;
  await signOut(workerAuth);
  return uid;
}

export function authErrorCode(err: unknown): string {
  return (err as { code?: string })?.code ?? "";
}

/**
 * Human-readable Firebase Auth error mapping. The raw error.code is always
 * appended so the real Firebase error is never hidden; it is also logged.
 */
export function authErrorMessage(err: unknown): string {
  const code = authErrorCode(err);
  const raw = (err as Error)?.message ?? "";
  // Never swallow the real error — log code + message for debugging.
  console.error("[firebase-auth]", code || "(no code)", raw);

  const withCode = (text: string) => (code ? `${text} (${code})` : text);

  if (code.includes("api-key-not-valid") || code.includes("invalid-api-key"))
    return withCode(
      "Firebase rejected the API key — the configured apiKey is invalid for project cafe-review7. Copy the exact apiKey from Firebase Console → Project settings → Web app, then update firebaseClient.ts or set NEXT_PUBLIC_FIREBASE_API_KEY.",
    );
  if (code.includes("operation-not-allowed"))
    return withCode("Email/password authentication is disabled in Firebase Console. Enable the Email/Password provider under Authentication → Sign-in method.");
  if (code.includes("user-not-found"))
    return withCode("No Firebase account exists for this email in project cafe-review7.");
  if (code.includes("wrong-password") || code.includes("invalid-credential") || code.includes("INVALID_LOGIN_CREDENTIALS"))
    return withCode("Email or password is incorrect for this Firebase account.");
  if (code.includes("too-many-requests"))
    return withCode("Too many attempts — Firebase has temporarily blocked this account. Wait a moment and try again.");
  if (code.includes("network-request-failed"))
    return withCode("Network error reaching Firebase Authentication. Check your connection and any firewall/ad-blocker.");
  if (code.includes("user-disabled"))
    return withCode("This Firebase account has been disabled in the Firebase Console.");
  if (code.includes("email-already-in-use"))
    return withCode("An account with this email already exists.");
  if (code.includes("weak-password"))
    return withCode("Password must be at least 6 characters.");
  if (code.includes("project-not-found"))
    return withCode("Firebase project not found — the configuration does not point at a live project.");
  return code ? `${raw || "Authentication failed."} (${code})` : raw || "Authentication failed.";
}
