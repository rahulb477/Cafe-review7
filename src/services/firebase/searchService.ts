import { where } from "firebase/firestore";
import { COL, SUB, listSub, listWhere } from "@/lib/firebase/firestore";
import type { CustomerDoc, StaffDoc } from "@/lib/firebase/types";
import { clientService } from "./clientService";
import type { MenuItemRecord } from "./menuMapper";

export type SearchGroup = { group: string; items: { label: string; sub: string; href: string }[] };

export type SearchScope = {
  /**
   * Normal admins: exactly their ONE store ([clientId]).
   * SUPER_ADMIN: null → platform-wide (every store).
   */
  storeIds: string[] | null;
  /** Store results are platform-level only — never shown to normal admins. */
  includeStores: boolean;
};

/**
 * Debounced global search. Store-scoped: a normal admin only ever searches
 * inside their own store, and the "Clients" (store) group is SUPER_ADMIN-only.
 */
export const searchService = {
  async global(q: string, scope: SearchScope): Promise<SearchGroup[]> {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];

    const clients =
      scope.storeIds === null
        ? await clientService.listAll()
        : await clientService.listByIds(scope.storeIds);
    const hit = (s: string) => s.toLowerCase().includes(needle);
    const inScope = clients.slice(0, 6);
    const [customers, staff, items] = await Promise.all([
      Promise.all(inScope.map((c) => listWhere<CustomerDoc>(COL.customers, [where("clientId", "==", c.id)], 100))),
      Promise.all(inScope.map((c) => listWhere<StaffDoc>(COL.staffUsers, [where("clientId", "==", c.id)], 50))),
      Promise.all(inScope.map((c) => listSub<MenuItemRecord>(c.id, SUB.menuItems, [], 150))),
    ]);
    const groups: (SearchGroup | null)[] = [
      scope.includeStores
        ? {
            group: "Stores",
            items: clients
              .filter((c) => hit(c.businessName) || hit(c.slug))
              .slice(0, 4)
              .map((c) => ({ label: c.businessName, sub: `/${c.slug}`, href: `/admin/clients/${c.id}` })),
          }
        : null,
      {
        group: "Customers",
        items: customers
          .flat()
          .filter((c) => hit(c.name) || hit(c.code))
          .slice(0, 4)
          .map((c) => ({
            label: `${c.name} ${c.code}`,
            sub: c.email || c.phone,
            href: `/admin/clients/${c.clientId}/customers/${c.id}`,
          })),
      },
      {
        group: "Staff",
        items: staff
          .flat()
          .filter((s) => hit(s.name) || hit(s.email))
          .slice(0, 4)
          .map((s) => ({ label: s.name, sub: `${s.role} · ${s.email}`, href: `/admin/clients/${s.clientId}/staff` })),
      },
      {
        group: "Menu items",
        items: items
          .flat()
          .filter((i) => hit(i.name))
          .slice(0, 4)
          .map((i) => ({ label: i.name, sub: `₹${i.price}`, href: `/admin/clients/${i.clientId}/menu/${i.id}` })),
      },
    ];
    return groups.filter((g): g is SearchGroup => Boolean(g && g.items.length));
  },
};
