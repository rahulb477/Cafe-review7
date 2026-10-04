import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";

/**
 * The ONE Firebase project shared by the Customer, Staff and Admin apps.
 * This is a public web config — authorization lives in Firebase Auth,
 * the admins/{uid} role documents and Security Rules, never in this file.
 *
 * NOTE: `NEXT_PUBLIC_FIREBASE_API_KEY` (if set) overrides only the apiKey
 * field of this single config — it does NOT create a second configuration.
 * Use it to supply the exact key from Firebase Console → Project settings
 * without a code change.
 */
export const firebaseConfig = {
  // Verified against identitytoolkit.googleapis.com for project cafe-review7.
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAxqT3r5zxjKR-6D7xO82dIyR9_3EWBNQg",
  authDomain: "cafe-review7.firebaseapp.com",
  databaseURL: "https://cafe-review7-default-rtdb.firebaseio.com",
  projectId: "cafe-review7",
  storageBucket: "cafe-review7.firebasestorage.app",
  messagingSenderId: "186233902821",
  appId: "1:186233902821:web:4192c5da4967503512660c",
};

export const SUPER_ADMIN_UID = "4T2KTiZiAAYKxJ2FlIXSBsOj6G93";
export const SUPER_ADMIN_EMAIL = "rahul4319@gmail.com";

/**
 * Config preflight — catches the exact class of failure that produces
 * auth/api-key-not-valid BEFORE a sign-in attempt, with actionable text.
 * Returns null when the config looks structurally sound.
 */
export function validateFirebaseConfig(): string | null {
  const key = firebaseConfig.apiKey;
  if (firebaseConfig.projectId !== "cafe-review7") {
    return `Firebase is initialized with projectId "${firebaseConfig.projectId}" instead of "cafe-review7". Fix firebaseClient.ts.`;
  }
  if (!key.startsWith("AIza")) {
    return "The Firebase apiKey does not look like a Google API key (must start with “AIza”). Copy the exact apiKey from Firebase Console → Project settings → cafe-review7 web app.";
  }
  if (key.length !== 39) {
    return `The Firebase apiKey is ${key.length} characters long — a valid Google API key is exactly 39. The configured key is corrupted (extra/missing character). Copy the exact apiKey from Firebase Console → Project settings → cafe-review7 web app, then set it in firebaseClient.ts or via NEXT_PUBLIC_FIREBASE_API_KEY.`;
  }
  return null;
}

/** Initialize Firebase exactly once (getApps/getApp/initializeApp). */
export function getFirebaseApp(): FirebaseApp {
  return getApps().some((a) => a.name === "[DEFAULT]") ? getApp() : initializeApp(firebaseConfig);
}

/** Secondary app used only to create staff Auth accounts without replacing the admin session. */
export function getWorkerApp(): FirebaseApp {
  const existing = getApps().find((a) => a.name === "grounds-worker");
  return existing ?? initializeApp(firebaseConfig, "grounds-worker");
}
