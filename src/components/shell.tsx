"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BadgePercent,
  Building2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  LayoutGrid,
  LogOut,
  Menu as MenuIcon,
  MessageSquare,
  MoreHorizontal,
  QrCode,
  Search,
  Settings,
  Sparkles,
  Star,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Avatar, Badge, Button, cn } from "./ui";
import { useAuth } from "@/context/AuthContext";
import { clientService } from "@/lib/firebase/services";
import { BrandMark } from "./brand";
import { ToastFromQuery, ToastHost } from "@/components/interactive";

export type ShellClient = {
  id: string;
  name: string;
  displayName: string;
  slug: string;
  status: string;
  logoUrl: string | null;
} | null;

export type NavItem = { id: string; href: string; label: string; icon: ReactNode };

/**
 * A node of the navigation tree: either a single link (Dashboard, Activity,
 * Settings) or a labelled group of links (the store section).
 */
export type NavNode =
  | { kind: "link"; id: string; item: NavItem }
  | { kind: "group"; id: string; label: string; caption: string | null; items: NavItem[] };

/* ------------------------------------------------------------------ *
 * CANONICAL NAVIGATION — ONE constant tree for the whole admin console.
 *
 * This tree is ROUTE-INDEPENDENT. Every admin page renders exactly the
 * same structure:
 *
 *     Dashboard
 *     STORE
 *       Store Overview … Activity Log
 *     Activity
 *     Settings
 *
 * The current pathname is used for ONE thing only — deciding which item
 * carries the active pill. No item is ever added, removed, filtered or
 * swapped based on the route, the role, or whether a document has loaded.
 *
 * ONE ADMIN = ONE STORE: there is no "Stores" switcher anywhere. The store
 * section belongs to the admin's own store (admins/{uid}.clientId), which is
 * resolved below and never changes while navigating.
 * ------------------------------------------------------------------ */

/** Rendered above the store group. */
export const DASHBOARD_ITEM: NavItem = {
  id: "dashboard",
  href: "/admin",
  label: "Dashboard",
  icon: <LayoutGrid className="size-4" />,
};

/** Rendered below the store group. */
export const WORKSPACE_ITEMS: NavItem[] = [
  { id: "activity", href: "/admin/activity", label: "Activity", icon: <Activity className="size-4" /> },
  { id: "settings", href: "/admin/settings", label: "Settings", icon: <Settings className="size-4" /> },
];

export const STORE_GROUP_LABEL = "STORE";

/**
 * The twelve store areas, in their fixed order. Only the href *prefix*
 * (the store id) varies — the rows themselves are always rendered.
 */
export const STORE_NAV: { id: string; label: string; segment: string; icon: ReactNode }[] = [
  { id: "store-overview", label: "Store Overview", segment: "", icon: <Building2 className="size-4" /> },
  { id: "store-branding", label: "Store Branding", segment: "/branding", icon: <CreditCard className="size-4" /> },
  { id: "store-menu", label: "Store Menu", segment: "/menu", icon: <UtensilsCrossed className="size-4" /> },
  { id: "store-staff", label: "Store Staff", segment: "/staff", icon: <Users className="size-4" /> },
  { id: "store-customers", label: "Customers", segment: "/customers", icon: <Users className="size-4" /> },
  { id: "store-loyalty", label: "Store Loyalty", segment: "/loyalty", icon: <BadgePercent className="size-4" /> },
  { id: "store-qr", label: "Store QR", segment: "/qr", icon: <QrCode className="size-4" /> },
  { id: "store-reviews", label: "Reviews", segment: "/reviews", icon: <Star className="size-4" /> },
  { id: "store-feedback", label: "Feedback", segment: "/feedback", icon: <MessageSquare className="size-4" /> },
  { id: "store-ai", label: "Store AI", segment: "/ai-review", icon: <Sparkles className="size-4" /> },
  { id: "store-analytics", label: "Store Analytics", segment: "/analytics", icon: <Activity className="size-4" /> },
  { id: "store-activity", label: "Activity Log", segment: "/activity", icon: <ClipboardList className="size-4" /> },
];

