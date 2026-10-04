import type { MenuItemDoc } from "@/lib/firebase/types";

/**
 * Shared menu item schema (clients/{clientId}/menuItems/{itemId}) as read by
 * the Customer App: description, image, rating (0–5), dietaryInfo,
 * preparationTime. The Admin UI keeps its MenuItemDoc view type.
 */
export type MenuItemRecord = {
  id: string;
  clientId: string;
  categoryId: string | null;
  name: string;
  slug: string;
  price: number;
  description?: string;
  fullDescription?: string;
  image?: string | null;
  rating?: number;
  ingredients?: string;
  dietaryInfo?: string;
  allergens?: string;
  preparationTime?: number;
  calories?: number;
  featured?: boolean;
  active?: boolean;
  sortOrder?: number;
  views?: number;
  clicks?: number;
  createdAt: number;
  updatedAt: number;
};

export function fromMenuRecord(r: MenuItemRecord): MenuItemDoc {
  return {
    id: r.id,
    clientId: r.clientId,
    categoryId: r.categoryId ?? null,
    name: r.name,
    slug: r.slug,
    price: r.price ?? 0,
    shortDescription: r.description ?? "",
    fullDescription: r.fullDescription ?? "",
    imageUrl: r.image ?? null,
    rating10: Math.round((r.rating ?? 4.5) * 10),
    ingredients: r.ingredients ?? "",
    dietary: r.dietaryInfo ?? "",
    allergens: r.allergens ?? "",
    prepTimeMinutes: r.preparationTime ?? 10,
    calories: r.calories ?? 0,
    featured: r.featured ?? false,
    active: r.active ?? true,
    sortOrder: r.sortOrder ?? 0,
    views: r.views ?? 0,
    clicks: r.clicks ?? 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function toMenuRecord(d: Omit<MenuItemDoc, "id">): Omit<MenuItemRecord, "id"> {
  return {
    clientId: d.clientId,
    categoryId: d.categoryId,
    name: d.name,
    slug: d.slug,
    price: d.price,
    description: d.shortDescription,
    fullDescription: d.fullDescription,
    image: d.imageUrl,
    rating: Math.round(d.rating10) / 10,
    ingredients: d.ingredients,
    dietaryInfo: d.dietary,
    allergens: d.allergens,
    preparationTime: d.prepTimeMinutes,
    calories: d.calories,
    featured: d.featured,
    active: d.active,
    sortOrder: d.sortOrder,
    views: d.views,
    clicks: d.clicks,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
