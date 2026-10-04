import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  limit as qLimit,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseApp } from "@/services/firebase/firebaseClient";

let firestoreInstance: Firestore | null = null;

export function db(): Firestore {
  if (!firestoreInstance) {
    try {
      // Long-polling auto-detect: prevents indefinitely-buffered writes on
      // networks/proxies that silently block WebChannel streaming.
      firestoreInstance = initializeFirestore(getFirebaseApp(), {
        experimentalAutoDetectLongPolling: true,
      });
    } catch {
      firestoreInstance = getFirestore(getFirebaseApp());
    }
  }
  return firestoreInstance;
}

/** Top-level Firestore collections — shared with the Customer and Staff apps. */
export const COL = {
  admins: "admins",
  clients: "clients",
  staffUsers: "staffUsers",
  customers: "customers",
  loyaltyAccounts: "loyaltyAccounts",
  activityLogs: "activityLogs",
  metricsDaily: "metricsDaily",
} as const;

/** Client-scoped subcollections — live under clients/{clientId}/… */
export const SUB = {
  menuCategories: "menuCategories",
  menuItems: "menuItems",
  stampTransactions: "stampTransactions",
  rewards: "rewards",
  rewardRedemptions: "rewardRedemptions",
  reviews: "reviews",
  feedback: "feedback",
  aiUsage: "aiUsage",
  qrConfigurations: "qrConfigurations",
} as const;

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 14)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
}

export function txId(): string {
  return `TXN-${Math.floor(Math.random() * 0xffffffffff)
    .toString(16)
    .toUpperCase()
    .padStart(10, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Top-level helpers
 * ------------------------------------------------------------------ */

export async function getById<T>(col: string, id: string): Promise<T | null> {
  const snap = await getDoc(doc(db(), col, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null;
}

export async function listWhere<T>(col: string, constraints: QueryConstraint[], max = 400): Promise<T[]> {
  const snap = await getDocs(query(collection(db(), col), ...constraints, qLimit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

export async function listByClient<T>(col: string, clientId: string, max = 400): Promise<T[]> {
  return listWhere<T>(col, [where("clientId", "==", clientId)], max);
}

export async function countWhere(col: string, constraints: QueryConstraint[]): Promise<number> {
  const snap = await getCountFromServer(query(collection(db(), col), ...constraints));
  return snap.data().count;
}

export async function create(col: string, id: string, data: Record<string, unknown>): Promise<void> {
  await setDoc(doc(db(), col, id), data);
}

export async function patch(col: string, id: string, data: Record<string, unknown>): Promise<void> {
  await updateDoc(doc(db(), col, id), data);
}

export async function remove(col: string, id: string): Promise<void> {
  await deleteDoc(doc(db(), col, id));
}

/* ------------------------------------------------------------------ *
 * Subcollection helpers — clients/{clientId}/{sub}/{id}
 * Every subcollection document still carries clientId for portability.
 * ------------------------------------------------------------------ */

export function subRef(clientId: string, sub: string) {
  return collection(db(), COL.clients, clientId, sub);
}

export function subDoc(clientId: string, sub: string, id: string) {
  return doc(db(), COL.clients, clientId, sub, id);
}

export async function getSub<T>(clientId: string, sub: string, id: string): Promise<T | null> {
  const snap = await getDoc(subDoc(clientId, sub, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null;
}

export async function listSub<T>(
  clientId: string,
  sub: string,
  constraints: QueryConstraint[] = [],
  max = 400,
): Promise<T[]> {
  const snap = await getDocs(query(subRef(clientId, sub), ...constraints, qLimit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

export async function countSub(clientId: string, sub: string, constraints: QueryConstraint[] = []): Promise<number> {
  const snap = await getCountFromServer(query(subRef(clientId, sub), ...constraints));
  return snap.data().count;
}

export async function createSub(clientId: string, sub: string, id: string, data: Record<string, unknown>) {
  await setDoc(subDoc(clientId, sub, id), { ...data, clientId });
}

export async function patchSub(clientId: string, sub: string, id: string, data: Record<string, unknown>) {
  await updateDoc(subDoc(clientId, sub, id), data);
}

export async function removeSub(clientId: string, sub: string, id: string) {
  await deleteDoc(subDoc(clientId, sub, id));
}

/* ------------------------------------------------------------------ *
 * Real-time listeners
 * ------------------------------------------------------------------ */

export function watchDocById<T>(
  col: string,
  id: string,
  onData: (data: T | null) => void,
  onError?: (message: string) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db(), col, id),
    (snap) => onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as T) : null),
    (err) => onError?.(fireErrorMessage(err)),
  );
}

export function watchWhere<T>(
  col: string,
  constraints: QueryConstraint[],
  onData: (rows: T[]) => void,
  onError?: (message: string) => void,
  max = 200,
): Unsubscribe {
  return onSnapshot(
    query(collection(db(), col), ...constraints, qLimit(max)),
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
    (err) => onError?.(fireErrorMessage(err)),
  );
}

/** Clear, user-facing Firebase error text — never an infinite spinner. */
export function fireErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code.includes("permission-denied"))
    return "Firebase permission denied. Your account does not have access to this data (check Firestore Security Rules and your admin role).";
  if (code.includes("unavailable") || code.includes("network"))
    return "Could not reach Firestore. Check your network connection.";
  if (code.includes("failed-precondition"))
    return "Firestore query needs an index or precondition failed. Try again or check the Firebase console.";
  if (code.includes("unauthenticated")) return "You are signed out. Sign in again to continue.";
  return (err as Error)?.message ?? "Something went wrong talking to Firebase.";
}
