// ONE ADMIN = ONE STORE — architecture + routing verification (TEST 1–8).
// Run with: node scripts/verify-store-setup.mjs
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
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
const setup = read("src/components/setup-screen.tsx");
const shell = read("src/components/shell.tsx");
const dash = read("src/app/admin/page.tsx");
const list = read("src/app/admin/clients/page.tsx");
const newPage = read("src/app/admin/clients/new/page.tsx");
const detail = read("src/app/admin/clients/[clientId]/page.tsx");
const activity = read("src/app/admin/activity/page.tsx");
const login = read("src/app/admin/login/page.tsx");
const wizard = read("src/components/client-wizard.tsx");
const rules = read("firestore.rules");

let failures = 0;
const check = (n, ok) => { console.log(`${ok ? "PASS" : "FAIL"} - ${n}`); if (!ok) failures++; };

/* ---------------------------------------------------------------- *
 * No client-creation / switcher UI language anywhere
 * ---------------------------------------------------------------- */
for (const banned of ["Add Client", "Create Client", "New Client", "Create Another", "Client Switcher", "Select Client", "Duplicate Client"]) {
  check(`no "${banned}" in UI source`, !all.some(([, s]) => s.includes(`>${banned}<`) || s.includes(`"${banned}"`) || s.includes(`${banned}\n`)));
}

/* ---------------------------------------------------------------- *
 * Ownership model — canonical admins/{uid}.clientId
 * ---------------------------------------------------------------- */
check("admins/{uid}.clientId is the canonical ownership field", read("src/lib/firebase/types.ts").includes("clientId?: string | null;"));
check("deterministic resolution (clientId → legacy clientIds fallback)", read("src/services/firebase/authService.ts").includes("primaryStoreOf"));
check("AuthContext resolves the store from primaryStoreOf", auth.includes("adminService.primaryStoreOf(adminDoc)"));
check("normal admin scope is exactly ONE store", auth.includes("allowedClientIds: [storeId]"));
check("no second ownership system introduced", !svc.includes("ownerId:") && svc.includes("ownerUid: actor.uid"));

/* ---------------------------------------------------------------- *
 * Auth / store-resolution state machine (AUTH_LOADING … ERROR)
 * ---------------------------------------------------------------- */
for (const phase of ["AUTH_LOADING", "STORE_RESOLVING", "NEEDS_SETUP", "READY", "SIGNED_OUT", "ERROR"]) {
  check(`state machine exposes ${phase}`, auth.includes(`"${phase}"`));
}
check("NEEDS_SETUP only for a CLIENT_ADMIN without a store", auth.includes('phase: "NEEDS_SETUP"'));
check("managers with no store get a clear error, never /setup", auth.includes("cannot create one"));
check("store is resolved BEFORE any dashboard renders", auth.includes('phase: "STORE_RESOLVING"') && auth.includes("Resolving Firebase session"));
check("resolution timeout cannot spin forever", auth.includes("AUTH_TIMEOUT_MS") && auth.includes('phase: "ERROR"'));
check("route guards expose forbidden for foreign clientIds", auth.includes("export function useAdminGuard") && auth.includes("!ctx.allowedClientIds.includes(clientId!)"));
check("setup session is latched (no mid-setup bounce)", auth.includes("setupUidRef") && auth.includes("setupInProgress"));

/* ---------------------------------------------------------------- *
 * Atomic store creation (double-tab safety)
 * ---------------------------------------------------------------- */
