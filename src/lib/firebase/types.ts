/** Firestore document shapes shared across the Grounds platform. */

export type AdminRole = "SUPER_ADMIN" | "CLIENT_ADMIN" | "MANAGER";

export type AdminDoc = {
  id: string;
  uid: string;
  name: string;
  email?: string;
  role: AdminRole;
  status: "ACTIVE" | "INACTIVE";
  /** The admin's ONE primary store (set atomically by Store Setup). */
  clientId?: string | null;
  /** Legacy/compat assignment list (Staff & Customer apps may read it). */
  clientIds?: string[];
  createdAt?: number;
  lastLoginAt?: number;
};

export type AdminAssignmentDoc = { id: string; adminUid: string; clientId: string; createdAt: number };

export type StoreStatus = "DRAFT" | "PUBLISHED" | "ACTIVE" | "SUSPENDED" | "ARCHIVED";

/** "ACTIVE" is the legacy live value; new stores publish as "PUBLISHED". */
export const isLiveStatus = (s: string) => s === "ACTIVE" || s === "PUBLISHED";

export type ClientDoc = {
  id: string;
  slug: string;
  businessName: string;
  displayName: string;
  tagline: string;
  description: string;
  address: string;
  phone: string;
  email?: string;
  category?: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  coverImageUrl: string | null;
  status: StoreStatus;
  publishedAt?: number | null;
  createdAt: number;
  updatedAt: number;
};

export type ClientSettingsDoc = {
  id: string;
  clientId: string;
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
  rewardImageUrl: string | null;
  aiEnabled: boolean;
  aiMonthlyLimit: number;
  aiPrice: number;
  updatedAt: number;
};

export type MenuCategoryDoc = {
  id: string;
  clientId: string;
  name: string;
  slug: string;
  sortOrder: number;
  active: boolean;
  createdAt: number;
};

export type MenuItemDoc = {
  id: string;
  clientId: string;
  categoryId: string | null;
  name: string;
  slug: string;
  price: number;
  shortDescription: string;
  fullDescription: string;
  imageUrl: string | null;
  rating10: number;
  ingredients: string;
  dietary: string;
  allergens: string;
  prepTimeMinutes: number;
  calories: number;
  featured: boolean;
  active: boolean;
  sortOrder: number;
  views: number;
  clicks: number;
  createdAt: number;
  updatedAt: number;
};

export type StaffDoc = {
  id: string;
  uid: string;
  clientId: string;
  clientIds?: string[];
  name: string;
  email: string;
  staffId: string;
  role: "STAFF" | "SHIFT_LEAD" | "MANAGER";
  status: "ACTIVE" | "INACTIVE";
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
};

export type CustomerDoc = {
  id: string;
  clientId: string;
  code: string;
  name: string;
  phone: string;
  email: string;
  totalVisits: number;
  lastVisitAt: number | null;
  createdAt: number;
};

export type LoyaltyDoc = {
  id: string; // == customerId
  clientId: string;
  customerId: string;
  stamps: number;
  lifetimeStamps: number;
  rewardsEarned: number;
  rewardsRedeemed: number;
  updatedAt: number;
};

export type StampTxDoc = {
  id: string;
  clientId: string;
  customerId: string;
  transactionId: string;
  delta: number;
  reason: string;
  actorType: "ADMIN" | "STAFF" | "SYSTEM";
  actorName: string;
  createdAt: number;
};

export type RewardDoc = {
  id: string;
  clientId: string;
  name: string;
  description: string;
  imageUrl: string | null;
  stampTarget: number;
  active: boolean;
  createdAt: number;
};

export type RedemptionDoc = {
  id: string;
  clientId: string;
  customerId: string;
  rewardName: string;
  stampCost: number;
  actorName: string;
  createdAt: number;
};

export type ReviewDoc = {
  id: string;
  clientId: string;
  source: "GOOGLE" | "AI" | "DIRECT";
  rating: number;
  staffRating: number;
  serviceRating: number;
  items: string;
  content: string;
  status: "PUBLISHED" | "PENDING" | "HIDDEN";
  createdAt: number;
};

/**
 * clients/{clientId}/feedback/{feedbackId} — the canonical Customer Feedback
 * schema, written anonymously by the Customer App and read by the Admin App.
 *
 * THE ONLY rating source for the admin console: `rating`.
 * Timestamps are stored as Firestore timestamps (serverTimestamp()); the types
 * below are deliberately permissive because documents created before this
 * schema existed are still readable (serialized timestamps, numeric-string
 * ratings, missing reply fields, legacy `sentiment`).
 */
export type FeedbackStatus = "new" | "reviewed" | "archived";

export type FeedbackDoc = {
  id: string;
  clientId: string;
  message: string | null;
  /** 1–5, or null for text-only feedback. Legacy documents may hold "5". */
  rating: number | string | null;
  source: string;
  /** Canonical lowercase; legacy documents may hold "NEW". */
  status: string;
  adminReply: string | null;
  aiReply: string | null;
  /** Firestore Timestamp | {seconds,nanoseconds} | ISO string | epoch | null. */
  repliedAt: unknown;
  repliedBy: string | null;
  createdAt: unknown;
  updatedAt: unknown;
  /** Legacy pre-rating field kept for backward-compatible reads only. */
  sentiment?: string | null;
};

export type AiUsageDoc = {
  id: string; // `${clientId}_${YYYY-MM}`
  clientId: string;
  month: string;
  requests: number;
  success: number;
  failed: number;
};

export type QrDoc = {
  id: string;
  clientId: string;
  type: "MAIN" | "COUNTER" | "TABLE";
  label: string;
  tableNumber: number | null;
  heading: string;
  subtitle: string;
  active?: boolean;
  createdAt: number;
};

export type ActivityDoc = {
  id: string;
  clientId: string | null;
  actorUid: string;
  actorName: string;
  actorRole: string;
  action: string;
  target: string;
  targetId?: string;
  transactionId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: number;
};

export type MetricDoc = {
  id: string; // `${clientId}_${YYYY-MM-DD}`
  clientId: string;
  day: string;
  qrScans: number;
  menuViews: number;
  googleReviews: number;
  socialClicks: number;
  wifiConnections: number;
  feedback: number;
  stamps: number;
  rewards: number;
};

export type Actor = { uid: string; name: string; role: string };
