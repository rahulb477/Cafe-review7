import { arrayUnion, deleteField, doc, runTransaction, serverTimestamp, where, writeBatch } from "firebase/firestore";
import {
  COL,
  SUB,
  countSub,
  countWhere,
  create,
  db,
  getById,
  listSub,
  listWhere,
  newId,
  patch,
  subDoc,
  watchDocById,
} from "@/lib/firebase/firestore";
import { materializeImage } from "./storageService";
import { isLiveStatus, type Actor, type ClientDoc, type ClientSettingsDoc, type MenuCategoryDoc, type MenuItemDoc, type StoreStatus } from "@/lib/firebase/types";
import { activityService } from "./activityService";
import { metricsService } from "./analyticsService";
import { fromMenuRecord, type MenuItemRecord } from "./menuMapper";

const now = () => Date.now();
const slugify = (input: string) =>
  input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/* ------------------------------------------------------------------ *
 * Shared platform schema — clients/{clientId} with embedded config:
 * theme, socialLinks, wifi, loyalty, aiReview, googleReviewUrl,
 * logo / favicon / coverImage (Storage download URLs only).
 * The Admin UI keeps its flat ClientDoc/ClientSettingsDoc view types;
 * these mappers translate at the service boundary.
 * ------------------------------------------------------------------ */

export type ClientRecord = {
  id: string;
  slug: string;
  businessName: string;
  displayName: string;
  tagline: string;
  description: string;
  address: string;
  phone: string;
  logo: string | null;
  favicon: string | null;
  coverImage: string | null;
  theme?: { primary?: string; secondary?: string; accent?: string; background?: string; text?: string };
  googleReviewUrl?: string;
  socialLinks?: { instagram?: string; facebook?: string; youtube?: string; website?: string };
  wifi?: { enabled?: boolean; ssid?: string; message?: string };
  loyalty?: { enabled?: boolean; stampTarget?: number; rewardName?: string; rewardDescription?: string; rewardImage?: string | null };
  aiReview?: { enabled?: boolean; monthlyLimit?: number; price?: number };
  email?: string;
  category?: string;
  status: StoreStatus;
  publishedAt?: unknown;
  /** Menu rows captured during Store Setup; written to subcollections on publish. */
  draftMenu?: DraftMenuItem[];
  createdAt: unknown;
  updatedAt: unknown;
};

export type DraftMenuItem = { category: string; name: string; price: number };

/** Firestore serverTimestamp() fields read back as Timestamp objects. */
const toMillis = (v: unknown): number =>
  typeof v === "number"
    ? v
    : typeof (v as { toMillis?: () => number })?.toMillis === "function"
      ? (v as { toMillis: () => number }).toMillis()
      : Date.now();

export function clientFromRecord(r: ClientRecord): ClientDoc {
  return {
    id: r.id,
    slug: r.slug,
    businessName: r.businessName,
    displayName: r.displayName,
    tagline: r.tagline ?? "",
    description: r.description ?? "",
    address: r.address ?? "",
    phone: r.phone ?? "",
    logoUrl: r.logo ?? null,
    faviconUrl: r.favicon ?? null,
    coverImageUrl: r.coverImage ?? null,
    email: r.email ?? "",
    category: r.category ?? "",
    status: r.status,
    publishedAt: r.publishedAt != null ? toMillis(r.publishedAt) : null,
    createdAt: toMillis(r.createdAt),
    updatedAt: toMillis(r.updatedAt),
  };
}

export function settingsFromRecord(r: ClientRecord): ClientSettingsDoc {
  return {
    id: r.id,
    clientId: r.id,
    primaryColor: r.theme?.primary ?? "#3A2116",
    secondaryColor: r.theme?.secondary ?? "#5A3524",
    accentColor: r.theme?.accent ?? "#C0651E",
    backgroundColor: r.theme?.background ?? "#F7EFE3",
    textColor: r.theme?.text ?? "#23130C",
    googleReviewUrl: r.googleReviewUrl ?? "",
    instagram: r.socialLinks?.instagram ?? "",
    facebook: r.socialLinks?.facebook ?? "",
    youtube: r.socialLinks?.youtube ?? "",
    website: r.socialLinks?.website ?? "",
    wifiEnabled: r.wifi?.enabled ?? false,
    wifiSsid: r.wifi?.ssid ?? "",
    wifiMessage: r.wifi?.message ?? "",
    loyaltyEnabled: r.loyalty?.enabled ?? true,
    stampTarget: r.loyalty?.stampTarget ?? 8,
    rewardName: r.loyalty?.rewardName ?? "Free Coffee",
    rewardDescription: r.loyalty?.rewardDescription ?? "",
    rewardImageUrl: r.loyalty?.rewardImage ?? null,
    aiEnabled: r.aiReview?.enabled ?? false,
    aiMonthlyLimit: r.aiReview?.monthlyLimit ?? 100,
    aiPrice: r.aiReview?.price ?? 100,
    updatedAt: toMillis(r.updatedAt),
  };
}

