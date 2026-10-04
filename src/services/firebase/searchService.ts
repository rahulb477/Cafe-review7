import { where } from "firebase/firestore";
import { COL, SUB, listSub, listWhere } from "@/lib/firebase/firestore";
import type { CustomerDoc, StaffDoc } from "@/lib/firebase/types";
import { clientService } from "./clientService";
import type { MenuItemRecord } from "./menuMapper";

/** Debounced global search across clients, customers, staff and menu items. */
export const searchService = {
  async global(q: string, allowedClientIds: string[] | null) {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const clients = await clientService.listAllowed(allowedClientIds);
    const scope = clients.slice(0, 6);
    const hit = (s: string) => s.toLowerCase().includes(needle);
    const [customers, staff, items] = await Promise.all([
      Promise.all(scope.map((c) => listWhere<CustomerDoc>(COL.customers, [where("clientId", "==", c.id)], 100))),
      Promise.all(scope.map((c) => listWhere<StaffDoc>(COL.staffUsers, [where("clientId", "==", c.id)], 50))),
      Promise.all(scope.map((c) => listSub<MenuItemRecord>(c.id, SUB.menuItems, [], 150))),
    ]);
    return [
      {
        group: "Clients",
        items: clients
          .filter((c) => hit(c.businessName) || hit(c.slug))
          .slice(0, 4)
          .map((c) => ({ label: c.businessName, sub: `/${c.slug}`, href: `/admin/clients/${c.id}` })),
      },
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
    ].filter((g) => g.items.length);
  },
};
