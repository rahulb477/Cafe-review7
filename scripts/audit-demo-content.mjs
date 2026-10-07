#!/usr/bin/env node
/**
 * READ-ONLY demo/placeholder content audit for project cafe-review7.
 *
 * Finds the exact Firebase documents and fields that hold developer/demo copy
 * such as "Namaste Sir 👋 Main Rahul hoon…" so it can be REPLACED BY A HUMAN in
 * the Admin Panel. This script never writes, never patches and never deletes —
 * it only prints collection → document id → field → current value.
 *
 * Usage (service-account JSON with Firestore read access):
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/serviceAccount.json \
 *     node scripts/audit-demo-content.mjs --project cafe-review7
 *
 *   # restrict to one business (firestore client id or slug)
 *   node scripts/audit-demo-content.mjs --client cli_bake
 *
 *   # custom search pattern
 *   node scripts/audit-demo-content.mjs --pattern "namaste|rahul|hoon"
 *
 * Fields that render customer-visible copy (from the customer app's mappers):
 *   clients/{clientId}                      businessName, displayName, tagline,
 *                                           description, welcomeMessage, socials.*,
 *                                           wifi.message, loyalty.rewardName,
 *                                           loyalty.rewardDescription
 *   clients/{clientId}/menuItems/{itemId}   name, description, fullDescription,
 *                                           ingredients, category, tagline
 *   clients/{clientId}/menuCategories/{id}  name, description
 *   clients/{clientId}/reviewQuestions/{id} title, helper, text
 */

import { readFileSync } from "node:fs";

const PROJECT = valueOf("--project") ?? "cafe-review7";
const ONLY_CLIENT = valueOf("--client");
const PATTERN = new RegExp(
  valueOf("--pattern") ?? "namaste|main rahul|rahul hoon|🙏|👋|demo|lorem ipsum|placeholder",
  "i",
);
const LIMIT = Number(valueOf("--limit") ?? 5000);

function valueOf(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const CLIENT_FIELDS = [
  "businessName",
  "displayName",
  "tagline",
  "description",
  "welcomeMessage",
  "welcome",
  "about",
  "notice",
];
const MENU_ITEM_FIELDS = ["name", "description", "fullDescription", "ingredients", "category", "tagline", "notes"];
const CATEGORY_FIELDS = ["name", "description"];
const QUESTION_FIELDS = ["title", "helper", "text", "question"];

async function accessToken() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS is required (read-only service account).");
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (value) => Buffer.from(value).toString("base64url");
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/datastore.readonly",
      aud: key.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const { createSign } = await import("node:crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${signer.sign(key.private_key).toString("base64url")}`;
  const res = await fetch(key.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function list(collectionPath, token) {
  const docs = [];
  let pageToken;
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${collectionPath}`,
    );
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`read ${collectionPath} failed: ${res.status} ${await res.text()}`);
    const body = await res.json();
    for (const doc of body.documents ?? []) docs.push({ id: doc.name.split("/").pop(), fields: doc.fields ?? {} });
    pageToken = body.nextPageToken;
  } while (pageToken && docs.length < LIMIT);
  return docs;
}

const str = (field) => (field && typeof field.stringValue === "string" ? field.stringValue : undefined);
const strings = (value, out = []) => {
  if (!value) return out;
  if (typeof value.stringValue === "string") out.push(value.stringValue);
  if (value.mapValue) for (const inner of Object.values(value.mapValue.fields ?? {})) strings(inner, out);
  if (value.arrayValue) for (const inner of value.arrayValue.values ?? []) strings(inner, out);
  return out;
};

function scan(doc, collection, fields, found) {
  for (const field of fields) {
    const value = str(doc.fields[field]);
    if (value && PATTERN.test(value)) {
      found.push({ collection, documentId: doc.id, field, currentValue: value.slice(0, 240) });
    }
  }
}

async function main() {
  const token = await accessToken();
  const found = [];
  const clients = await list("clients", token);
  console.log(`project: ${PROJECT}`);
  console.log(`pattern: ${PATTERN}`);
  console.log(`clients scanned: ${clients.length}\n`);

  for (const client of clients) {
    if (ONLY_CLIENT && client.id !== ONLY_CLIENT) continue;
    scan(client, "clients", CLIENT_FIELDS, found);
    for (const nested of CLIENT_FIELDS) {
      const value = client.fields?.[nested];
      for (const text of strings(value)) {
        if (PATTERN.test(text)) found.push({ collection: "clients", documentId: client.id, field: nested, currentValue: text.slice(0, 240) });
      }
    }
    const [items, categories, questions] = await Promise.all([
      list(`clients/${client.id}/menuItems`, token),
      list(`clients/${client.id}/menuCategories`, token),
      list(`clients/${client.id}/reviewQuestions`, token).catch(() => []),
    ]);
    for (const item of items) scan(item, `clients/{clientId}/menuItems`, MENU_ITEM_FIELDS, found);
    for (const category of categories) scan(category, `clients/{clientId}/menuCategories`, CATEGORY_FIELDS, found);
    for (const question of questions) scan(question, `clients/{clientId}/reviewQuestions`, QUESTION_FIELDS, found);
    console.log(
      `client ${client.id}: menuItems=${items.length} categories=${categories.length} findings so far=${found.length}`,
    );
  }

  console.log("\n=== demo/placeholder content (read-only report) ===");
  for (const entry of found) {
    console.log(`collection : ${entry.collection}`);
    console.log(`document   : ${entry.documentId}`);
    console.log(`field      : ${entry.field}`);
    console.log(`value      : ${entry.currentValue}`);
    console.log("");
  }
  if (!found.length) console.log("no demo/placeholder copy matched the pattern");
  console.log("Nothing was modified. Replace the values above in the Admin Panel (menu/branding editors) — never in code.");
}

main().catch((error) => {
  console.error(`audit failed: ${error.message}`);
  process.exitCode = 1;
});
