// Sidebar/navigation stability verifier — ONE persistent navigation tree.
// Run with: node scripts/verify-navigation.mjs
import { readFileSync } from "fs";

const shell = readFileSync("src/components/shell.tsx", "utf8");
const TOP_LABELS = ["Dashboard", "Activity", "Settings"];
const STORE_LABELS = [
  "Store Overview",
  "Store Branding",
  "Store Menu",
  "Store Staff",
  "Customers",
  "Store Loyalty",
  "Store QR",
  "Reviews",
  "Feedback",
  "Store AI",
  "Store Analytics",
  "Activity Log",
];
const EXPECTED = [...TOP_LABELS, ...STORE_LABELS];
let failures = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} - ${name}`); if (!ok) failures++; };

/* ---------------------------------------------------------------- *
 * 1. the complete label set lives in the canonical config
 * ---------------------------------------------------------------- */
for (const label of EXPECTED) check(`label present in canonical nav: "${label}"`, shell.includes(`label: "${label}"`));
check(`15 nav labels (${TOP_LABELS.length} top-level + ${STORE_LABELS.length} store)`, EXPECTED.length === 15);
check("no 'Stores' nav item (single-store model, no store list/switcher)", !shell.includes('label: "Stores"') && !shell.includes('href: "/admin/clients"'));

/* ---------------------------------------------------------------- *
 * 2. store section is a constant group of 12 rows
 * ---------------------------------------------------------------- */
const storeNav = shell.slice(shell.indexOf("export const STORE_NAV"), shell.indexOf("export function buildNavigation"));
check("STORE_NAV holds the 12 store areas in fixed order", STORE_LABELS.every((l) => storeNav.includes(`label: "${l}"`)) && (storeNav.match(/id: "store-/g) || []).length === 12);
check("store rows carry their route segment (menu, staff, loyalty, qr, …)", ["/branding", "/menu", "/staff", "/customers", "/loyalty", "/qr", "/reviews", "/feedback", "/ai-review", "/analytics", "/activity"].every((s) => storeNav.includes(`segment: "${s}"`)));
check("group label is STORE", shell.includes('export const STORE_GROUP_LABEL = "STORE"'));

/* ---------------------------------------------------------------- *
 * 3. ONE tree, built once, never filtered by route
 * ---------------------------------------------------------------- */
const build = shell.slice(shell.indexOf("export function buildNavigation"), shell.indexOf("export const flattenNavigation"));
check("buildNavigation returns the group unconditionally", build.includes("kind: \"group\"") && !build.includes("kind: \"group\" ?"));
check("tree = Dashboard → STORE group → Activity → Settings", build.indexOf("DASHBOARD_ITEM") < build.indexOf("STORE_GROUP_LABEL") && build.indexOf("STORE_GROUP_LABEL") < build.indexOf("WORKSPACE_ITEMS"));
check("store hrefs are derived from the resolved store id", build.includes("`/admin/clients/${storeId}${segment}`"));
check("unresolved store still renders its rows (empty href, not removed)", build.includes('href: storeId ?'));
check("flattenNavigation exposes every item for active matching", shell.includes("export const flattenNavigation"));

/* ---------------------------------------------------------------- *
 * 4. no route-based menu switch anywhere in the file
 * ---------------------------------------------------------------- */
const BANNED = [
  "showStoreNavigation", "showMainNavigation", "activeSection", "currentSection", "currentGroup",
  "selectedSection", "selectedStore", "isStoreRoute", "isDashboardRoute", "mainNav", "storeNavFor",
];
for (const token of BANNED) check(`no "${token}" conditional navigation`, !shell.includes(token));
check("no nav list / group selected by pathname", !/pathname[^;\n]{0,120}\?\s*[\[(<]/.test(shell) && !/pathname[^;\n]{0,120}&&\s*[\[({<]/.test(shell));
check("pathname reaches the tree only as the active-state input", (shell.match(/isActivePath\(pathname/g) || []).length >= 2);
check("store hrefs may read the route, but never gate the group", shell.includes("storeIdFromPath(pathname)"));
check("store group is not gated on a route/store id at render time", !/activeStoreId\s*\?\s*\(/.test(shell) && !/activeStoreId\s*&&\s*<nav/.test(shell));

/* ---------------------------------------------------------------- *
 * 5. desktop rail and mobile drawer render the SAME tree
 * ---------------------------------------------------------------- */
check("one NavigationTree component", (shell.match(/function NavigationTree/g) || []).length === 1);
check("rail + drawer render it (2 usages)", (shell.match(/<NavigationTree/g) || []).length === 2);
check("both usages receive the same nodes array", (shell.match(/nodes=\{navigation\}/g) || []).length === 2);
check("navigation built once per render, from one config", (shell.match(/= buildNavigation\(/g) || []).length === 1);

/* ---------------------------------------------------------------- *
 * 6. store id resolution is route-independent
 * ---------------------------------------------------------------- */
check("store context resolved by useResolvedStoreId", shell.includes("function useResolvedStoreId"));
check("route store is only an input, never a gate", shell.includes("storeIdFromPath(pathname)"));
check("admin's own store (admins/{uid}.clientId) is the fallback", shell.includes("knownStoreId ?? ownStoreId ?? null"));
check("last-opened store keeps workspace routes identical", shell.includes("readRememberedStoreId") && shell.includes("rememberStoreId(known)"));
check("no store selector/switcher in the shell", !/<select/i.test(shell) && !/onChange=\{\(e\) => setStore/.test(shell));

/* ---------------------------------------------------------------- *
 * 7. labels are always visible (never breakpoint/opacity/hover hidden)
 * ---------------------------------------------------------------- */
const rail = shell.slice(shell.indexOf("function RailLink"), shell.indexOf("function LogoutButton"));
check("label not breakpoint-hidden in RailLink", !/hidden (sm|md|lg|xl):block/.test(rail) && !/(md|lg):hidden/.test(rail));
check("label not opacity/visibility/sr-only hidden", !/(^|[\s"])(opacity-0|invisible|sr-only|text-transparent|w-0|max-w-0)([\s"]|$)/.test(rail));
check("label not hover-revealed", !/group-hover/.test(rail));
check("icon fixed width + label flex-1 min-w-0", rail.includes("w-4 shrink-0") && rail.includes("min-w-0 flex-1"));
check("nav item full width", rail.includes("flex w-full items-center"));
check("aria-current marks the active item", rail.includes('aria-current={active ? "page" : undefined}'));
check("active state handles nested routes", shell.includes("function isActivePath") && shell.includes("startsWith(href + \"/\")"));

/* ---------------------------------------------------------------- *
 * 8. sidebar layout preserved (Grounds Admin design)
 * ---------------------------------------------------------------- */
const aside = shell.slice(shell.indexOf("<aside"), shell.indexOf("</aside>"));
check("no icon-only 72px rail", !aside.includes("w-[72px]") && !aside.includes("md:items-center"));
check("brand/footer labels not lg-gated in aside", !/hidden lg:block/.test(aside));
check("nav region scrolls (min-h-0 flex-1 overflow-y-auto)", aside.includes("min-h-0 flex-1 overflow-y-auto"));
check("footer pinned (shrink-0)", aside.includes("shrink-0 border-t"));
check("content offset matches rail widths", shell.includes("md:pl-[232px] lg:pl-[248px]") && aside.includes("w-[232px]") && aside.includes("lg:w-[248px]"));
check("brown espresso rail", aside.includes("bg-espresso"));
check("active pill is cream on espresso", rail.includes("bg-cream text-espresso"));

/* ---------------------------------------------------------------- *
 * 9. mobile: drawer = full tree, bottom bar = shortcuts only
 * ---------------------------------------------------------------- */
check("drawer keeps the complete tree", shell.slice(shell.indexOf("mobile drawer"), shell.indexOf("mobile bottom navigation")).includes("<NavigationTree"));
check("drawer fluid width", shell.includes("w-[min(20rem,85vw)]"));
const bottom = shell.slice(shell.indexOf("mobile bottom navigation"), shell.indexOf("<ToastFromQuery />"));
check("bottom nav has Home/Menu/Guests/QR + More", ["Home", "Menu", "Guests", "QR"].every((l) => bottom.includes(`label: "${l}"`)) && /More/.test(bottom));
check("no Stores tab in the bottom nav", !bottom.includes('label: "Stores"'));
check("bottom nav keeps safe-area padding", bottom.includes("pb-[env(safe-area-inset-bottom)]"));

/* ---------------------------------------------------------------- *
 * 10. header is informational: current store only, plus scoped search
 * ---------------------------------------------------------------- */
check("header renders the current store name (no selector)", shell.includes("headerStore") && !/<select[^>]*store/i.test(shell));
check("search store-group is SUPER_ADMIN-only", shell.includes("includeStores: isSuperAdmin"));
check("header status badge is informational", shell.includes('headerStore.status !== "ACTIVE"'));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nNavigation stability verified: one persistent tree on every route.");
process.exit(failures ? 1 : 0);
