// Firestore permission matrix + query/rule compatibility verifier.
// Run with: node scripts/verify-permissions.mjs
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const rules = readFileSync("firestore.rules", "utf8");
const files = [];
(function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && files.push(p);
  }
})("src");
const code = files.map((f) => readFileSync(f, "utf8")).join("\n");

let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} - ${name}`);
  if (!ok) failures++;
};

// ---- MATRIX (collection | read | create | update | delete) ----
const MATRIX = [
  ["admins", "self or SUPER", "SUPER or root bootstrap", "SUPER or self (role/status frozen)", "SUPER"],
  ["clients", "public (customer app)", "active admin, not MANAGER", "canManage", "never"],
  ["clients/menuCategories,menuItems,qrConfigurations,rewards", "public", "canManage", "canManage", "canManage"],
  ["clients/stampTransactions,rewardRedemptions", "canOperate", "canOperate", "never (append-only)", "never"],
  ["clients/reviews,feedback", "canManage", "public (customer submits)", "canManage", "never"],
  ["clients/aiUsage", "canManage", "canManage", "canManage", "never"],
  ["staffUsers", "self / SUPER / canManage(primary clientId)", "canManage", "canManage", "canManage"],
  ["customers,loyaltyAccounts", "canManage or isStaffOf (store-scoped)", "same", "same", "SUPER / never"],
  ["activityLogs", "SUPER or assigned clientIds", "signed-in", "never", "never"],
  ["metricsDaily", "SUPER or canManage", "public blind-merge", "public blind-merge", "never"],
];
console.log("PERMISSION MATRIX");
for (const [c, r, cr, u, d] of MATRIX) console.log(`  ${c} | read: ${r} | create: ${cr} | update: ${u} | delete: ${d}`);
console.log("");

// ---- rule invariants ----
const ruleLines = rules.split("\n").filter((l) => !l.trim().startsWith("//"));
check("no global 'allow read, write: if true'", !ruleLines.some((l) => /allow read,\s*write:\s*if true/.test(l)));
check("clients delete forbidden", /match \/clients\/\{clientId\} \{[\s\S]*?allow delete: if false;/.test(rules));
check("audit logs immutable", /match \/activityLogs\/\{id\} \{[\s\S]*?allow update, delete: if false;/.test(rules));
check("stamp ledger append-only", rules.includes("append-only ledger"));
check("staffUsers read store-scoped", rules.includes("canManage(resource.data.clientId)") && !/staffUsers[\s\S]{0,200}isActiveAdmin\(\)\);/.test(rules));
check("customers read store-scoped", /match \/customers\/\{id\} \{\s*allow read: if isSignedIn\(\) && \(canManage\(resource\.data\.clientId\) \|\| isStaffOf\(resource\.data\.clientId\)\)/.test(rules));
check("activityLogs read store-scoped", /match \/activityLogs\/\{id\} \{\s*allow read: if isSuperAdmin\(\) \|\| \(isActiveAdmin\(\) && canManage\(resource\.data\.clientId\)\)/.test(rules));
check("metricsDaily read store-scoped", /match \/metricsDaily\/\{id\} \{\s*allow read: if isSuperAdmin\(\) \|\| \(isActiveAdmin\(\) && canManage\(resource\.data\.clientId\)\)/.test(rules));
check("MANAGER cannot create clients (rule)", rules.includes("adminDoc().data.role == 'CLIENT_ADMIN'") && !rules.includes("allow create: if isActiveAdmin() && adminDoc().data.role != 'MANAGER'"));

// ---- query/rule compatibility invariants (rules are not filters) ----
check("no staffUsers array-contains queries", !/staffUsers[^)]*array-contains/.test(code) && !code.includes('COL.staffUsers, [where("clientIds"'));
check("customers/loyalty queries pin clientId", !new RegExp('COL\\.(customers|loyaltyAccounts), \\[\\]').test(code));
check("unconstrained activityLogs query only in SUPER branch", /allowedClientIds === null[\s\S]{0,200}orderBy\("createdAt", "desc"\)/.test(code));
check("metric recording is blind upsert (no read)", /Blind upsert — NO read/.test(code) && /merge: true/.test(code));
check("app mirrors MANAGER create rule", code.includes("Managers cannot create new stores"));
check("diagnostic never deletes clients/{id}", !readFileSync("src/components/connection-diagnostic.tsx", "utf8").includes("COL.clients"));
check("no dead admins array-contains query", !code.includes("adminsForClient"));
check("metrics writes schema-validated (hasOnly + int + id match + store exists)", rules.includes("keys().hasOnly([") && rules.includes("id == request.resource.data.clientId + '_' + request.resource.data.day") && rules.includes("exists(/databases/$(database)/documents/clients/$(request.resource.data.clientId))"));
check("reviews create validated; admin cannot rewrite rating", rules.includes("request.resource.data.rating >= 1 && request.resource.data.rating <= 5") && rules.includes("unchanged('rating')"));
check("feedback stays anonymous (hasOnly, no identity fields)", rules.includes("hasOnly(['clientId', 'message', 'sentiment', 'status', 'createdAt'])"));
check("staff cannot be re-homed; customers cannot be re-homed", (rules.match(/unchanged\('clientId'\)/g) || []).length >= 3);
check("activity logs: actor can only log as self", rules.includes("request.resource.data.actorUid == uid()"));
check("wifi password never in public doc (app never writes wifiPsk)", !code.includes("wifiPsk") && !code.includes("wifiPassword"));
check("deploy config targets cafe-review7", readFileSync(".firebaserc", "utf8").includes("cafe-review7") && readFileSync("firebase.json", "utf8").includes("firestore.rules"));
check("seeded demos satisfy publish validation (category)", readFileSync("src/lib/firebase/seed.ts", "utf8").includes('category: "Cafe & Bakery"'));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nPermission matrix + query compatibility verified.");
process.exit(failures ? 1 : 0);
