// Responsive regression guard — fails the check if overflow-prone patterns
// reappear in the source. Run with: node scripts/verify-responsive.mjs
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx|ts|css)$/.test(p)) files.push(p);
  }
})("src");

const read = (p) => readFileSync(p, "utf8");
const all = files.map((f) => [f, read(f)]);

let failures = 0;
const fail = (msg) => {
  console.log("FAIL -", msg);
  failures++;
};
const pass = (msg) => console.log("PASS -", msg);

// 1. No bare 1fr tracks paired with fixed columns (grid blowout root cause)
const bareFr = all.filter(([, s]) => /grid-cols-\[[^\]]*(?<!minmax\(0,)(^|_)[\d.]+fr(_|\])/m.test(s.replace(/minmax\(0,[\d.]+fr\)/g, "MMX")));
const bare2 = all.filter(([f, s]) => {
  const m = s.match(/grid-cols-\[[^\]]+\]/g) ?? [];
  return m.some((t) => /(^|_)[\d.]+fr(_|\])/.test(t.replace(/minmax\(0,[\d.]+fr\)/g, "MMX")));
});
bare2.length ? bare2.forEach(([f]) => fail(`bare fr track in ${f}`)) : pass("all fr grid tracks use minmax(0,…)");
void bareFr;

// 2. No fixed-width overlays that can exceed small viewports
//    (max-w-[…] caps paired with w-full are fluid and allowed)
const fixedOverlay = all.filter(([f, s]) =>
  /(?<!max-)w-\[(3[2-9]\d|[4-9]\d\d)px\]/.test(s) && !s.includes("min(") && !f.includes("qr-studio"),
);
fixedOverlay.length
  ? fixedOverlay.forEach(([f]) => fail(`fixed width ≥320px without min() in ${f}`))
  : pass("no fixed overlays wider than small viewports");

// 3. Required mobile-first guarantees
const checks = [
  ["viewport export present", read("src/app/layout.tsx").includes("export const viewport")],
  ["base img max-width rule", read("src/app/globals.css").includes("max-width: 100%")],
  ["overflow-wrap base rule", read("src/app/globals.css").includes("overflow-wrap: anywhere")],
  ["tables scroll inside container only", read("src/components/ui.tsx").includes("overflow-x-auto md:block")],
  ["inputs are fluid (max-w-full min-w-0)", read("src/components/ui.tsx").includes("w-full max-w-full min-w-0")],
  ["touch-size inputs on mobile (16px)", read("src/components/ui.tsx").includes("text-[16px]")],
  ["touch-size buttons (min-h-11)", read("src/components/ui.tsx").includes("min-h-11")],
  ["wizard compact mobile step indicator", read("src/components/client-wizard.tsx").includes("Step {step + 1} of {STEPS.length}")],
  ["wizard step chips scroll in own container", /max-w-full gap-1\.5 overflow-x-auto/.test(read("src/components/client-wizard.tsx"))],
  ["wizard grid children can shrink (min-w-0)", /aside className="min-w-0/.test(read("src/components/client-wizard.tsx")) && /Card className="min-w-0/.test(read("src/components/client-wizard.tsx"))],
  ["wizard footer stacks on phones", read("src/components/client-wizard.tsx").includes("flex-col gap-2 sm:flex-row")],
  ["wizard footer safe-area padding", read("src/components/client-wizard.tsx").includes("env(safe-area-inset-bottom)")],
  ["drawer fluid width", read("src/components/shell.tsx").includes("w-[min(20rem,85vw)]")],
  ["bottom nav safe area", read("src/components/shell.tsx").includes("pb-[env(safe-area-inset-bottom)]")],
  ["search dropdown fluid", read("src/components/shell.tsx").includes("min(320px,calc(100vw-2rem))")],
  ["modal is responsive bottom sheet", read("src/components/interactive.tsx").includes("w-full") && read("src/components/interactive.tsx").includes("sm:max-w-lg")],
  ["no h-screen/100vh clipping", !all.some(([, s]) => /\bh-screen\b|100vh/.test(s))],
  ["dvh used for full-height", all.some(([, s]) => s.includes("min-h-dvh"))],
];
for (const [name, ok] of checks) (ok ? pass : fail)(name);

console.log(failures ? `\n${failures} responsive check(s) FAILED` : "\nAll responsive guarantees verified.");
process.exit(failures ? 1 : 0);