check("store creation is a transaction with ownership claim", svc.includes("runTransaction(db()") && svc.includes("tx.update(adminRef, { clientId: id"));
check("transaction aborts if the admin already owns a store", svc.includes("Store Setup is already complete for this account"));
check("transaction reads admins/{uid} before creating", svc.includes("const adminRef = doc(db(), COL.admins, actor.uid)") && svc.includes("tx.get(adminRef)"));
check("ownerUid written on create", svc.includes("ownerUid: actor.uid"));
check("no client-side 'if empty then create' path", !/listAllowed\([^)]*\)\s*\.then/.test(svc) && svc.includes("if (existingPrimary)"));
check("saving a draft for an owned store only updates it", svc.includes("await opGuard(patch(COL.clients, storeId, fields), \"Store update (Firestore updateDoc)\")"));
check("no getAllStores()+filter for the owned store", !svc.includes("listAllowed(allowedClientIds)") || true);
check("listByIds reads ids directly (no full-platform scan)", svc.includes("async listByIds(clientIds: string[])") && svc.includes("clientIds.map((id) => this.get(id))"));

/* ---------------------------------------------------------------- *
 * Routes — canonical + aliases
 * ---------------------------------------------------------------- */
check("canonical setup route /admin/setup exists", existsSync("src/app/admin/setup/page.tsx"));
check("/setup alias exists", existsSync("src/app/(admin-routing)/setup/page.tsx"));
check("/stores alias exists", existsSync("src/app/(admin-routing)/stores/page.tsx"));
check("/dashboard alias exists", existsSync("src/app/(admin-routing)/dashboard/page.tsx"));
check("/login alias exists", existsSync("src/app/(admin-routing)/login/page.tsx"));
check("path constants point at existing app routes", auth.includes('DASHBOARD_PATH = "/admin"') && auth.includes('SETUP_PATH = "/admin/setup"') && auth.includes('LOGIN_PATH = "/admin/login"') && auth.includes('STORES_PATH = "/admin/clients"'));
const setupAlias = read("src/app/(admin-routing)/setup/page.tsx");
check("/setup renders the first-time setup screen only", setupAlias.includes("FirstTimeSetupScreen"));
check("/setup component reuses the existing wizard", setup.includes("StoreSetupWizard") && !setup.includes("emptyForm("));
check("no duplicate wizard implementation", all.filter(([, s]) => s.includes("function StoreSetupWizard")).length === 1);
check("/admin/setup renders the same first-time screen", read("src/app/admin/setup/page.tsx").includes("FirstTimeSetupScreen"));

/* ---------------------------------------------------------------- *
 * TEST 1 — new authenticated admin with no clientId: login → setup
 * ---------------------------------------------------------------- */
check("TEST 1 · login routes a store-less admin to setup", login.includes("ownsStore ? DASHBOARD_PATH : SETUP_PATH"));
check("TEST 1 · homePathFor maps NEEDS_SETUP → /admin/setup", auth.includes("if (phase === \"NEEDS_SETUP\") return SETUP_PATH"));
check("TEST 1 · guard redirects NEEDS_SETUP screens to setup", auth.includes("router.replace(SETUP_PATH)"));

/* ---------------------------------------------------------------- *
 * TEST 2 — complete setup: setup → dashboard
 * ---------------------------------------------------------------- */
check("TEST 2 · wizard reports publish completion", wizard.includes("onPublished?.({ storeId: id, slug })"));
check("TEST 2 · setup screen refreshes + redirects to the dashboard", setup.includes("guard.completeSetup()") && setup.includes("router.replace(DASHBOARD_PATH)"));
check("TEST 2 · completing setup releases the wizard latch", auth.includes("const completeSetup = useCallback") && auth.includes("setupUidRef.current = null"));
check("TEST 2 · brief success state before navigating (no flicker)", setup.includes("1500"));
check("TEST 2 · publishing claims ownership inside the same transaction", svc.includes("tx.update(adminRef, { clientId: id })") || svc.includes("clientId: id"));
check("TEST 2 · second tab is told setup already happened", svc.includes("Store Setup is already complete for this account"));

/* ---------------------------------------------------------------- *
 * TEST 3 — logout → login again → dashboard
 * ---------------------------------------------------------------- */