/**
 * Builds the navigation tree — the ONLY navigation structure in the app,
 * shared by the desktop rail and the mobile drawer.
 *
 * `storeId` fills in the store hrefs; when it is not resolved yet the store
 * group still renders its twelve rows (inert) so the tree never changes
 * shape while a document is loading or on a workspace route.
 */
export function buildNavigation(storeId: string | null, storeName?: string | null): NavNode[] {
  const storeItems: NavItem[] = STORE_NAV.map(({ id, label, segment, icon }) => ({
    id,
    label,
    icon,
    href: storeId ? `/admin/clients/${storeId}${segment}` : "",
  }));
  return [
    { kind: "link", id: DASHBOARD_ITEM.id, item: DASHBOARD_ITEM },
    { kind: "group", id: "store", label: STORE_GROUP_LABEL, caption: storeName?.trim() || null, items: storeItems },
    ...WORKSPACE_ITEMS.map((item) => ({ kind: "link" as const, id: item.id, item })),
  ];
}

export const flattenNavigation = (nodes: NavNode[]): NavItem[] =>
  nodes.flatMap((node) => (node.kind === "link" ? [node.item] : node.items));

/** The store whose pages are currently open, if the URL is inside one. Never used to decide *whether* the store group renders. */
function storeIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/admin\/clients\/(?!new$)([^/]+)/);
  return m && m[1] !== "new" ? m[1] : null;
}

/** Active = exact match, or deepest-prefix match for nested routes (e.g. /menu/new highlights Store Menu). */
function isActivePath(pathname: string, href: string, all: NavItem[]): boolean {
  if (!href) return false;
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;
  // another item is a longer prefix → that one is active instead
  return !all.some((o) => o.href && o.href !== href && o.href.length > href.length && pathname.startsWith(o.href));
}

const LAST_STORE_KEY = "grounds.admin.currentStoreId";

function readRememberedStoreId(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(LAST_STORE_KEY);
  } catch {
    return null;
  }
}

function rememberStoreId(id: string) {
  try {
    window.localStorage.setItem(LAST_STORE_KEY, id);
  } catch {
    /* storage unavailable — resolution falls back to the lookup below */
  }
}

/**
 * Resolves the store the sidebar belongs to WITHOUT depending on the route,
 * so the store section is identical on /admin, /admin/activity,
 * /admin/settings and every /admin/clients/[clientId]/** page:
 *
 *   1. the store in the URL (a super admin walking through a store)
 *   2. the live client document the page is rendering
 *   3. the authenticated admin's own store — admins/{uid}.clientId. This is
 *      the single-store model: it is the same value on every page, so the
 *      tree cannot change between routes.
 *   4. the store last opened in this browser (covers workspace routes for a
 *      platform-wide account)
 *   5. one-off read of the first store this account may read
 *
 * This is a resolution, never a selector: there is nothing to switch.
 */
