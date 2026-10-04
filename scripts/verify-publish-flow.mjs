// Structural verification of the Store Setup publish flow guarantees.
// Run with: node scripts/verify-publish-flow.mjs
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const svc = readFileSync("src/services/firebase/clientService.ts", "utf8");
const wiz = readFileSync("src/components/client-wizard.tsx", "utf8");

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(p)) files.push(p);
  }
})("src");
const read = (p) => readFileSync(p, "utf8");

const checks = [
  // --- wizard / UX contract ---
  ["finally block resets phase", /finally \{[\s\S]*?setPhase/.test(wiz)],
  ["try/catch around publish", /try \{[\s\S]*?publishStore[\s\S]*?\} catch/.test(wiz)],
  ["console.error with operation/uid/storeId", /console\.error\(\{\s*operation: "publishStore"/.test(wiz)],
  [
    "per-operation watchdog names the pending operation (no blind timeout)",
    svc.includes("async function opGuard") &&
      svc.includes("received no response") &&
      !wiz.includes("timed out after"),
  ],
  [
    "[PUBLISH] instrumentation covers every stage",
    [
      "[PUBLISH] START",
      "[PUBLISH] STORE ID",
      "[PUBLISH] VALIDATION",
      "[PUBLISH] IMAGE_UPLOAD",
      "[PUBLISH] STORE_WRITE begin",
      "[PUBLISH] STORE_WRITE success",
      "[PUBLISH] SETTINGS_WRITE begin",
      "[PUBLISH] SETTINGS_WRITE success",
      "[PUBLISH] STATUS_UPDATE begin",
      "[PUBLISH] VERIFY success",
      "[PUBLISH] COMPLETE",
      "[PUBLISH] FAILED",
    ].every((s) => svc.includes(s)),
  ],
  ["publish read-back verification", svc.includes("Publish verification failed") && svc.includes('verified.status !== "PUBLISHED"')],
  [
    "no loyalty field-path conflict in saveDraft (map + dotted key mixed)",
    !svc.includes('"loyalty.rewardImage": rewardImage') && svc.includes("loyalty: { ...base.loyalty, rewardImage }"),
  ],
  [
    "images host on ImgBB, not Firebase Storage",
    readFileSync("src/services/firebase/storageService.ts", "utf8").includes("@/lib/imageUpload") &&
      !readFileSync("src/services/firebase/storageService.ts", "utf8").includes("firebase/storage"),
  ],
  [
    "imageUpload service: validation + env key + timeout + real errors",
    (() => {
      const img = readFileSync("src/lib/imageUpload.ts", "utf8");
      return (
        img.includes("api.imgbb.com/1/upload") &&
        img.includes("NEXT_PUBLIC_IMGBB_API_KEY") &&
        img.includes("Please select a valid image") &&
        img.includes("Image is too large") &&
        img.includes("AbortController") &&
        img.includes("Image upload failed")
      );
    })(),
  ],
  [
    "hosted URLs pass through — no double upload on publish",
    readFileSync("src/lib/imageUpload.ts", "utf8").includes('if (v.startsWith("data:")) return uploadImageDataUrl(v);'),
  ],
  [
    "picker uploads at selection time with uploaded/change states",
    (() => {
      const pick = readFileSync("src/components/image-picker.tsx", "utf8");
      return pick.includes("uploadImage(file)") && pick.includes("Uploaded") && pick.includes("Change image") && !pick.includes("firebase/storage");
    })(),
  ],
  [
    "no active firebase/storage import anywhere in src",
    !files.some((f) => read(f).includes('from "firebase/storage"')),
  ],
  [
    "firestore long-polling autodetect",
    readFileSync("src/lib/firebase/firestore.ts", "utf8").includes("experimentalAutoDetectLongPolling: true"),
  ],
  ["error shows code + message", wiz.includes("Error code:") && wiz.includes("Publishing failed")],
  [
    "button states DEFAULT/CLICKED/ERROR",
    wiz.includes("Publish Store") && wiz.includes("Publishing Store…") && wiz.includes("Publish Failed — Try Again"),
  ],
  [
    "success panel with actions",
    wiz.includes("Open Store") && wiz.includes("Manage Store") && wiz.includes("View QR") && wiz.includes("Store Settings"),
  ],
  [
    "validation runs BEFORE publishing state",
    wiz.indexOf("validateStoreForPublish(form)") > -1 &&
      wiz.indexOf("validateStoreForPublish(form)") < wiz.indexOf('setPhase("publishing")'),
  ],
  [
    "5-stage progress",
    ["Validating", "Saving Store", "Saving Settings", "Publishing", "Complete"].every((s) => wiz.includes(`"${s}"`)),
  ],
  ["Save Draft on every step footer", /Save Draft/.test(wiz)],
  // --- service / data-model contract ---
  ["stable id: saveDraft reuses storeId", /const id = storeId \?\? newId\("cli"\)/.test(svc)],
  ["slug clash check excludes self", /clash\.some\(\(c\) => c\.id !== storeId\)/.test(svc)],
  ["publish uses batched write", /writeBatch\(db\(\)\)/.test(svc) && /batch\.commit\(\)/.test(svc)],
  ["serverTimestamp on publish", /publishedAt: serverTimestamp\(\)/.test(svc)],
  [
    "duplicate guards via existence checks",
    /existingItems === 0/.test(svc) && /existingRewards === 0/.test(svc) && /existingQr === 0/.test(svc),
  ],
  ['status "DRAFT" on first save', /status: "DRAFT"/.test(svc)],
  ['status "PUBLISHED" on publish', /status: "PUBLISHED" satisfies StoreStatus/.test(svc)],
  ["draftMenu cleared after publish", /draftMenu: deleteField\(\)/.test(svc)],
  [
    "publish validation lists missing fields",
    svc.includes("Complete these fields before publishing"),
  ],
];

let failures = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}`);
  if (!ok) failures++;
}
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll publish-flow guarantees verified.");
process.exit(failures ? 1 : 0);