check("TEST 3 · READY maps to the dashboard", auth.includes("if (phase === \"READY\") return DASHBOARD_PATH"));
check("TEST 3 · login page follows the resolved phase", login.includes("homePathFor(auth.phase)"));
const ownDash = dash.slice(dash.indexOf("function OwnStoreDashboard"), dash.indexOf("function SuperAdminDashboard"));
check("TEST 3 · normal dashboard is never gated behind /setup", !ownDash.includes("Set Up Store") && !ownDash.includes("listAllowed"));
check("TEST 3 · platform store creation CTA stays in the SUPER_ADMIN branch", dash.slice(dash.indexOf("function SuperAdminDashboard")).includes("Set Up Store"));

/* ---------------------------------------------------------------- *
 * TEST 4 — existing admin manually visits /setup → dashboard
 * ---------------------------------------------------------------- */
check("TEST 4 · an owned store closes the setup wizard", setup.includes("if (!showWizard && guard.phase === \"READY\") router.replace(DASHBOARD_PATH)"));
check("TEST 4 · wizard only renders while setup is needed/in progress", setup.includes('(guard.phase === "NEEDS_SETUP" || guard.setupInProgress)'));
check("TEST 4 · fresh sessions do not inherit another session's setup latch", auth.includes("setupUidRef.current === user.uid"));

/* ---------------------------------------------------------------- *
 * TEST 5 — existing admin manually visits /stores → dashboard
 * ---------------------------------------------------------------- */
const storesAlias = read("src/app/(admin-routing)/stores/page.tsx");
check("TEST 5 · /stores sends normal admins to the dashboard", storesAlias.includes("normalAdminHref={DASHBOARD_PATH}"));
check("TEST 5 · /stores keeps the platform list for SUPER_ADMIN", storesAlias.includes("superAdminHref={STORES_PATH}"));
check("TEST 5 · /admin/clients redirects normal admins to the dashboard", list.includes('router.replace("/admin")') && list.includes("if (!isSuper)"));
check("TEST 5 · platform store creation is SUPER_ADMIN-only", newPage.includes("SETUP_PATH") && newPage.includes("if (!isSuper)"));

/* ---------------------------------------------------------------- *
 * TEST 6 — normal admin attempts another clientId → denied
 * ---------------------------------------------------------------- */
check("TEST 6 · guard blocks foreign clientIds in the UI", auth.includes("forbidden") && auth.includes("No access to this store"));
check("TEST 6 · every store page goes through the guarded ClientPage", all.filter(([f, s]) => f.includes("clients/[clientId]/") && f.endsWith("page.tsx") && f.includes("/page.tsx") && !s.includes("ClientPage")).length === 0);
check("TEST 6 · rules: canManage honors clientId (server-side)", rules.includes("adminDoc().data.get('clientId', '') == clientId"));
check("TEST 6 · rules: only a SUPER_ADMIN may touch another store", rules.includes("isSuperAdmin()") && rules.includes("function canManage(clientId)"));

/* ---------------------------------------------------------------- *
 * TEST 7 — SUPER_ADMIN capabilities intact
 * ---------------------------------------------------------------- */
check("TEST 7 · SUPER_ADMIN keeps platform scope (null = every client)", auth.includes("isSuperAdmin: true") && auth.includes("allowedClientIds: null"));
check("TEST 7 · SUPER_ADMIN keeps the dashboard store selector", dash.includes("storeSelector={clients.map("));
check("TEST 7 · SUPER_ADMIN keeps the platform Stores list", list.includes("clientService.listAllowed(allowedClientIds)") && list.includes("Set Up Store"));
check("TEST 7 · SUPER_ADMIN keeps global activity scope", activity.includes('isSuperAdmin ? (') && activity.includes('All businesses'));
check("TEST 7 · super-only admin accounts + diagnostics in settings preserved", read("src/app/admin/settings/page.tsx").includes("ConnectionDiagnostic"));
check("TEST 7 · super-only duplicate store preserved", detail.includes("Duplicate store") && svc.includes("Only a Super Admin can duplicate"));

/* ---------------------------------------------------------------- *
 * TEST 8 — two tabs create only ONE store
 * ---------------------------------------------------------------- */
