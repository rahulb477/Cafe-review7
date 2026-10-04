// Sidebar/navigation stability verifier — Phase 7 + single-store navigation.
// Run with: node scripts/verify-navigation.mjs
import { readFileSync } from "fs";

const shell = readFileSync("src/components/shell.tsx", "utf8");
const EXPECTED = [
  "Dashboard", "Stores", "Activity", "Settings",
  "Store Overview", "Store Branding", "Store Menu", "Store Staff", "Customers",
  "Store Loyalty", "Store QR", "Reviews", "Feedback", "Store AI", "Store Analytics", "Activity Log",
];
let failures = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} - ${name}`); if (!ok) failures++; };

// 1. every expected label exists exactly as a nav label in the canonical config
for (const label of EXPECTED) check(`label present in canonical nav: "${label}"`, shell.includes(`label: "${label}"`));

// 2. every item has stable id + route
const items = [...shell.matchAll(/\{ id: "([a-z-]+)", href: ([^,]+), label: "([^"]+)"/g)];
check("16 literal nav items with id + href + label", items.length === 16);
check("ids unique", new Set(items.map((m) => m[1])).size === items.length);

// 3. RailLink never hides the label behind breakpoint/opacity/hover/sr-only
const rail = shell.slice(shell.indexOf("function RailLink"), shell.indexOf("function LogoutButton"));
check("label not breakpoint-hidden in RailLink", !/hidden (sm|md|lg|xl):block/.test(rail) && !/(md|lg):hidden/.test(rail));
check("label not opacity/visibility/sr-only hidden", !/(^|[\s"])(opacity-0|invisible|sr-only|text-transparent|w-0|max-w-0)([\s"]|$)/.test(rail));
check("label not hover-revealed", !/group-hover/.test(rail));
check("icon fixed width + label flex-1 min-w-0", rail.includes("w-4 shrink-0") && rail.includes("min-w-0 flex-1"));
check("nav item full width", rail.includes("flex w-full items-center"));

// 4. sidebar layout: labels at md:, scrollable nav region, pinned footer
const aside = shell.slice(shell.indexOf("<aside"), shell.indexOf("</aside>"));
check("no icon-only 72px rail", !aside.includes("w-[72px]") && !aside.includes("md:items-center"));
check("brand/footer labels not lg-gated in aside", !/hidden lg:block/.test(aside));
check("nav region scrolls (min-h-0 flex-1 overflow-y-auto)", aside.includes("min-h-0 flex-1 overflow-y-auto"));
check("footer pinned (shrink-0)", aside.includes("shrink-0 border-t"));
check("content offset matches rail widths", shell.includes("md:pl-[232px] lg:pl-[248px]") && aside.includes("w-[232px]") && aside.includes("lg:w-[248px]"));

// 5. store section never depends on Firebase data having loaded
check("store context derived from route + owned store", shell.includes("function storeIdFromPath") && shell.includes("client?.id ?? routeStoreId"));
check("drawer uses same canonical nav", (shell.match(/nav\.map\(/g) || []).length >= 2);
check("no data-driven label", !/label: client\.|label: \{client/.test(shell));
check("active state handles nested routes", shell.includes("function isActivePath"));
check("aria-current on active", shell.includes('aria-current={active ? "page" : undefined}'));

// 6. ONE ADMIN = ONE STORE — normal admins have no Stores navigation
const baseNav = shell.slice(shell.indexOf("export const BASE_NAV"), shell.indexOf("export const SUPER_ADMIN_NAV"));
const superNav = shell.slice(shell.indexOf("export const SUPER_ADMIN_NAV"), shell.indexOf("export const globalNavFor"));
const globalNavFor = shell.slice(shell.indexOf("export const globalNavFor"), shell.indexOf("export const STORE_NAV_LABELS"));
check("normal-admin nav (BASE_NAV) has no Stores item", !baseNav.includes('label: "Stores"') && !baseNav.includes("/admin/clients"));
check("SUPER_ADMIN nav keeps the platform Stores list", superNav.includes('label: "Stores"') && superNav.includes('href: "/admin/clients"'));
check("globalNavFor gates Stores on SUPER_ADMIN", globalNavFor.includes('role === "SUPER_ADMIN" ? SUPER_ADMIN_NAV : BASE_NAV'));
check("normal admins always get their single store's nav", shell.includes("client?.id ?? routeStoreId ?? storeId ?? null"));

// 7. mobile bottom navigation: Home / Menu / Guests / QR / More, and NO Stores tab for normal admins
const bottom = shell.slice(shell.indexOf("mobile bottom navigation"), shell.indexOf("<ToastFromQuery />"));
check("bottom nav has Home/Menu/Guests/QR + More", ["Home", "Menu", "Guests", "QR"].every((l) => bottom.includes(`label: "${l}"`)) && /\bMore\b/.test(bottom));
const afterSuper = bottom.slice(bottom.indexOf(": isSuper"));
const superBranch = afterSuper.slice(0, afterSuper.indexOf(": ["));
const normalBranch = afterSuper.slice(afterSuper.indexOf(": ["));
const storeBranch = bottom.slice(0, bottom.indexOf(": isSuper"));
check(
  "Stores tab only inside the SUPER_ADMIN branch",
  superBranch.includes('label: "Stores"') && !normalBranch.includes('label: "Stores"') && !storeBranch.includes('label: "Stores"'),
);
check("bottom nav keeps safe-area padding", bottom.includes("pb-[env(safe-area-inset-bottom)]"));

// 8. header: informational store name only — no store selector
check("header renders the current store name (no selector)", shell.includes("headerStore") && !/<select[^>]*store/i.test(shell));
check("search store-group is SUPER_ADMIN-only", shell.includes("includeStores: isSuperAdmin"));
check("header status badge is informational", shell.includes("headerStore.status !== \"ACTIVE\""));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nNavigation stability + single-store nav verified.");
process.exit(failures ? 1 : 0);
