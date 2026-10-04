import { writeBatch } from "firebase/firestore";
import { SUB, createSub, db, getSub, listSub, newId, patchSub, removeSub, subDoc } from "@/lib/firebase/firestore";
import type { Actor, MenuCategoryDoc, MenuItemDoc } from "@/lib/firebase/types";
import { activityService } from "./activityService";
import { materializeImage } from "./storageService";
import { fromMenuRecord, toMenuRecord, type MenuItemRecord } from "./menuMapper";

const now = () => Date.now();
const slugify = (input: string) =>
  input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Menu lives at clients/{clientId}/menuCategories and …/menuItems. Item images host on ImgBB. */
export const menuService = {
  async categories(clientId: string) {
    const [cats, items] = await Promise.all([
      listSub<MenuCategoryDoc>(clientId, SUB.menuCategories, [], 60),
      listSub<MenuItemRecord>(clientId, SUB.menuItems, [], 300),
    ]);
    return cats
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({ ...c, itemCount: items.filter((i) => i.categoryId === c.id).length }));
  },

  async items(clientId: string): Promise<MenuItemDoc[]> {
    const rows = await listSub<MenuItemRecord>(clientId, SUB.menuItems, [], 300);
    return rows.map(fromMenuRecord).sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt - a.createdAt);
  },

  async item(clientId: string, itemId: string): Promise<MenuItemDoc | null> {
    const raw = await getSub<MenuItemRecord>(clientId, SUB.menuItems, itemId);
    return raw ? fromMenuRecord(raw) : null;
  },

  async saveItem(actor: Actor, clientId: string, itemId: string | null, input: Record<string, unknown>) {
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("Item name is required.");
    const image = await materializeImage(`clients/${clientId}/menu`, input.imageUrl as string);
    const record = {
      clientId,
      categoryId: (input.categoryId as string) || null,
      name,
      slug: slugify(String(input.slug ?? "") || name),
      price: Number(input.price ?? 0),
      description: String(input.shortDescription ?? ""),
      fullDescription: String(input.fullDescription ?? ""),
      image,
      rating: Math.max(0, Math.min(5, Number(input.rating ?? 4.5))),
      ingredients: String(input.ingredients ?? ""),
      dietaryInfo: String(input.dietary ?? ""),
      allergens: String(input.allergens ?? ""),
      preparationTime: Number(input.prepTimeMinutes ?? 10),
      calories: Number(input.calories ?? 0),
      featured: Boolean(input.featured),
      active: input.active === undefined ? true : Boolean(input.active),
      updatedAt: now(),
    };
    if (itemId) {
      const before = await getSub<MenuItemRecord>(clientId, SUB.menuItems, itemId);
      if (!before) throw new Error("Menu item not found for this business.");
      await patchSub(clientId, SUB.menuItems, itemId, record);
      await activityService.log(actor, clientId, "MENU_ITEM_UPDATED", name, {}, {
        before: { name: before.name, price: before.price, active: before.active },
        after: { name: record.name, price: record.price, active: record.active },
      });
      return itemId;
    }
    const id = newId("itm");
    await createSub(clientId, SUB.menuItems, id, { ...record, sortOrder: 0, views: 0, clicks: 0, createdAt: now() });
    await activityService.log(actor, clientId, "MENU_ITEM_CREATED", name, {}, { after: { name, price: record.price } });
    return id;
  },

  async duplicateItem(actor: Actor, clientId: string, itemId: string) {
    const raw = await getSub<MenuItemRecord>(clientId, SUB.menuItems, itemId);
    if (!raw) throw new Error("Menu item not found.");
    const id = newId("itm");
    const { id: _old, ...rest } = raw;
    await createSub(clientId, SUB.menuItems, id, {
      ...rest,
      name: `${raw.name} (copy)`,
      slug: `${raw.slug}-copy-${id.slice(-4)}`,
      active: false,
      views: 0,
      clicks: 0,
      createdAt: now(),
      updatedAt: now(),
    });
    await activityService.log(actor, clientId, "MENU_ITEM_CREATED", `${raw.name} (copy)`);
  },

  async toggleItem(actor: Actor, clientId: string, itemId: string, active: boolean) {
    const raw = await getSub<MenuItemRecord>(clientId, SUB.menuItems, itemId);
    if (!raw) throw new Error("Menu item not found.");
    await patchSub(clientId, SUB.menuItems, itemId, { active, updatedAt: now() });
    await activityService.log(actor, clientId, active ? "MENU_ITEM_ENABLED" : "MENU_ITEM_DISABLED", raw.name, {}, {
      before: { active: raw.active },
      after: { active },
    });
  },

  async deleteItem(actor: Actor, clientId: string, itemId: string) {
    const raw = await getSub<MenuItemRecord>(clientId, SUB.menuItems, itemId);
    if (!raw) throw new Error("Menu item not found.");
    await removeSub(clientId, SUB.menuItems, itemId);
    await activityService.log(actor, clientId, "MENU_ITEM_DELETED", raw.name, {}, {
      before: { name: raw.name, price: raw.price },
    });
  },

  async saveCategory(actor: Actor, clientId: string, categoryId: string | null, name: string, active: boolean) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Category name is required.");
    if (categoryId) {
      await patchSub(clientId, SUB.menuCategories, categoryId, { name: trimmed, slug: slugify(trimmed), active });
      await activityService.log(actor, clientId, "CATEGORY_RENAMED", trimmed);
    } else {
      const cats = await listSub<MenuCategoryDoc>(clientId, SUB.menuCategories, [], 60);
      await createSub(clientId, SUB.menuCategories, newId("cat"), {
        name: trimmed,
        slug: slugify(trimmed),
        sortOrder: cats.length,
        active,
        createdAt: now(),
      });
      await activityService.log(actor, clientId, "CATEGORY_ADDED", trimmed);
    }
  },

  async deleteCategory(actor: Actor, clientId: string, categoryId: string) {
    const items = await listSub<MenuItemRecord>(clientId, SUB.menuItems, [], 300);
    const batch = writeBatch(db());
    for (const item of items.filter((i) => i.categoryId === categoryId)) {
      batch.update(subDoc(clientId, SUB.menuItems, item.id), { categoryId: null });
    }
    batch.delete(subDoc(clientId, SUB.menuCategories, categoryId));
    await batch.commit();
    await activityService.log(actor, clientId, "CATEGORY_DELETED", categoryId);
  },

  async reorderCategories(actor: Actor, clientId: string, orderedIds: string[]) {
    const batch = writeBatch(db());
    orderedIds.forEach((id, i) => batch.update(subDoc(clientId, SUB.menuCategories, id), { sortOrder: i }));
    await batch.commit();
    await activityService.log(actor, clientId, "CATEGORY_REORDERED", `${orderedIds.length} categories`);
  },
};

export { fromMenuRecord, toMenuRecord };
export type { MenuItemRecord };