function useResolvedStoreId(knownStoreId: string | null, ownStoreId: string | null): string | null {
  const { allowedClientIds } = useAuth();
  const known = knownStoreId ?? ownStoreId ?? null;
  // The store this browser last opened — read once per mount, never a selector.
  const [remembered] = useState<string | null>(readRememberedStoreId);
  const [lookedUp, setLookedUp] = useState<string | null>(null);

  useEffect(() => {
    if (!known) return;
    rememberStoreId(known);
  }, [known]);

  useEffect(() => {
    if (known || remembered) return;
    // A normal admin's store always comes from admins/{uid}.clientId; only a
    // platform-wide account needs the lookup.
    if (allowedClientIds !== null) return;
    let alive = true;
    clientService
      .listAllowed(allowedClientIds)
      .then((rows) => {
        const id = rows[0]?.id ?? null;
        if (!alive || !id) return;
        rememberStoreId(id);
        setLookedUp(id);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [known, remembered, allowedClientIds]);

  return known ?? remembered ?? lookedUp ?? null;
}

export function AdminShell({
  admin,
  client,
  storeId,
  children,
}: {
  admin: { name: string; email: string; role: string };
  client: ShellClient;
  /**
   * The admin's ONE store (admins/{uid}.clientId). Used to fill in the store
   * section's hrefs on workspace pages. Never a store selector.
   */
  storeId?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // the drawer is tied to the route it was opened on, so it closes on navigation
  const [openOnPath, setOpenOnPath] = useState<string | null>(null);
  const drawer = openOnPath === pathname;
  const openDrawer = () => setOpenOnPath(pathname);

  // Store context: route/store doc first, then the admin's own store, then
  // the remembered one — the tree below is rendered either way.
  const activeStoreId = useResolvedStoreId(client?.id ?? storeIdFromPath(pathname) ?? null, storeId ?? null);

  // Header shows the current store name — informational only (no switcher).
  const [liveStore, setLiveStore] = useState<ShellClient>(null);
  useEffect(() => {
    if (client || !activeStoreId) return;
    return clientService.watch(
      activeStoreId,
      (data) =>
        setLiveStore(
          data?.client
            ? {
                id: data.client.id,
                name: data.client.businessName,
                displayName: data.client.displayName,
                slug: data.client.slug,
                status: data.client.status,
                logoUrl: data.client.logoUrl,
              }
            : null,
        ),
      () => undefined,
    );
  }, [client, activeStoreId]);

  const headerStore = client ?? liveStore;

  // ONE tree for every route — the pathname only decides the active pill.
  const navigation = buildNavigation(activeStoreId, headerStore?.displayName ?? null);

  const pageTitle = activeStoreId
    ? "Store"
    : pathname === "/admin/activity"
      ? "Activity"
      : pathname === "/admin/settings"
        ? "Settings"
        : "Workspace";

  return (
    <ToastHost>
      <div className="min-h-dvh bg-cream md:pl-[232px] lg:pl-[248px]">
        {/* espresso rail — labels always visible from md: up; nav scrolls, footer pinned */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-[232px] flex-col bg-espresso px-3 py-4 text-cream md:flex lg:w-[248px] lg:px-4">
          <Link href="/admin" className="mb-5 flex shrink-0 items-center gap-2.5 px-1 py-2">
            <BrandMark className="size-8 shrink-0" />
            <span className="min-w-0">
              <span className="block font-[family-name:var(--font-display)] text-[17px] font-black leading-none tracking-tight">
                Grounds
              </span>
              <span className="label-caps !text-cream/50">Admin console</span>
            </span>
          </Link>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5">
            <NavigationTree nodes={navigation} pathname={pathname} ariaLabel="Workspace" className="space-y-1" />
          </div>
          <div className="shrink-0 border-t border-cream/15 pt-3">
            <div className="flex items-center gap-2.5 px-1">
              <Avatar name={admin.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold">{admin.name}</p>
                <p className="label-caps !text-cream/50">{admin.role.replace("_", " ")}</p>
              </div>
            </div>
            <LogoutButton className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-ember transition-colors hover:bg-ember/15" />
          </div>
        </aside>

        {/* mobile / tablet top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-linen bg-cream/95 px-4 py-3 backdrop-blur md:px-6">
          <button
            className="grid size-9 place-items-center rounded-xl border border-linen bg-paper text-espresso md:hidden"
            onClick={() => openDrawer()}
            aria-label="Open navigation"
          >
            <MenuIcon className="size-4" />
          </button>
          <div className="min-w-0 flex-1">
            {headerStore ? (
              <div className="flex items-center gap-2">
                <Avatar name={headerStore.name} src={headerStore.logoUrl} size={28} square />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold leading-tight text-espresso">{headerStore.name}</p>
                  <p className="label-caps">/{headerStore.slug}</p>
                </div>
              </div>
            ) : (
              <p className="display-num text-lg text-espresso">{pageTitle}</p>
            )}
          </div>
          <GlobalSearch />
          {headerStore && headerStore.status !== "ACTIVE" && headerStore.status !== "PUBLISHED" ? (
            <Badge tone={headerStore.status === "DRAFT" ? "gold" : "red"}>{headerStore.status}</Badge>
          ) : null}
          <Avatar name={admin.name} size={30} className="hidden sm:block" />
        </header>

        <main className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-5 md:px-8 md:pb-12">{children}</main>

        {/* mobile drawer — same complete navigation tree, different layout */}
        {drawer ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <div className="absolute inset-0 bg-bean/45 backdrop-blur-[2px]" onClick={() => setOpenOnPath(null)} aria-hidden />
            <div className="modal-in relative flex h-full w-[min(20rem,85vw)] flex-col bg-espresso px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-cream">
              <button
                className="absolute right-3 top-3 rounded-lg p-1.5 text-cream/70 hover:bg-cream/10"
                onClick={() => setOpenOnPath(null)}
                aria-label="Close navigation"
              >
                <X className="size-4" />
              </button>
              <div className="mb-5 flex items-center gap-2.5">
                <BrandMark className="size-8" />
                <div>
                  <p className="font-[family-name:var(--font-display)] text-[16px] font-black leading-none">Grounds</p>
                  <p className="label-caps !text-cream/50">Admin console</p>
                </div>
              </div>
              <NavigationTree
                nodes={navigation}
                pathname={pathname}
                ariaLabel="Navigation"
                className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain pb-4"
              />
              <div className="border-t border-cream/15 pt-3">
                <div className="flex items-center gap-2.5">
                  <Avatar name={admin.name} size={32} />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-bold">{admin.name}</p>
                    <p className="label-caps !text-cream/50">{admin.role.replace("_", " ")}</p>
                  </div>
                </div>
                <LogoutButton className="mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[12px] font-semibold text-ember hover:bg-ember/15" />
              </div>
            </div>
          </div>
        ) : null}

        {/* mobile bottom navigation — shortcuts only; the drawer holds the full tree */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-linen bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {(activeStoreId
            ? [
                { href: `/admin/clients/${activeStoreId}`, label: "Home", icon: <LayoutGrid className="size-4" /> },
                { href: `/admin/clients/${activeStoreId}/menu`, label: "Menu", icon: <UtensilsCrossed className="size-4" /> },
                { href: `/admin/clients/${activeStoreId}/customers`, label: "Guests", icon: <Users className="size-4" /> },
                { href: `/admin/clients/${activeStoreId}/qr`, label: "QR", icon: <QrCode className="size-4" /> },
              ]
            : [
                { href: "/admin", label: "Home", icon: <LayoutGrid className="size-4" /> },
                { href: "/admin/activity", label: "Activity", icon: <Activity className="size-4" /> },
                { href: "/admin/settings", label: "Settings", icon: <Settings className="size-4" /> },
              ]
          ).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition-colors",
                pathname === item.href ? "text-caramel" : "text-mocha",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
          <button
            onClick={() => openDrawer()}
            className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold text-mocha"
          >
            <MoreHorizontal className="size-4" />
            More
          </button>
        </nav>
        <ToastFromQuery />
      </div>
    </ToastHost>
  );
}

/**
 * Renders ONE navigation tree — the same `nodes` array is passed by the
 * desktop rail and the mobile drawer, so both always show the complete
 * navigation. Only the active item reacts to the pathname.
 */
function NavigationTree({
  nodes,
  pathname,
  ariaLabel,
  className,
}: {
  nodes: NavNode[];
  pathname: string;
  ariaLabel: string;
  className?: string;
}) {
  const allItems = flattenNavigation(nodes);
  return (
    <nav aria-label={ariaLabel} className={className}>
      {nodes.map((node) =>
        node.kind === "link" ? (
          <RailLink key={node.id} item={node.item} active={isActivePath(pathname, node.item.href, allItems)} />
        ) : (
          <div key={node.id} className="pt-4">
            <div className="mb-2 flex items-baseline gap-2 px-2.5 lg:px-3">
              <p className="label-caps !text-cream/40">{node.label}</p>
              {node.caption ? (
                <p className="min-w-0 flex-1 truncate text-right text-[10.5px] font-bold text-cream/40">{node.caption}</p>
              ) : null}
            </div>
            <div className="space-y-0.5">
              {node.items.map((item) => (
                <RailLink key={item.id} item={item} active={isActivePath(pathname, item.href, allItems)} />
              ))}
            </div>
          </div>
        ),
      )}
    </nav>
  );
}

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  const body = (
    <>
      <span className="w-4 shrink-0">{item.icon}</span>
      {/* label is always rendered and never hidden behind a breakpoint, opacity or hover */}
      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
    </>
  );
  const className = cn(
    "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold transition-colors duration-150 lg:px-3",
    active ? "bg-cream text-espresso" : "text-cream/80 hover:bg-cream/10 hover:text-cream",
  );
  // Unresolved store: the row keeps its place in the tree but cannot be opened.
  if (!item.href) {
    return (
      <span className={cn(className, "cursor-default text-cream/35")} aria-disabled="true" data-nav-id={item.id}>
        {body}
      </span>
    );
  }
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} data-nav-id={item.id} className={className}>
      {body}
    </Link>
  );
}

function LogoutButton({ className }: { className: string }) {
  const { logout } = useAuth();
  return (
    <button
      className={className}
      onClick={() => logout().then(() => (window.location.href = "/admin/login"))}
    >
      <LogOut className="size-3.5" /> Sign out
    </button>
  );
}

type SearchGroup = { group: string; items: { label: string; sub: string; href: string }[] };

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchGroup[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { allowedClientIds, isSuperAdmin } = useAuth();

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) return; // short query → nothing to search (rendered empty)
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { searchService } = await import("@/lib/firebase/services");
        // Normal admins search inside their ONE store only; no store results.
        const groups = await searchService.global(needle, {
          storeIds: allowedClientIds,
          includeStores: isSuperAdmin,
        });
        setResults(groups);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, allowedClientIds, isSuperAdmin]);

  // A stale result set from a longer query is never shown for a short one.
  const shown = q.trim().length >= 2 ? results : [];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={boxRef} className="relative hidden sm:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-mocha" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => shown.length && setOpen(true)}
        placeholder={isSuperAdmin ? "Search stores, guests, staff, menu…" : "Search guests, staff, menu…"}
        aria-label="Global search"
        className="w-44 rounded-xl border border-linen bg-paper py-2 pl-8 pr-3 text-[12px] transition-all duration-200 focus:w-64 focus:border-caramel focus:outline-none lg:w-56 lg:focus:w-80"
      />
      {loading ? <span className="label-caps absolute right-2.5 top-1/2 -translate-y-1/2">…</span> : null}
      {open ? (
        <div className="modal-in absolute right-0 top-11 z-50 max-h-[60vh] w-[min(320px,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-linen bg-paper p-2 shadow-[0_20px_50px_-24px_rgba(35,19,12,0.5)]">
          {shown.length === 0 ? (
            <p className="px-3 py-4 text-[12px] text-mocha">No matches for “{q}”.</p>
          ) : (
            shown.map((group) => (
              <div key={group.group} className="mb-1 last:mb-0">
                <p className="label-caps px-2 py-1">{group.group}</p>
                {group.items.map((item) => (
                  <button
                    key={item.href}
                    onClick={() => {
                      setOpen(false);
                      router.push(item.href);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-linen"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[12.5px] font-semibold text-espresso">{item.label}</span>
                      <span className="block truncate text-[11px] text-mocha">{item.sub}</span>
                    </span>
                    <ChevronRight className="size-3.5 shrink-0 text-mocha" />
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export { BrandMark } from "./brand";

export function PageToolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function useFormPending() {
  const [pending, setPending] = useState(false);
  return { pending, setPending };
}

export { Button, Badge };
