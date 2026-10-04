// ONE ADMIN = ONE STORE — structural verification. Run: node scripts/verify-store-setup.mjs
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const files = [];
(function walk(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) && files.push(p);
  }
})("src");
const read = (p) => readFileSync(p, "utf8");
const all = files.map((f) => [f, read(f)]);
const svc = read("src/services/firebase/clientService.ts");
const auth = read("src/context/AuthContext.tsx");
const dash = read("src/app/admin/page.tsx");
const list = read("src/app/admin/clients/page.tsx");
const setup = read("src/app/admin/clients/new/page.tsx");
const detail = read("src/app/admin/clients/[clientId]/page.tsx");
const rules = read("firestore.rules");

let failures = 0;
const check = (n, ok) => { console.log(`${ok ? "PASS" : "FAIL"} - ${n}`); if (!ok) failures++; };

// --- no client-creation / switcher UI language anywhere ---
for (const banned of ["Add Client", "Create Client", "New Client", "Create Another", "Client Switcher", "Select Client", "Duplicate Client"]) {
  check(`no "${banned}" in UI source`, !all.some(([, s]) => s.includes(`>${banned}<`) || s.includes(`"${banned}"`) || s.includes(`${banned}\n`)));
}

// --- ownership model ---
check("admins/{uid}.clientId primary store in types", read("src/lib/firebase/types.ts").includes("clientId?: string | null;"));
check("deterministic resolution (clientId → legacy clientIds)", read("src/services/firebase/authService.ts").includes("primaryStoreOf"));
check("AuthContext exposes primaryStoreId", auth.includes("const primaryStoreId = adminDoc.role") && auth.includes("primaryStoreId, error: null"));
check("store creation is a transaction with ownership claim", svc.includes("runTransaction(db()") && svc.includes("tx.update(adminRef, { clientId: id"));
check("transaction aborts if admin already owns a store", svc.includes("Store Setup is already complete for this account"));
check("ownerUid written on create", svc.includes("ownerUid: actor.uid"));

// --- UI behavior ---
check("dashboard auto-resolves primary store for normal admins", dash.includes("clients.find((c) => c.id === primaryStoreId)"));
check("store switcher pills only for SUPER_ADMIN", dash.includes("(isSuper ? clients : []).map"));
check("Use Demo Store only for SUPER_ADMIN", dash.includes("{isSuper ? (") && !/role !== "MANAGER"[^\n]*seedDemo/.test(dash));
check("Stores list: setup CTA gated by ownership", list.includes('role === "CLIENT_ADMIN" && !primaryStoreId'));
check("Setup page locked after first store", setup.includes("function SetupGate") && setup.includes("Store Setup is already complete"));
check("Duplicate store is SUPER_ADMIN-only", detail.includes('role === "SUPER_ADMIN" ? (\n              <Card className="p-5">\n                <SectionTitle>Duplicate store') && svc.includes("Only a Super Admin can duplicate"));

// --- rules enforce it server-side too ---
check("rules: CLIENT_ADMIN create requires no existing clientId + ownerUid==uid", rules.includes("adminDoc().data.get('clientId', null) == null") && rules.includes("request.resource.data.get('ownerUid', '') == uid()"));
check("rules: primary clientId is write-once for self", rules.includes("resource.data.get('clientId', null) == null\n                || request.resource.data.get('clientId', null) == resource.data.get('clientId', null)"));
check("rules: canManage honors primary clientId + legacy clientIds", rules.includes("adminDoc().data.get('clientId', '') == clientId") && rules.includes("clientId in adminDoc().data.get('clientIds', [])"));

// --- QR ---
check("QR writes to canonical clients/{id}/qrConfigurations", read("src/services/firebase/qrService.ts").includes("SUB.qrConfigurations"));
check("QR doc has active flag + validated type in rules", read("src/services/firebase/qrService.ts").includes("active: true") && rules.includes("request.resource.data.type in ['MAIN', 'COUNTER', 'TABLE']"));
check("QR destination is the public store route (no secrets)", read("src/services/firebase/qrService.ts").includes("`/${slug}?table=${cfg.tableNumber}` : `/${slug}`"));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nSingle-store ownership + QR verified.");
process.exit(failures ? 1 : 0);
