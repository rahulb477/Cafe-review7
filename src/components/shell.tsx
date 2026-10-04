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

type NavItem = { id: string; href: string; label: string; icon: ReactNode; section: "global" | "store" };

/**
 * CANONICAL NAVIGATION CONFIG — the single source of truth for every
 * sidebar/drawer item. Labels come from here only (never from Firebase
 * data) and no item is ever filtered by data availability.
 *
 * ONE ADMIN = ONE STORE: a normal admin (CLIENT_ADMIN / MANAGER) has no
 * "Stores" entry — their single store's areas are listed directly in the
 * sidebar. SUPER_ADMIN keeps the platform-level Stores list.
 */
export const BASE_NAV: NavItem[] = [
  { id: "dashboard", href: "/admin", label: "Dashboard", icon: <LayoutGrid className="size-4" />, section: "global" },
  { id: "activity", href: "/admin/activity", label: "Activity", icon: <Activity className="size-4" />, section: "global" },
  { id: "settings", href: "/admin/settings", label: "Settings", icon: <Settings className="size-4" />, section: "global" },
];

export const SUPER_ADMIN_NAV: NavItem[] = [
  BASE_NAV[0],
  { id: "stores", href: "/admin/clients", label: "Stores", icon: <Building2 className="size-4" />, section: "global" },
  BASE_NAV[1],
  BASE_NAV[2],
];

/** Role-aware global navigation. Normal admins never see Stores. */
export const globalNavFor = (role: string): NavItem[] =>
  role === "SUPER_ADMIN" ? SUPER_ADMIN_NAV : BASE_NAV;

export const STORE_NAV_LABELS = [
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
] as const;

export const storeNav = (id: string): NavItem[] => [
  { id: "store-overview", href: `/admin/clients/${id}`, label: "Store Overview", icon: <Building2 className="size-4" />, section: "store" },
  { id: "store-branding", href: `/admin/clients/${id}/branding`, label: "Store Branding", icon: <CreditCard className="size-4" />, section: "store" },
  { id: "store-menu", href: `/admin/clients/${id}/menu`, label: "Store Menu", icon: <UtensilsCrossed className="size-4" />, section: "store" },
  { id: "store-staff", href: `/admin/clients/${id}/staff`, label: "Store Staff", icon: <Users className="size-4" />, section: "store" },
  { id: "store-customers", href: `/admin/clients/${id}/customers`, label: "Customers", icon: <Users className="size-4" />, section: "store" },
  { id: "store-loyalty", href: `/admin/clients/${id}/loyalty`, label: "Store Loyalty", icon: <BadgePercent className="size-4" />, section: "store" },
  { id: "store-qr", href: `/admin/clients/${id}/qr`, label: "Store QR", icon: <QrCode className="size-4" />, section: "store" },
  { id: "store-reviews", href: `/admin/clients/${id}/reviews`, label: "Reviews", icon: <Star className="size-4" />, section: "store" },
  { id: "store-feedback", href: `/admin/clients/${id}/feedback`, label: "Feedback", icon: <MessageSquare className="size-4" />, section: "store" },
  { id: "store-ai", href: `/admin/clients/${id}/ai-review`, label: "Store AI", icon: <Sparkles className="size-4" />, section: "store" },
  { id: "store-analytics", href: `/admin/clients/${id}/analytics`, label: "Store Analytics", icon: <Activity className="size-4" />, section: "store" },
  { id: "store-activity", href: `/admin/clients/${id}/activity`, label: "Activity Log", icon: <ClipboardList className="size-4" />, section: "store" },
];

/** Store context is derived from the ROUTE, so the store nav never vanishes while Firebase loads or errors. */
function storeIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/admin\/clients\/(?!new$)([^/]+)/);
  return m && m[1] !== "new" ? m[1] : null;
}

