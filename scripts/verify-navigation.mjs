// Sidebar/navigation stability verifier — Phase 7.
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
check("16 nav items with id + href + label", items.length === 16);
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
check("store context derived from route", shell.includes("function storeIdFromPath") && shell.includes("client?.id ?? routeStoreId"));
check("drawer uses same canonical nav", (shell.match(/GLOBAL_NAV\.map/g) || []).length >= 2);
check("no data-driven label", !/label: client\.|label: \{client/.test(shell));
check("active state handles nested routes", shell.includes("function isActivePath"));
check("aria-current on active", shell.includes('aria-current={active ? "page" : undefined}'));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nNavigation stability verified.");
process.exit(failures ? 1 : 0);
