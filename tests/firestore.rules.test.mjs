/**
 * Firestore Security Rules test suite — Phase 23.
 * Runs against the Firestore emulator (needs Java + firebase-tools):
 *
 *   npx firebase-tools emulators:exec --only firestore --project cafe-review7 \
 *     "node --test tests/firestore.rules.test.mjs"
 *
 * Covers SUPER_ADMIN, NORMAL ADMIN (one-store), STAFF, CUSTOMER (public) and
 * UNAUTHENTICATED actors against the canonical nested schema.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc, serverTimestamp, increment } from "firebase/firestore";

const SUPER = "4T2KTiZiAAYKxJ2FlIXSBsOj6G93";
const ADMIN_A = "admin_a";
const ADMIN_B = "admin_b";
const STAFF_A = "staff_a";
const STORE_A = "cli_a";
const STORE_B = "cli_b";

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "cafe-review7",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "admins", SUPER), { uid: SUPER, role: "SUPER_ADMIN", status: "ACTIVE" });
    await setDoc(doc(db, "admins", ADMIN_A), { uid: ADMIN_A, role: "CLIENT_ADMIN", status: "ACTIVE", clientId: STORE_A, clientIds: [STORE_A] });
    await setDoc(doc(db, "admins", ADMIN_B), { uid: ADMIN_B, role: "CLIENT_ADMIN", status: "ACTIVE", clientId: null });
    await setDoc(doc(db, "staffUsers", STAFF_A), { uid: STAFF_A, clientId: STORE_A, clientIds: [STORE_A], status: "ACTIVE", role: "STAFF" });
    for (const id of [STORE_A, STORE_B]) {
      await setDoc(doc(db, "clients", id), { id, slug: id, businessName: id, status: "PUBLISHED", wifi: { ssid: "Guest", message: "hi" } });
      await setDoc(doc(db, "clients", id, "menuItems", "m1"), { clientId: id, name: "Cappuccino", price: 180, active: true });
      await setDoc(doc(db, "clients", id, "qrConfigurations", "q1"), { clientId: id, type: "MAIN", label: "Main", active: true });
      await setDoc(doc(db, "customers", `cust_${id}`), { clientId: id, name: "Guest", code: "#C1" });
      await setDoc(doc(db, "loyaltyAccounts", `cust_${id}`), { clientId: id, customerId: `cust_${id}`, stamps: 2 });
      await setDoc(doc(db, "clients", id, "reviews", "r1"), { clientId: id, rating: 5, content: "great", createdAt: 1 });
      await setDoc(doc(db, "clients", id, "feedback", "f_b"), { clientId: id, rating: 4, message: "nice", source: "customer_feedback", status: "new", createdAt: 1 });
      await setDoc(doc(db, "activityLogs", `log_${id}`), { clientId: id, actorUid: SUPER, action: "X", createdAt: 1 });
    }
  });
});
after(async () => env.cleanup());

const as = (uid) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

// ---------------- UNAUTHENTICATED / CUSTOMER ----------------
test("public: store doc, menu, QR readable; private collections denied", async () => {
  const db = as(null);
  await assertSucceeds(getDoc(doc(db, "clients", STORE_A)));
  await assertSucceeds(getDocs(collection(db, "clients", STORE_A, "menuItems")));
  await assertSucceeds(getDocs(collection(db, "clients", STORE_A, "qrConfigurations")));
  await assertFails(getDocs(query(collection(db, "customers"), where("clientId", "==", STORE_A))));
  await assertFails(getDocs(collection(db, "staffUsers")));
  await assertFails(getDocs(collection(db, "clients", STORE_A, "reviews")));
  await assertFails(getDoc(doc(db, "admins", SUPER)));
});
test("customer: can submit review + anonymous feedback (validated), cannot inject identity or junk", async () => {
  const db = as(null);
  await assertSucceeds(setDoc(doc(db, "clients", STORE_A, "reviews", "new1"), { clientId: STORE_A, rating: 4, content: "nice", createdAt: 1 }));
  await assertFails(setDoc(doc(db, "clients", STORE_A, "reviews", "new2"), { clientId: STORE_A, rating: 9, content: "x" }));
});

// ---------------- FEEDBACK = THE RATING SOURCE ----------------
test("customer: submits canonical anonymous feedback (rating 1..5 or null)", async () => {
  const db = as(null);
  const at = serverTimestamp();
  await assertSucceeds(
    setDoc(doc(db, "clients", STORE_A, "feedback", "f1"), {
      clientId: STORE_A,
      rating: 5,
      message: "Excellent",
      source: "customer_feedback",
      status: "new",
      adminReply: null,
      aiReply: null,
      repliedAt: null,
      repliedBy: null,
      createdAt: at,
      updatedAt: at,
    }),
  );
  // Text-only feedback (rating null) is valid and must not affect ratings.
  await assertSucceeds(
    setDoc(doc(db, "clients", STORE_A, "feedback", "f_null"), {
      clientId: STORE_A,
      rating: null,
      message: "Staff was helpful",
      source: "customer_feedback",
      status: "new",
      createdAt: at,
      updatedAt: at,
    }),
  );
  // Legacy client shape (no rating, sentiment, uppercase status) stays accepted.
  await assertSucceeds(
    setDoc(doc(db, "clients", STORE_A, "feedback", "f_legacy"), {
      clientId: STORE_A,
      message: "more jazz",
      sentiment: "POSITIVE",
      status: "NEW",
      createdAt: 1,
    }),
  );
});

test("customer: cannot inject identity, a pre-filled reply, a foreign rating or junk keys", async () => {
  const db = as(null);
  const base = { clientId: STORE_A, message: "x", source: "customer_feedback", status: "new" };
  await assertFails(setDoc(doc(db, "clients", STORE_A, "feedback", "f_bad1"), { ...base, email: "leak@x.com" }));
  await assertFails(setDoc(doc(db, "clients", STORE_A, "feedback", "f_bad2"), { ...base, rating: 9 }));
  await assertFails(setDoc(doc(db, "clients", STORE_A, "feedback", "f_bad3"), { ...base, rating: 0 }));
  await assertFails(setDoc(doc(db, "clients", STORE_A, "feedback", "f_bad4"), { ...base, adminReply: "already answered" }));
  await assertFails(setDoc(doc(db, "clients", STORE_A, "feedback", "f_bad5"), { ...base, status: "archived" }));
  await assertFails(setDoc(doc(db, "clients", STORE_A, "feedback", "f_bad6"), { ...base, clientId: STORE_B }));
  // Feedback is not public: another business cannot read it either.
  await assertFails(getDocs(collection(db, "clients", STORE_A, "feedback")));
});

test("admin: moderates and replies to OWN store feedback only", async () => {
  const db = as(ADMIN_A);
  await assertSucceeds(
    updateDoc(doc(db, "clients", STORE_A, "feedback", "f1"), { status: "reviewed", updatedAt: serverTimestamp() }),
  );
  await assertSucceeds(
    updateDoc(doc(db, "clients", STORE_A, "feedback", "f1"), {
      adminReply: "Thank you!",
      repliedAt: serverTimestamp(),
      repliedBy: ADMIN_A,
      updatedAt: serverTimestamp(),
    }),
  );
  // AI drafts live in aiReply and never touch the customer's message/rating.
  await assertSucceeds(updateDoc(doc(db, "clients", STORE_A, "feedback", "f1"), { aiReply: "Thanks so much!", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(db, "clients", STORE_A, "feedback", "f1"), { status: "archived", updatedAt: serverTimestamp() }));

  // The guest's rating, message and creation time are immutable — even for an admin.
  await assertFails(updateDoc(doc(db, "clients", STORE_A, "feedback", "f1"), { rating: 1 }));
  await assertFails(updateDoc(doc(db, "clients", STORE_A, "feedback", "f1"), { message: "rewritten" }));
  await assertFails(updateDoc(doc(db, "clients", STORE_A, "feedback", "f1"), { createdAt: 1 }));
  await assertFails(updateDoc(doc(db, "clients", STORE_A, "feedback", "f1"), { updatedAt: Date.now() })); // string/number timestamps are not allowed
  await assertFails(updateDoc(doc(db, "clients", STORE_A, "feedback", "f1"), { repliedBy: "someone_else" }));
  await assertFails(updateDoc(doc(db, "clients", STORE_A, "feedback", "f1"), { deviceId: "tracker" }));
  await assertFails(updateDoc(doc(db, "clients", STORE_A, "feedback", "f1"), { clientId: STORE_B }));
  await assertFails(deleteDoc(doc(db, "clients", STORE_A, "feedback", "f1")));

  // Cross-business isolation for the rating source.
  await assertFails(getDocs(collection(db, "clients", STORE_B, "feedback")));
  await assertFails(updateDoc(doc(db, "clients", STORE_B, "feedback", "f1"), { status: "archived" }));
});

test("staff and guests cannot moderate feedback (admin-only writes)", async () => {
  await assertFails(updateDoc(doc(as(STAFF_A), "clients", STORE_A, "feedback", "f1"), { status: "reviewed" }));
  await assertFails(updateDoc(doc(as(null), "clients", STORE_A, "feedback", "f1"), { status: "reviewed" }));
  await assertFails(getDocs(collection(as(STAFF_A), "clients", STORE_A, "feedback")));
  // SUPER_ADMIN is a store admin too — replying is allowed for them.
  await assertSucceeds(updateDoc(doc(as(SUPER), "clients", STORE_A, "feedback", "f_legacy"), { adminReply: "hi", repliedBy: SUPER, repliedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
});
test("customer: metrics blind-merge allowed only for valid id + known fields", async () => {
  const db = as(null);
  await assertSucceeds(setDoc(doc(db, "metricsDaily", `${STORE_A}_2026-01-01`), { clientId: STORE_A, day: "2026-01-01", qrScans: increment(1) }, { merge: true }));
  await assertFails(setDoc(doc(db, "metricsDaily", `${STORE_A}_2026-01-01`), { clientId: STORE_A, day: "2026-01-01", evil: 1 }, { merge: true }));
  await assertFails(setDoc(doc(db, "metricsDaily", "ghost_2026-01-01"), { clientId: "ghost", day: "2026-01-01", qrScans: increment(1) }, { merge: true }));
  await assertFails(getDoc(doc(db, "metricsDaily", `${STORE_A}_2026-01-01`)));
});
test("customer: cannot touch loyalty balances", async () => {
  await assertFails(updateDoc(doc(as(null), "loyaltyAccounts", `cust_${STORE_A}`), { stamps: 99 }));
});

// ---------------- SUPER ADMIN ----------------
test("super admin: full management across stores", async () => {
  const db = as(SUPER);
  await assertSucceeds(getDoc(doc(db, "clients", STORE_B)));
  await assertSucceeds(setDoc(doc(db, "clients", "cli_new"), { id: "cli_new", slug: "new", status: "DRAFT" }));
  await assertSucceeds(setDoc(doc(db, "clients", STORE_B, "menuItems", "m9"), { clientId: STORE_B, name: "X" }));
  await assertSucceeds(setDoc(doc(db, "clients", STORE_B, "qrConfigurations", "q9"), { clientId: STORE_B, type: "TABLE", label: "T1" }));
  await assertSucceeds(getDocs(query(collection(db, "staffUsers"), where("clientId", "==", STORE_B))));
  await assertSucceeds(getDocs(query(collection(db, "customers"), where("clientId", "==", STORE_B))));
  await assertSucceeds(getDocs(collection(db, "clients", STORE_B, "reviews")));
  await assertSucceeds(getDocs(collection(db, "activityLogs")));
  await assertSucceeds(getDocs(query(collection(db, "metricsDaily"), where("clientId", "==", STORE_B))));
});

// ---------------- NORMAL ADMIN (ONE STORE) ----------------
test("normal admin: own store only", async () => {
  const db = as(ADMIN_A);
  await assertSucceeds(updateDoc(doc(db, "clients", STORE_A), { tagline: "hi" }));
  await assertFails(updateDoc(doc(db, "clients", STORE_B), { tagline: "hack" }));
  await assertSucceeds(setDoc(doc(db, "clients", STORE_A, "menuItems", "m2"), { clientId: STORE_A, name: "Latte" }));
  await assertFails(setDoc(doc(db, "clients", STORE_B, "menuItems", "m2"), { clientId: STORE_B, name: "Latte" }));
  await assertSucceeds(setDoc(doc(db, "clients", STORE_A, "qrConfigurations", "q2"), { clientId: STORE_A, type: "COUNTER", label: "C" }));
  await assertFails(setDoc(doc(db, "clients", STORE_B, "qrConfigurations", "q2"), { clientId: STORE_B, type: "COUNTER", label: "C" }));
  await assertSucceeds(getDocs(query(collection(db, "staffUsers"), where("clientId", "==", STORE_A))));
  await assertFails(getDocs(query(collection(db, "staffUsers"), where("clientId", "==", STORE_B))));
  await assertSucceeds(getDocs(query(collection(db, "customers"), where("clientId", "==", STORE_A))));
  await assertFails(getDocs(query(collection(db, "customers"), where("clientId", "==", STORE_B))));
  await assertSucceeds(getDocs(collection(db, "clients", STORE_A, "reviews")));
  await assertFails(getDocs(collection(db, "clients", STORE_B, "reviews")));
  await assertFails(getDocs(collection(db, "activityLogs"))); // unconstrained → denied (rules aren't filters)
  await assertSucceeds(getDocs(query(collection(db, "activityLogs"), where("clientId", "==", STORE_A))));
});
test("normal admin: cannot create a second store; cannot re-home a customer", async () => {
  const db = as(ADMIN_A);
  await assertFails(setDoc(doc(db, "clients", "cli_second"), { id: "cli_second", ownerUid: ADMIN_A, status: "DRAFT" }));
  await assertFails(updateDoc(doc(db, "customers", `cust_${STORE_A}`), { clientId: STORE_B }));
  await assertFails(updateDoc(doc(db, "admins", ADMIN_A), { role: "SUPER_ADMIN" }));
  await assertFails(updateDoc(doc(db, "admins", ADMIN_A), { clientId: STORE_B })); // primary store is write-once
});
test("new admin (no store yet): may claim exactly one store via transaction shape", async () => {
  const db = as(ADMIN_B);
  await assertSucceeds(setDoc(doc(db, "clients", "cli_b_new"), { id: "cli_b_new", ownerUid: ADMIN_B, status: "DRAFT", slug: "bnew" }));
  await assertSucceeds(updateDoc(doc(db, "admins", ADMIN_B), { clientId: "cli_b_new", clientIds: ["cli_b_new"] }));
  await assertFails(setDoc(doc(db, "clients", "cli_b_other"), { id: "cli_b_other", ownerUid: "someone_else", status: "DRAFT" }));
});

// ---------------- STAFF ----------------
test("staff: assigned store only; no admin settings; ledgers append-only", async () => {
  const db = as(STAFF_A);
  await assertSucceeds(getDocs(query(collection(db, "customers"), where("clientId", "==", STORE_A))));
  await assertFails(getDocs(query(collection(db, "customers"), where("clientId", "==", STORE_B))));
  await assertSucceeds(updateDoc(doc(db, "loyaltyAccounts", `cust_${STORE_A}`), { stamps: 3 }));
  await assertFails(updateDoc(doc(db, "loyaltyAccounts", `cust_${STORE_B}`), { stamps: 3 }));
  await assertSucceeds(setDoc(doc(db, "clients", STORE_A, "stampTransactions", "t1"), { clientId: STORE_A, customerId: `cust_${STORE_A}`, delta: 1 }));
  await assertFails(updateDoc(doc(db, "clients", STORE_A, "stampTransactions", "t1"), { delta: 50 }));
  await assertFails(updateDoc(doc(db, "clients", STORE_A), { tagline: "staff edit" }));
  await assertFails(setDoc(doc(db, "clients", STORE_A, "menuItems", "m3"), { clientId: STORE_A, name: "X" }));
  await assertFails(getDocs(query(collection(db, "staffUsers"), where("clientId", "==", STORE_A))));
});