/** Active = exact match, or deepest-prefix match for nested routes (e.g. /menu/new highlights Store Menu). */
function isActivePath(pathname: string, href: string, all: NavItem[]): boolean {
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;
  // another item is a longer prefix → that one is active instead
  return !all.some((o) => o.href !== href && o.href.length > href.length && pathname.startsWith(o.href));
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
   * The admin's ONE store (admins/{uid}.clientId). Used to render the store
   * section on workspace pages. Never a store selector — informational only.
   */
  storeId?: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  // the drawer is tied to the route it was opened on, so it closes on navigation
  const [openOnPath, setOpenOnPath] = useState<string | null>(null);
  const drawer = openOnPath === pathname;
  const openDrawer = () => setOpenOnPath(pathname);

  const isSuper = admin.role === "SUPER_ADMIN";
  const nav = globalNavFor(admin.role);

  // Route-derived store context: the store section renders whenever the URL
  // is inside a store, regardless of whether the client doc has loaded.
  const routeStoreId = storeIdFromPath(pathname);
  // Normal admins always operate on their ONE store (from admins/{uid}.clientId).
  const activeStoreId = client?.id ?? routeStoreId ?? storeId ?? null;
  const storeItems = activeStoreId ? storeNav(activeStoreId) : [];
  const allItems = [...nav, ...storeItems];

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
  const storeTitle = headerStore?.displayName ?? (activeStoreId ? "Your store" : "");
  const pageTitle = activeStoreId
    ? "Store"
    : pathname === "/admin/clients"
      ? "Stores"
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
            <nav aria-label="Workspace" className="space-y-1">
              {nav.map((item) => (
                <RailLink key={item.id} item={item} active={isActivePath(pathname, item.href, allItems)} />
              ))}
            </nav>
            {activeStoreId ? (
              <>
                <p className="label-caps mt-6 mb-2 truncate px-2 !text-cream/40">{storeTitle}</p>
                <nav aria-label="Store" className="space-y-0.5">
                  {storeItems.map((item) => (
                    <RailLink key={item.id} item={item} active={isActivePath(pathname, item.href, allItems)} />
                  ))}
                </nav>
              </>
            ) : null}
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

        {/* mobile drawer */}
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
              <nav aria-label="Navigation" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain pb-4">
                {nav.map((item) => (
                  <RailLink key={item.id} item={item} active={isActivePath(pathname, item.href, allItems)} />
                ))}
                {activeStoreId ? (
                  <>
                    <p className="label-caps mt-5 mb-2 truncate px-2 !text-cream/40">{storeTitle}</p>
                    {storeItems.map((item) => (
                      <RailLink key={item.id} item={item} active={isActivePath(pathname, item.href, allItems)} />
                    ))}
                  </>
                ) : null}
              </nav>
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

        {/* mobile bottom navigation — no Stores tab for normal admins */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-linen bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {(activeStoreId
            ? [
                { href: `/admin/clients/${activeStoreId}`, label: "Home", icon: <LayoutGrid className="size-4" /> },
                { href: `/admin/clients/${activeStoreId}/menu`, label: "Menu", icon: <UtensilsCrossed className="size-4" /> },
                { href: `/admin/clients/${activeStoreId}/customers`, label: "Guests", icon: <Users className="size-4" /> },
                { href: `/admin/clients/${activeStoreId}/qr`, label: "QR", icon: <QrCode className="size-4" /> },
              ]
            : isSuper
              ? [
                  { href: "/admin", label: "Home", icon: <LayoutGrid className="size-4" /> },
                  { href: "/admin/clients", label: "Stores", icon: <Building2 className="size-4" /> },
                  { href: "/admin/activity", label: "Activity", icon: <Activity className="size-4" /> },
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

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      data-nav-id={item.id}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-semibold transition-colors duration-150 lg:px-3",
        active ? "bg-cream text-espresso" : "text-cream/80 hover:bg-cream/10 hover:text-cream",
      )}
    >
      <span className="w-4 shrink-0">{item.icon}</span>
      {/* label is always rendered and never hidden behind a breakpoint, opacity or hover */}
      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
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