/** flat settings patch (admin UI) → nested Firestore field paths */
const SETTINGS_PATHS: Record<string, string> = {
  primaryColor: "theme.primary",
  secondaryColor: "theme.secondary",
  accentColor: "theme.accent",
  backgroundColor: "theme.background",
  textColor: "theme.text",
  googleReviewUrl: "googleReviewUrl",
  instagram: "socialLinks.instagram",
  facebook: "socialLinks.facebook",
  youtube: "socialLinks.youtube",
  website: "socialLinks.website",
  wifiEnabled: "wifi.enabled",
  wifiSsid: "wifi.ssid",
  wifiMessage: "wifi.message",
  loyaltyEnabled: "loyalty.enabled",
  stampTarget: "loyalty.stampTarget",
  rewardName: "loyalty.rewardName",
  rewardDescription: "loyalty.rewardDescription",
  rewardImageUrl: "loyalty.rewardImage",
  aiEnabled: "aiReview.enabled",
  aiMonthlyLimit: "aiReview.monthlyLimit",
  aiPrice: "aiReview.price",
};

export type ClientInput = {
  businessName: string;
  displayName: string;
  tagline: string;
  description: string;
  address: string;
  phone: string;
  slug?: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  coverImageUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  googleReviewUrl: string;
  instagram: string;
  facebook: string;
  youtube: string;
  website: string;
  wifiEnabled: boolean;
  wifiSsid: string;
  wifiMessage: string;
  loyaltyEnabled: boolean;
  stampTarget: number;
  rewardName: string;
  rewardDescription: string;
  rewardImageUrl?: string | null;
  aiEnabled: boolean;
  aiMonthlyLimit: number;
  aiPrice: number;
};

/** Everything Store Setup captures. Maps onto the shared ClientRecord. */
export type StoreFormData = ClientInput & {
  email: string;
  category: string;
  draftMenu: DraftMenuItem[];
};

const PUBLISH_REQUIREMENTS: [keyof StoreFormData | "theme" | "loyaltyConfig", string, (f: StoreFormData) => boolean][] = [
  ["businessName", "Store name", (f) => f.businessName.trim().length > 0],
  ["slug", "Store slug", (f) => slugify(f.slug?.trim() || f.businessName).length > 0],
  ["category", "Business category", (f) => f.category.trim().length > 0],
  ["address", "Address", (f) => f.address.trim().length > 0],
  ["phone", "Phone", (f) => f.phone.trim().length > 0],
  ["logoUrl", "Logo or branding configuration", (f) => Boolean(f.logoUrl) || Boolean(f.primaryColor)],
  ["theme", "Primary theme colour", (f) => Boolean(f.primaryColor)],
  ["loyaltyConfig", "Loyalty configuration (stamp target + reward name)", (f) => f.stampTarget >= 1 && f.rewardName.trim().length > 0],
];

/** Pre-publish validation. Returns the human-readable list of missing fields. */
export function validateStoreForPublish(form: StoreFormData): string[] {
  return PUBLISH_REQUIREMENTS.filter(([, , ok]) => !ok(form)).map(([, label]) => label);
}

/**
 * Per-operation guard: real rejections propagate IMMEDIATELY with their
 * Firebase code; only a silently-pending promise (blocked transport /
 * offline write buffering) trips the watchdog, and the error then names
 * the exact operation that never responded.
 */