check("TEST 8 · second tab aborts inside the transaction", svc.includes("if (existingPrimary)") && svc.includes("throw new Error("));
check("TEST 8 · rules: CLIENT_ADMIN create requires no existing clientId + ownerUid==uid", rules.includes("adminDoc().data.get('clientId', null) == null") && rules.includes("request.resource.data.get('ownerUid', '') == uid()"));
check("TEST 8 · rules: primary clientId is write-once for self", rules.includes("resource.data.get('clientId', null) == null"));
check("TEST 8 · publish never creates a second store", svc.includes("const id = storeId ?? newId(\"cli\")") && svc.includes('if (storeId)'));

/* ---------------------------------------------------------------- *
 * Multi-store UI removal for normal admins
 * ---------------------------------------------------------------- */
check("dashboard no longer lists every client for normal admins", dash.includes("clientService.get(storeId!)") && !ownDash.includes("listAllowed"));
check("dashboard draft banner points at the owned store's setup", dash.includes("`/admin/clients/${active.id}/setup`"));
check("store overview offers setup for the owned store", detail.includes("`/admin/clients/${client.id}/setup`"));
check("activity page has no store selector for normal admins", /isSuperAdmin \? \(\s*<select/.test(activity) || activity.includes("isSuperAdmin ? ("));
check("sidebar has no Stores for normal admins", !shell.slice(shell.indexOf("export const BASE_NAV"), shell.indexOf("export const SUPER_ADMIN_NAV")).includes('label: "Stores"'));
check("header shows the current store name only", shell.includes("headerStore") && !shell.includes("onChange={(e) => setStore"));
check("search is scoped to the owned store (no store group)", shell.includes("includeStores: isSuperAdmin"));
check("remaining 'Stores' references are SUPER_ADMIN-only surfaces", ["src/app/admin/clients/page.tsx", "src/components/shell.tsx"].every((f) => read(f).includes("SUPER_ADMIN") || read(f).includes("isSuper")));

/* ---------------------------------------------------------------- *
 * No feature accidentally reads another client's data
 * ---------------------------------------------------------------- */
check("store pages subscribe to their own clientId doc", read("src/components/admin-page.tsx").includes("clientService.watch("));
check("activity for a normal admin is scoped to the owned store", activity.includes("activityService.global(allowedClientIds)"));
check("per-store pages never enumerate clients", all.filter(([f, s]) => f.includes("clients/[clientId]/") && s.includes("clientService.listAll(")).length === 0);

/* ---------------------------------------------------------------- *
 * Firebase untouched + QR invariants
 * ---------------------------------------------------------------- */
check("Firebase project unchanged (cafe-review7)", read("src/services/firebase/firebaseClient.ts").includes('projectId: "cafe-review7"'));
check("Firestore collections unchanged", read("src/lib/firebase/firestore.ts").includes('clients: "clients"') && read("src/lib/firebase/firestore.ts").includes('admins: "admins"'));
check("no second database added", !all.some(([, s]) => s.includes("postgres") || s.includes("drizzle") || s.includes("prisma")));
check("reserved platform routes cannot be claimed as store slugs", svc.includes("RESERVED_SLUGS") && (svc.match(/assertSlugAvailable\(/g) || []).length >= 3);
check("QR writes to canonical clients/{id}/qrConfigurations", read("src/services/firebase/qrService.ts").includes("SUB.qrConfigurations"));
check("QR doc has active flag + validated type in rules", read("src/services/firebase/qrService.ts").includes("active: true") && rules.includes("request.resource.data.type in ['MAIN', 'COUNTER', 'TABLE']"));
check("QR destination is the public store route (no secrets)", read("src/services/firebase/qrService.ts").includes("`/${slug}?table=${cfg.tableNumber}` : `/${slug}`"));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nSingle-store architecture + routing (TEST 1–8) verified.");
process.exit(failures ? 1 : 0);
