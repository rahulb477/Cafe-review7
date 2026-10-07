#!/usr/bin/env node
/**
 * SAFE dry-run reconciliation for project `cafe-review7`
 * (Customer App + Staff App + Admin App parity).
 *
 * USE OF ADMIN CREDENTIALS — paste your own service-account JSON when prompted:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json \
 *     node scripts/reconcile-loyalty-data.mjs --dry-run
 *
 *   # only after reviewing the report:
 *   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/reconcile-loyalty-data.mjs \
 *     --apply-counters --confirm-project cafe-review7
 *
 * WHAT IT DOES
 *   1. Scans customers, loyaltyAccounts, the stampTransactions ledger and
 *      rewardRedemptions for every business.
 *   2. Recomputes lifetimeStamps from VALID stamp transactions
 *      (currentStamps + rewardsRedeemed × stampTarget as the other lower bound).
 *   3. Reports discrepancies (missing lifetimeStamps, drift, cooldown source
 *      problems, customers whose loyalty doc belongs to another business).
 *   4. Audits duplicate customers by clientId + normalized phone WITHOUT merging
 *      or deleting anything — it only reports what exists.
 *   5. Optionally scans client/menu documents for developer/demo copy
 *      ("Namaste Sir…", "Main Rahul hoon", follow-up copy) and reports the exact
 *      collection / document id / field / current value. It never edits content.
 *
 * WHAT IT NEVER DOES
 *   * never deletes a customer, loyalty account, ledger row or token
 *   * never merges duplicate customers
 *   * never resets lifetimeStamps, currentStamps or stamp history
 *   * never writes without --apply-counters AND --confirm-project <projectId>
 *   * --apply-counters only ever RAISES lifetimeStamps to the reconciled value
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const PROJECT_ID = "cafe-review7";
const args = process.argv.slice(2);
const flags = {
  dryRun: args.includes("--dry-run") || !args.includes("--apply-counters"),
  applyCounters: args.includes("--apply-counters"),
  confirmProject: valueOf("--confirm-project"),
  jsonOut: valueOf("--json"),
  contentAudit: !args.includes("--no-content-audit"),
  duplicatesOnly: args.includes("--duplicates-only"),
  limit: Number(valueOf("--limit") ?? 5000),
};
function valueOf(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/* ------------------------------------------------------------------ *
 * Firestore access (REST, ADC token) — no extra dependencies required.
 * ------------------------------------------------------------------ */

async function accessToken() {
  // Prefer Application Default Credentials from GOOGLE_APPLICATION_CREDENTIALS.
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS is required (service-account JSON with Firestore read/write access).",
    );
  }
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: key.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const { createSign } = await import("node:crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(key.private_key).toString("base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetch(key.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const base64url = (value) => Buffer.from(value).toString("base64url");

async function firestoreList(collectionPath, token, pageSize = 300) {
  const docs = [];
  let pageToken;
  do {
    const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}`);
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`list ${collectionPath} failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    for (const doc of body.documents ?? []) docs.push({ id: doc.name.split("/").pop(), fields: doc.fields ?? {} });
    pageToken = body.nextPageToken;
  } while (pageToken && docs.length < flags.limit);
  return docs;
}

async function patchFields(path, fields, token) {
  const mask = Object.keys(fields)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join("&");
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}?${mask}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    },
  );
  if (!res.ok) throw new Error(`patch ${path} failed: ${res.status} ${await res.text()}`);
}

/* ---------------------------- value helpers ---------------------------- */

const isIntField = (field) => field && typeof field.integerValue === "string";
const intOf = (field) => (isIntField(field) ? Number(field.integerValue) : undefined);
const stringOf = (field) => (field && typeof field.stringValue === "string" ? field.stringValue : undefined);
const timestampOf = (field) => (field && typeof field.timestampValue === "string" ? Date.parse(field.timestampValue) : undefined);