async function opGuard<T>(promise: Promise<T>, operation: string, ms = 20000): Promise<T> {
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        watchdog = setTimeout(
          () =>
            reject(
              new Error(
                `${operation} received no response after ${ms / 1000}s. The request neither succeeded nor failed — this usually means the network is offline or a proxy/firewall is blocking Firebase. (operation: ${operation})`,
              ),
            ),
          ms,
        );
      }),
    ]);
  } catch (err) {
    console.error("[PUBLISH] FAILED", {
      operation,
      errorCode: (err as { code?: string })?.code ?? "none",
      errorMessage: (err as Error)?.message,
      errorName: (err as Error)?.name,
    });
    throw err;
  } finally {
    clearTimeout(watchdog);
  }
}

function formToRecordFields(form: StoreFormData, slug: string) {
  return {
    slug,
    businessName: form.businessName.trim(),
    displayName: form.displayName.trim() || form.businessName.trim(),
    tagline: form.tagline,
    description: form.description,
    address: form.address,
    phone: form.phone,
    email: form.email,
    category: form.category,
    theme: {
      primary: form.primaryColor,
      secondary: form.secondaryColor,
      accent: form.accentColor,
      background: form.backgroundColor,
      text: form.textColor,
    },
    googleReviewUrl: form.googleReviewUrl,
    socialLinks: { instagram: form.instagram, facebook: form.facebook, youtube: form.youtube, website: form.website },
    wifi: { enabled: form.wifiEnabled, ssid: form.wifiSsid, message: form.wifiMessage },
    loyalty: {
      enabled: form.loyaltyEnabled,
      stampTarget: form.stampTarget,
      rewardName: form.rewardName,
      rewardDescription: form.rewardDescription,
    },
    aiReview: { enabled: form.aiEnabled, monthlyLimit: form.aiMonthlyLimit, price: form.aiPrice },
    draftMenu: form.draftMenu,
  };
}

export const clientService = {
  async listAll(): Promise<ClientDoc[]> {
    const rows = await listWhere<ClientRecord>(COL.clients, [], 100);
    return rows.map(clientFromRecord).sort((a, b) => a.businessName.localeCompare(b.businessName));
  },

  async listAllowed(allowedClientIds: string[] | null): Promise<ClientDoc[]> {
    const all = await this.listAll();
    return allowedClientIds === null ? all : all.filter((c) => allowedClientIds.includes(c.id));
  },

  async get(clientId: string): Promise<{ client: ClientDoc; settings: ClientSettingsDoc } | null> {
    const raw = await getById<ClientRecord>(COL.clients, clientId);
    return raw ? { client: clientFromRecord(raw), settings: settingsFromRecord(raw) } : null;
  },

  /** Real-time listener on the client document — admin pages and the
   *  customer app react immediately to branding/loyalty/status changes. */
  watch(
    clientId: string,
    onData: (data: { client: ClientDoc; settings: ClientSettingsDoc } | null) => void,
    onError?: (message: string) => void,
  ) {
    return watchDocById<ClientRecord>(
      COL.clients,
      clientId,
      (raw) => onData(raw ? { client: clientFromRecord(raw), settings: settingsFromRecord(raw) } : null),
      onError,
    );
  },

  async bySlug(slug: string): Promise<ClientDoc | null> {
    const rows = await listWhere<ClientRecord>(COL.clients, [where("slug", "==", slug)], 1);
    return rows[0] ? clientFromRecord(rows[0]) : null;
  },

  /** Public bundle used by the Customer/Staff apps (/{slug}, /staff/{slug}). */
  async publicBundle(slug: string) {
    const rows = await listWhere<ClientRecord>(COL.clients, [where("slug", "==", slug)], 1);
    const raw = rows[0];
    if (!raw) return null;
    const [categories, items] = await Promise.all([
      listSub<MenuCategoryDoc>(raw.id, SUB.menuCategories, [], 60),
      listSub<MenuItemRecord>(raw.id, SUB.menuItems, [], 300),
    ]);
    return {
      client: clientFromRecord(raw),
      settings: settingsFromRecord(raw),
      categories: categories.filter((c) => c.active).sort((a, b) => a.sortOrder - b.sortOrder),
      items: items.map(fromMenuRecord).filter((i) => i.active).sort((a, b) => a.sortOrder - b.sortOrder),
    };
  },

  async stats(clientId: string) {
    const [customers, staff, menu, reviews, redemptions, feedback, aiReviews, metrics] = await Promise.all([
      countWhere(COL.customers, [where("clientId", "==", clientId)]),
      countWhere(COL.staffUsers, [where("clientId", "==", clientId)]),
      countSub(clientId, SUB.menuItems),
      countSub(clientId, SUB.reviews),
      countSub(clientId, SUB.rewardRedemptions),
      countSub(clientId, SUB.feedback),
      countSub(clientId, SUB.reviews, [where("source", "==", "AI")]),
      metricsService.series(clientId, 90),
    ]);
    return {
      customers,
      staff,
      menu,
      googleReviews: reviews,
      aiReviews,
      rewards: redemptions,
      feedback,
      qrScans: metrics.reduce((a, m) => a + (m.qrScans ?? 0), 0),
      stamps: metrics.reduce((a, m) => a + (m.stamps ?? 0), 0),
    };
  },

  /**
   * Upserts a store draft with a STABLE id. Saving twice updates the same
   * document — Publish never mints a new id, so no duplicate stores.
   */
  async saveDraft(actor: Actor, storeId: string | null, form: StoreFormData): Promise<{ storeId: string; slug: string }> {
    console.info("[PUBLISH] START saveDraft", { uid: actor.uid, storeId });
    if (!storeId && actor.role === "MANAGER") {
      // Mirrors the Firestore rule (clients create requires non-MANAGER) so
      // managers get a clear message instead of a raw permission-denied.
      throw new Error("Managers cannot create new stores. Ask a Super Admin or Client Admin to set up the store.");
    }
    const slug = slugify(form.slug?.trim() || form.businessName);
    if (!slug) throw new Error("Store name is required before saving.");
    const clash = await opGuard(
      listWhere<ClientRecord>(COL.clients, [where("slug", "==", slug)], 2),
      "Slug availability check (Firestore read)",
    );
    if (clash.some((c) => c.id !== storeId)) throw new Error(`The address /${slug} is already used by another store.`);

    const id = storeId ?? newId("cli");
    console.info("[PUBLISH] STORE ID", id);

    // Image uploads run BEFORE the Firestore write, each individually guarded
    // so a Storage failure names itself instead of hanging the whole save.
    console.info("[PUBLISH] IMAGE_UPLOAD start (reuses hosted URLs; uploads only data: values)");
    const [logo, favicon, coverImage, rewardImage] = await Promise.all([
      opGuard(materializeImage(`clients/${id}/branding`, form.logoUrl), "Logo upload (ImgBB)"),
      opGuard(materializeImage(`clients/${id}/branding`, form.faviconUrl), "Favicon upload (ImgBB)"),
      opGuard(materializeImage(`clients/${id}/branding`, form.coverImageUrl), "Cover image upload (ImgBB)"),
      opGuard(materializeImage(`clients/${id}/rewards`, form.rewardImageUrl), "Reward image upload (ImgBB)"),
    ]);
    console.info("[PUBLISH] IMAGE_UPLOAD done");

    const base = formToRecordFields(form, slug);
    // Single nested loyalty map — never mixed with dotted field paths
    // ("loyalty" + "loyalty.rewardImage" in one update is a Firestore
    // field-path conflict and rejects every draft update).
    const fields: Record<string, unknown> = {
      ...base,
      logo,
      favicon,
      coverImage,
      loyalty: { ...base.loyalty, rewardImage },
      updatedAt: serverTimestamp(),
    };

    console.info("[PUBLISH] STORE_WRITE begin", { path: `clients/${id}`, update: Boolean(storeId) });
    if (storeId) {
      const existing = await opGuard(getById<ClientRecord>(COL.clients, storeId), "Draft existence check (Firestore read)");
      if (!existing) throw new Error("This draft no longer exists in Firestore.");
      await opGuard(patch(COL.clients, storeId, fields), "Store update (Firestore updateDoc)");
    } else if (actor.role === "SUPER_ADMIN") {
      await opGuard(
        create(COL.clients, id, {
          ...fields,
          id,
          status: "DRAFT" satisfies StoreStatus,
          publishedAt: null,
          createdAt: serverTimestamp(),
        }),
        "Store create (Firestore setDoc)",
      );
    } else {
      // ONE ADMIN = ONE STORE. The store document and the admin's ownership
      // claim are written in a single transaction: if this admin already has a
      // primary store (e.g. a second tab finished first), the transaction
      // aborts and NO duplicate store is created.
      await opGuard(
        runTransaction(db(), async (tx) => {
          const adminRef = doc(db(), COL.admins, actor.uid);
          const adminSnap = await tx.get(adminRef);
          const existingPrimary = (adminSnap.data() as { clientId?: string | null } | undefined)?.clientId ?? null;
          if (existingPrimary) {
            throw new Error(
              `Store Setup is already complete for this account (store ${existingPrimary}). Each admin manages exactly one store.`,
            );
          }
          tx.set(doc(db(), COL.clients, id), {
            ...fields,
            id,
            ownerUid: actor.uid,
            status: "DRAFT" satisfies StoreStatus,
            publishedAt: null,
            createdAt: serverTimestamp(),
          });
          tx.update(adminRef, { clientId: id, clientIds: arrayUnion(id), updatedAt: serverTimestamp() });
        }),
        "Store create + ownership claim (Firestore transaction)",
      );
    }
    console.info("[PUBLISH] STORE_WRITE success", id);
    await activityService
      .log(actor, id, storeId ? "STORE_DRAFT_UPDATED" : "STORE_DRAFT_CREATED", `${form.businessName} (/${slug})`)
      .catch(() => undefined);
    return { storeId: id, slug };
  },

  /** Loads a draft (or any store) back into the Store Setup form shape. */
  async loadDraft(storeId: string): Promise<(StoreFormData & { status: StoreStatus }) | null> {
    const r = await getById<ClientRecord>(COL.clients, storeId);
    if (!r) return null;
    return {
      businessName: r.businessName ?? "",
      displayName: r.displayName ?? "",
      tagline: r.tagline ?? "",
      description: r.description ?? "",
      address: r.address ?? "",
      phone: r.phone ?? "",
      email: r.email ?? "",
      category: r.category ?? "",
      slug: r.slug ?? "",
      logoUrl: r.logo ?? null,
      faviconUrl: r.favicon ?? null,
      coverImageUrl: r.coverImage ?? null,
      primaryColor: r.theme?.primary ?? "#3A2116",
      secondaryColor: r.theme?.secondary ?? "#5A3524",
      accentColor: r.theme?.accent ?? "#C0651E",
      backgroundColor: r.theme?.background ?? "#F7EFE3",
      textColor: r.theme?.text ?? "#23130C",
      googleReviewUrl: r.googleReviewUrl ?? "",
      instagram: r.socialLinks?.instagram ?? "",
      facebook: r.socialLinks?.facebook ?? "",
      youtube: r.socialLinks?.youtube ?? "",
      website: r.socialLinks?.website ?? "",
      wifiEnabled: r.wifi?.enabled ?? false,
      wifiSsid: r.wifi?.ssid ?? "",
      wifiMessage: r.wifi?.message ?? "",
      loyaltyEnabled: r.loyalty?.enabled ?? true,
      stampTarget: r.loyalty?.stampTarget ?? 8,
      rewardName: r.loyalty?.rewardName ?? "Free Coffee",
      rewardDescription: r.loyalty?.rewardDescription ?? "",
      rewardImageUrl: r.loyalty?.rewardImage ?? null,
      aiEnabled: r.aiReview?.enabled ?? false,
      aiMonthlyLimit: r.aiReview?.monthlyLimit ?? 200,
      aiPrice: r.aiReview?.price ?? 100,
      draftMenu: r.draftMenu ?? [],
      status: r.status,
    };
  },

  /**
   * Publishes a saved store. Validates first (throws listing missing fields),
   * then writes menu/reward/QR collateral as ONE batched write, then flips
   * status → PUBLISHED with a server timestamp. Collateral creation is
   * guarded by existence checks so re-publishing never duplicates data.
   */
  async publishStore(
    actor: Actor,
    storeId: string,
    onStage?: (stage: "validating" | "settings" | "publishing") => void,
  ): Promise<{ slug: string }> {
    onStage?.("validating");
    console.info("[PUBLISH] VALIDATION", { storeId });
    const draft = await opGuard(this.loadDraft(storeId), "Draft load (Firestore read)");
    if (!draft) throw new Error(`Store ${storeId} was not found in Firestore.`);
    const missing = validateStoreForPublish(draft);
    if (missing.length) {
      throw new Error(`Complete these fields before publishing: ${missing.join(" · ")}`);
    }
    console.info("[PUBLISH] VALIDATION PASSED");

    onStage?.("settings");
    console.info("[PUBLISH] SETTINGS_WRITE begin");
    const batch = writeBatch(db());
    // menu rows captured in the wizard → real subcollection documents
    const existingItems = await countSub(storeId, SUB.menuItems);
    if (existingItems === 0 && draft.draftMenu.length) {
      const catIds = new Map<string, string>();
      const names = Array.from(new Set(draft.draftMenu.map((m) => m.category.trim() || "Menu")));
      names.forEach((name, i) => {
        const catId = newId("cat");
        catIds.set(name, catId);
        batch.set(subDoc(storeId, SUB.menuCategories, catId), {
          clientId: storeId,
          name,
          slug: slugify(name),
          sortOrder: i,
          active: true,
          createdAt: Date.now(),
        });
      });
      draft.draftMenu.forEach((m, j) => {
        batch.set(subDoc(storeId, SUB.menuItems, newId("itm")), {
          clientId: storeId,
          categoryId: catIds.get(m.category.trim() || "Menu") ?? null,
          name: m.name,
          slug: slugify(m.name),
          price: Number(m.price) || 0,
          description: "",
          fullDescription: "",
          image: null,
          rating: 4.5,
          ingredients: "",
          dietaryInfo: "",
          allergens: "",
          preparationTime: 10,
          calories: 0,
          featured: j === 0,
          active: true,
          sortOrder: j,
          views: 0,
          clicks: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      });
    }
    const existingRewards = await countSub(storeId, SUB.rewards);
    if (existingRewards === 0) {
      batch.set(subDoc(storeId, SUB.rewards, newId("rwd")), {
        clientId: storeId,
        name: draft.rewardName,
        description: draft.rewardDescription,
        imageUrl: draft.rewardImageUrl ?? null,
        stampTarget: draft.stampTarget,
        active: true,
        createdAt: Date.now(),
      });
    }
    const existingQr = await countSub(storeId, SUB.qrConfigurations);
    if (existingQr === 0) {
      batch.set(subDoc(storeId, SUB.qrConfigurations, newId("qrc")), {
        clientId: storeId,
        type: "MAIN",
        label: "Main entrance QR",
        tableNumber: null,
        heading: "Scan to view our menu",
        subtitle: draft.tagline,
        createdAt: Date.now(),
      });
      batch.set(subDoc(storeId, SUB.qrConfigurations, newId("qrc")), {
        clientId: storeId,
        type: "COUNTER",
        label: "Counter QR",
        tableNumber: null,
        heading: "Order at the counter",
        subtitle: "Scan, browse and join our loyalty card",
        createdAt: Date.now(),
      });
    }
    await opGuard(batch.commit(), "Menu/reward/QR collateral write (Firestore batched write)");
    console.info("[PUBLISH] SETTINGS_WRITE success");

    onStage?.("publishing");
    console.info("[PUBLISH] STATUS_UPDATE begin");
    await opGuard(
      patch(COL.clients, storeId, {
        status: "PUBLISHED" satisfies StoreStatus,
        publishedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        draftMenu: deleteField(),
      }),
      "Publish status update (Firestore updateDoc)",
    );
    // Phase-15 verification: never trust the UI — read the document back.
    const verified = await opGuard(getById<ClientRecord>(COL.clients, storeId), "Publish verification (Firestore read-back)");
    if (!verified || verified.status !== "PUBLISHED") {
      throw new Error(
        `Publish verification failed: clients/${storeId} reads back status "${verified?.status ?? "missing"}" instead of "PUBLISHED".`,
      );
    }
    console.info("[PUBLISH] VERIFY success — read-back status=PUBLISHED");
    await activityService
      .log(actor, storeId, "STORE_PUBLISHED", `${draft.businessName} (/${draft.slug})`, {}, {
        after: { status: "PUBLISHED", slug: draft.slug },
      })
      .catch(() => undefined);
    console.info("[PUBLISH] COMPLETE");
    return { slug: slugify(draft.slug || draft.businessName) };
  },

  isLive(status: string) {
    return isLiveStatus(status);
  },

  async create(
    actor: Actor,
    input: ClientInput & { category?: string; email?: string },
  ): Promise<{ clientId: string; slug: string }> {
    const slug = slugify(input.slug?.trim() || input.businessName);
    if (!slug) throw new Error("Business name is required.");
    if (await this.bySlug(slug)) throw new Error(`The address /${slug} is already in use.`);
    const clientId = newId("cli");
    const [logo, favicon, coverImage, rewardImage] = await Promise.all([
      materializeImage(`clients/${clientId}/branding`, input.logoUrl),
      materializeImage(`clients/${clientId}/branding`, input.faviconUrl),
      materializeImage(`clients/${clientId}/branding`, input.coverImageUrl),
      materializeImage(`clients/${clientId}/rewards`, input.rewardImageUrl),
    ]);
    const record: Omit<ClientRecord, "id"> = {
      slug,
      businessName: input.businessName,
      displayName: input.displayName || input.businessName,
      tagline: input.tagline,
      description: input.description,
      address: input.address,
      phone: input.phone,
      email: input.email ?? "",
      category: input.category ?? "",
      logo,
      favicon,
      coverImage,
      theme: {
        primary: input.primaryColor,
        secondary: input.secondaryColor,
        accent: input.accentColor,
        background: input.backgroundColor,
        text: input.textColor,
      },
      googleReviewUrl: input.googleReviewUrl,
      socialLinks: {
        instagram: input.instagram,
        facebook: input.facebook,
        youtube: input.youtube,
        website: input.website,
      },
      wifi: { enabled: input.wifiEnabled, ssid: input.wifiSsid, message: input.wifiMessage },
      loyalty: {
        enabled: input.loyaltyEnabled,
        stampTarget: input.stampTarget,
        rewardName: input.rewardName,
        rewardDescription: input.rewardDescription,
        rewardImage: rewardImage,
      },
      aiReview: { enabled: input.aiEnabled, monthlyLimit: input.aiMonthlyLimit, price: input.aiPrice },
      status: "PUBLISHED",
      publishedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    };
    const batch = writeBatch(db());
    batch.set(doc(db(), COL.clients, clientId), { ...record, id: clientId });
    batch.set(subDoc(clientId, SUB.rewards, newId("rwd")), {
      clientId,
      name: input.rewardName,
      description: input.rewardDescription,
      imageUrl: rewardImage,
      stampTarget: input.stampTarget,
      active: true,
      createdAt: now(),
    });
    batch.set(subDoc(clientId, SUB.qrConfigurations, newId("qrc")), {
      clientId,
      type: "MAIN",
      label: "Main entrance QR",
      tableNumber: null,
      heading: "Scan to view our menu",
      subtitle: input.tagline,
      createdAt: now(),
    });
    batch.set(subDoc(clientId, SUB.qrConfigurations, newId("qrc")), {
      clientId,
      type: "COUNTER",
      label: "Counter QR",
      tableNumber: null,
      heading: "Order at the counter",
      subtitle: "Scan, browse and join our loyalty card",
      createdAt: now(),
    });
    if (actor.role === "CLIENT_ADMIN" || actor.role === "MANAGER") {
      batch.update(doc(db(), COL.admins, actor.uid), { clientIds: arrayUnion(clientId) });
    }
    await batch.commit();
    await activityService.log(actor, clientId, "CLIENT_CREATED", `${input.businessName} (/${slug})`, {}, { after: { slug, businessName: input.businessName } });
    return { clientId, slug };
  },

  async update(actor: Actor, clientId: string, input: Partial<ClientInput>) {
    const beforeRaw = await getById<ClientRecord>(COL.clients, clientId);
    const data: Record<string, unknown> = { updatedAt: now() };
    const fields = ["businessName", "displayName", "tagline", "description", "address", "phone"] as const;
    for (const f of fields) if (input[f] !== undefined) data[f] = input[f];
    if (input.logoUrl !== undefined) data.logo = await materializeImage(`clients/${clientId}/branding`, input.logoUrl);
    if (input.faviconUrl !== undefined) data.favicon = await materializeImage(`clients/${clientId}/branding`, input.faviconUrl);
    if (input.coverImageUrl !== undefined)
      data.coverImage = await materializeImage(`clients/${clientId}/branding`, input.coverImageUrl);
    await patch(COL.clients, clientId, data);
    await activityService.log(actor, clientId, "CLIENT_UPDATED", String(input.businessName ?? clientId), {}, {
      before: beforeRaw ? { businessName: beforeRaw.businessName, logo: beforeRaw.logo } : null,
      after: data,
    });
  },

  async updateSettings(actor: Actor, clientId: string, input: Partial<ClientSettingsDoc>, action = "CLIENT_UPDATED") {
    const beforeRaw = await getById<ClientRecord>(COL.clients, clientId);
    if (!beforeRaw) throw new Error("Business not found in Firestore.");
    const data: Record<string, unknown> = { updatedAt: now() };
    for (const [flat, path] of Object.entries(SETTINGS_PATHS)) {
      const value = (input as Record<string, unknown>)[flat];
      if (value === undefined) continue;
      data[path] =
        flat === "rewardImageUrl" && typeof value === "string" && value.startsWith("data:")
          ? await materializeImage(`clients/${clientId}/rewards`, value)
          : value;
    }
    await patch(COL.clients, clientId, data);
    const beforeView = settingsFromRecord(beforeRaw);
    const before: Record<string, unknown> = {};
    for (const key of Object.keys(input)) before[key] = (beforeView as Record<string, unknown>)[key];
    await activityService.log(actor, clientId, action, action.toLowerCase().replace(/_/g, " "), {}, { before, after: { ...input } });
  },

  async setStatus(actor: Actor, clientId: string, status: ClientDoc["status"]) {
    if (actor.role !== "SUPER_ADMIN") throw new Error("Only a super admin can change business status.");
    const beforeRaw = await getById<ClientRecord>(COL.clients, clientId);
    await patch(COL.clients, clientId, { status, updatedAt: now() });
    await activityService.log(actor, clientId, "CLIENT_STATUS_CHANGED", status, {}, {
      before: { status: beforeRaw?.status },
      after: { status },
    });
  },

  /** Copies brand/menu/loyalty structure. Never customers, staff, transactions, reviews, feedback or logs. */
  async duplicate(actor: Actor, clientId: string, newName: string) {
    if (actor.role !== "SUPER_ADMIN") throw new Error("Only a Super Admin can duplicate a store — each admin manages exactly one store.");
    const source = await this.get(clientId);
    if (!source) throw new Error("Business not found.");
    const s = source.settings;
    const name = newName.trim() || `${source.client.businessName} (copy)`;
    const created = await this.create(actor, {
      businessName: name,
      displayName: source.client.displayName,
      tagline: source.client.tagline,
      description: source.client.description,
      address: source.client.address,
      phone: source.client.phone,
      slug: slugify(name),
      logoUrl: source.client.logoUrl,
      coverImageUrl: source.client.coverImageUrl,
      primaryColor: s.primaryColor,
      secondaryColor: s.secondaryColor,
      accentColor: s.accentColor,
      backgroundColor: s.backgroundColor,
      textColor: s.textColor,
      googleReviewUrl: s.googleReviewUrl,
      instagram: s.instagram,
      facebook: s.facebook,
      youtube: s.youtube,
      website: s.website,
      wifiEnabled: false,
      wifiSsid: s.wifiSsid,
      wifiMessage: s.wifiMessage,
      loyaltyEnabled: s.loyaltyEnabled,
      stampTarget: s.stampTarget,
      rewardName: s.rewardName,
      rewardDescription: s.rewardDescription,
      rewardImageUrl: s.rewardImageUrl,
      aiEnabled: false,
      aiMonthlyLimit: s.aiMonthlyLimit,
      aiPrice: s.aiPrice,
    });
    const [cats, items] = await Promise.all([
      listSub<MenuCategoryDoc>(clientId, SUB.menuCategories, [], 60),
      listSub<MenuItemRecord>(clientId, SUB.menuItems, [], 300),
    ]);
    const batch = writeBatch(db());
    const catMap = new Map<string, string>();
    for (const cat of cats) {
      const id = newId("cat");
      catMap.set(cat.id, id);
      batch.set(subDoc(created.clientId, SUB.menuCategories, id), {
        clientId: created.clientId,
        name: cat.name,
        slug: cat.slug,
        sortOrder: cat.sortOrder,
        active: cat.active,
        createdAt: now(),
      });
    }
    for (const item of items) {
      const { id: _old, ...rest } = item;
      batch.set(subDoc(created.clientId, SUB.menuItems, newId("itm")), {
        ...rest,
        clientId: created.clientId,
        categoryId: item.categoryId ? (catMap.get(item.categoryId) ?? null) : null,
        views: 0,
        clicks: 0,
        createdAt: now(),
        updatedAt: now(),
      });
    }
    await batch.commit();
    await activityService.log(actor, created.clientId, "CLIENT_DUPLICATED", `copied from /${source.client.slug}`);
    return created;
  },
};

/** Minimal mapping needed when a page only has MenuItemDoc. */
export type { MenuItemDoc };