/** Non-negative integer from any Firestore scalar (never NaN). */
function countOf(field) {
  if (!field) return 0;
  const value = intOf(field) ?? (typeof field.doubleValue === "number" ? field.doubleValue : Number(stringOf(field)));
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

/** Same validity rule as the canonical model / Staff ledger filter. */
function isCountedStampRow(fields) {
  const type = stringOf(fields.type) ?? "";
  const visitCounted = fields.visitCounted?.booleanValue;
  if (type === "REWARD_REDEEMED" || type === "REWARD") return false;
  if (visitCounted === false) return false;
  if (type === "STAMP_ADDED") return countOf(fields.delta ?? fields.addedCount) === 1 || (!fields.delta && !fields.addedCount);
  if (type) return false;
  return countOf(fields.delta) === 1;
}

function isRedemptionRow(fields) {
  const type = stringOf(fields.type) ?? "";
  return type === "REWARD_REDEEMED" || type === "REWARD";
}

const normalizePhone = (value) => (value ? String(value).replace(/[^\d]/g, "").slice(-10) : "");

/* ------------------------------ collections ---------------------------- */

const COLLECTIONS = {
  clients: "clients",
  customers: "customers",
  loyaltyAccounts: "loyaltyAccounts",
  staffUsers: "staffUsers",
  customerTokens: "customerTokens",
  customerPhoneIndex: "customerPhoneIndex",
  admins: "admins",
};

const SUBCOLLECTIONS = {
  stampTransactions: "stampTransactions",
  rewardRedemptions: "rewardRedemptions",
  menuItems: "menuItems",
  menuCategories: "menuCategories",
};

/* ------------------------------ main flow ------------------------------ */

const DEMO_COPY_PATTERNS = [
  /namaste\s+sir/i,
  /main\s+rahul\s+hoon/i,
  /small\s+follow[-\s]?up/i,
  /rahul\s+hoon/i,
];

async function main() {
  const report = {
    project: PROJECT_ID,
    mode: flags.applyCounters && !flags.dryRun ? "APPLY_COUNTERS" : "DRY_RUN",
    generatedAt: new Date().toISOString(),
    destructiveCustomerMergeOrDelete: false,
    note: "Dry run only unless --apply-counters --confirm-project cafe-review7 are both supplied. Never merges or deletes customers.",
    counts: {},
    loyalty: { checked: 0, drifted: [], missingLifetime: [], crossBusiness: [], missingLastStampAt: [], repairs: [] },
    duplicates: [],
    demoContent: [],
  };

  const token = await accessToken();
  const [clients, allCustomers, allAccounts] = await Promise.all([
    firestoreList(COLLECTIONS.clients, token),
    firestoreList(COLLECTIONS.customers, token),
    firestoreList(COLLECTIONS.loyaltyAccounts, token),
  ]);
  report.counts.clients = clients.length;
  report.counts.customers = allCustomers.length;

  for (const client of clients) {
    const clientId = client.id;
    const loyalty = client.fields?.loyalty?.mapValue?.fields ?? {};
    const stampTarget = countOf(loyalty.stampTarget) || 8;

    const [txs, redemptions, menuItems, categories] = await Promise.all([
      firestoreList(`${COLLECTIONS.clients}/${clientId}/${SUBCOLLECTIONS.stampTransactions}`, token),
      firestoreList(`${COLLECTIONS.clients}/${clientId}/${SUBCOLLECTIONS.rewardRedemptions}`, token),
      firestoreList(`${COLLECTIONS.clients}/${clientId}/${SUBCOLLECTIONS.menuItems}`, token),
      firestoreList(`${COLLECTIONS.clients}/${clientId}/${SUBCOLLECTIONS.menuCategories}`, token),
    ]);

    // customers/loyaltyAccounts are top-level; scope them to this business.
    const scopedCustomers = allCustomers.filter((doc) => stringOf(doc.fields.clientId) === clientId);
    const accountByCustomer = new Map(
      allAccounts.filter((doc) => stringOf(doc.fields.clientId) === clientId).map((doc) => [doc.id, doc]),
    );
    // Ledger rows per customer.
    const ledgerByCustomer = new Map();
    for (const row of txs) {
      const customerId = stringOf(row.fields.customerId);
      if (!customerId) continue;
      const bucket = ledgerByCustomer.get(customerId) ?? { stamps: 0, redemptions: 0, skipped: 0, lastStampMillis: null };
      if (isRedemptionRow(row.fields)) bucket.redemptions += 1;
      else if (isCountedStampRow(row.fields)) bucket.stamps += 1;
      else bucket.skipped += 1;
      const created = timestampOf(row.fields.createdAt);
      if (isCountedStampRow(row.fields) && created) {
        bucket.lastStampMillis = Math.max(bucket.lastStampMillis ?? 0, created);
      }
      ledgerByCustomer.set(customerId, bucket);
    }
    for (const row of redemptions) {
      const customerId = stringOf(row.fields.customerId);
      if (!customerId) continue;
      const bucket = ledgerByCustomer.get(customerId) ?? { stamps: 0, redemptions: 0, skipped: 0, lastStampMillis: null };
      bucket.redemptions += 1;
      ledgerByCustomer.set(customerId, bucket);
    }

    // ---- loyalty reconciliation (report only unless --apply-counters) ----
    for (const account of accountByCustomer.values()) {
      report.loyalty.checked += 1;
      const customerId = account.id;
      const ledger = ledgerByCustomer.get(customerId) ?? { stamps: 0, redemptions: 0, skipped: 0, lastStampMillis: null };
      const currentStamps = account.fields.currentStamps ? countOf(account.fields.currentStamps) : countOf(account.fields.stamps);
      const storedLifetime = countOf(account.fields.lifetimeStamps);
      const rewardsRedeemed = Math.max(countOf(account.fields.rewardsRedeemed), ledger.redemptions);
      const expectedLifetime = Math.max(
        currentStamps,
        storedLifetime,
        ledger.stamps,
        currentStamps + rewardsRedeemed * stampTarget,
      );
      const lastStampMillis = timestampOf(account.fields.lastStampAt);

      if (storedLifetime !== expectedLifetime) {
        const entry = {
          clientId,
          customerId,
          currentStamps,
          storedLifetimeStamps: storedLifetime,
          ledgerStampTransactions: ledger.stamps,
          rewardsRedeemed,
          stampTarget,
          expectedLifetimeStamps: expectedLifetime,
        };
        (storedLifetime === 0 && ledger.stamps > 0 ? report.loyalty.missingLifetime : report.loyalty.drifted).push(entry);
        report.loyalty.repairs.push(entry);
      }
      if (!account.fields.lastStampAt && ledger.lastStampMillis) {
        report.loyalty.missingLastStampAt.push({
          clientId,
          customerId,
          ledgerSuggestsLastStampAt: new Date(ledger.lastStampMillis).toISOString(),
        });
      }
    }

    // ---- loyalty documents that claim another business ----
    for (const account of accountByCustomer.values()) {
      const ownerId = stringOf(account.fields.customerId) ?? account.id;
      const customer = scopedCustomers.find((doc) => doc.id === ownerId);
      const accountClient = stringOf(account.fields.clientId);
      if (customer && accountClient && customer.fields.clientId && stringOf(customer.fields.clientId) !== accountClient) {
        report.loyalty.crossBusiness.push({ customerId: ownerId, customerClientId: stringOf(customer.fields.clientId), loyaltyClientId: accountClient });
      }
    }

    // ---- duplicate audit (report only — never merge/delete) ----
    const byPhone = new Map();
    for (const customer of scopedCustomers) {
      const phone = normalizePhone(stringOf(customer.fields.normalizedPhone) ?? stringOf(customer.fields.phone));
      if (!phone) continue;
      const key = `${clientId}|${phone}`;
      const list = byPhone.get(key) ?? [];
      list.push(customer);
      byPhone.set(key, list);
    }
    for (const [key, list] of byPhone) {
      if (list.length < 2) continue;
      report.duplicates.push({
        key,
        clientId,
        customerIds: list.map((doc) => doc.id),
        evidence: list.map((doc) => {
          const account = accountByCustomer.get(doc.id);
          const ledger = ledgerByCustomer.get(doc.id) ?? { stamps: 0, redemptions: 0 };
          return {
            customerId: doc.id,
            name: stringOf(doc.fields.name) ?? null,
            code: stringOf(doc.fields.code) ?? stringOf(doc.fields.customerCode) ?? null,
            totalVisits: countOf(doc.fields.totalVisits),
            status: stringOf(doc.fields.status) ?? null,
            currentStamps: account ? (account.fields.currentStamps ? countOf(account.fields.currentStamps) : countOf(account.fields.stamps)) : 0,
            lifetimeStamps: account ? countOf(account.fields.lifetimeStamps) : 0,
            ledgerStampTransactions: ledger.stamps,
            ledgerRedemptions: ledger.redemptions,
            qrToken: stringOf(doc.fields.qrToken) ?? null,
            phoneIndexId: stringOf(doc.fields.phoneIndexId) ?? null,
            createdAt: timestampOf(doc.fields.createdAt) ? new Date(timestampOf(doc.fields.createdAt)).toISOString() : null,
          };
        }),
        action: "manual-review-only (never auto-merged or deleted)",
      });
    }

    // ---- demo/placeholder content audit (report only) ----
    if (flags.contentAudit) {
      const scan = (docs, collection, fields) => {
        for (const doc of docs) {
          for (const field of fields) {
            const value = stringOf(doc.fields[field]);
            if (!value) continue;
            if (DEMO_COPY_PATTERNS.some((pattern) => pattern.test(value))) {
              report.demoContent.push({
                collection: `clients/{clientId}/${collection}`,
                clientId,
                documentId: doc.id,
                field,
                currentValue: value.slice(0, 200),
              });
            }
          }
        }
      };
      scan(menuItems, SUBCOLLECTIONS.menuItems, ["name", "description", "fullDescription", "notes", "tagline"]);
      scan(categories, SUBCOLLECTIONS.menuCategories, ["name", "description"]);
      for (const field of ["description", "tagline", "displayName", "businessName"]) {
        const value = stringOf(client.fields[field]);
        if (value && DEMO_COPY_PATTERNS.some((pattern) => pattern.test(value))) {
          report.demoContent.push({
            collection: COLLECTIONS.clients,
            clientId,
            documentId: clientId,
            field,
            currentValue: value.slice(0, 200),
          });
        }
      }
    }

    // ---- apply (explicit confirmation required) ----
    if (flags.applyCounters && !flags.dryRun) {
      if (flags.confirmProject !== PROJECT_ID) {
        throw new Error(`Refusing to write: pass --confirm-project ${PROJECT_ID} together with --apply-counters.`);
      }
      for (const repair of report.loyalty.repairs) {
        if (repair.storedLifetimeStamps >= repair.expectedLifetimeStamps) continue; // only ever raise
        await patchFields(
          `${COLLECTIONS.loyaltyAccounts}/${repair.customerId}`,
          { lifetimeStamps: { integerValue: String(repair.expectedLifetimeStamps) } },
          token,
        );
        console.log(
          `applied: loyaltyAccounts/${repair.customerId} lifetimeStamps ${repair.storedLifetimeStamps} -> ${repair.expectedLifetimeStamps}`,
        );
      }
    }

    report.counts[`customers.${clientId}`] = scopedCustomers.length;
  }

  report.counts.loyaltyAccounts = report.loyalty.checked;
  report.counts.duplicateGroups = report.duplicates.length;
  report.counts.demoContentFindings = report.demoContent.length;

  const out = flags.jsonOut ?? "reports/loyalty-reconciliation.json";
  const target = resolve(process.cwd(), out);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`mode: ${report.mode}`);
  console.log(`report: ${target}`);
  console.log(`loyalty accounts checked: ${report.loyalty.checked}`);
  console.log(`  lifetime drift:          ${report.loyalty.drifted.length}`);
  console.log(`  missing lifetimeStamps:  ${report.loyalty.missingLifetime.length}`);
  console.log(`  missing lastStampAt:     ${report.loyalty.missingLastStampAt.length}`);
  console.log(`  cross-business loyalty:  ${report.loyalty.crossBusiness.length}`);
  console.log(`duplicate customer groups: ${report.duplicates.length}`);
  console.log(`demo content findings:     ${report.demoContent.length}`);
  for (const finding of report.demoContent.slice(0, 20)) {
    console.log(`  ${finding.collection}/${finding.documentId} · ${finding.field} = ${finding.currentValue}`);
  }
  if (report.mode === "DRY_RUN") {
    console.log("\nDry run: nothing was written. Re-run with --apply-counters --confirm-project cafe-review7 after review.");
  }
}

main().catch((error) => {
  console.error(`reconciliation failed: ${error.message}`);
  process.exitCode = 1;
});
