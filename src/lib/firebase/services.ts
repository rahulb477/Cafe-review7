/**
 * Compatibility barrel — the Admin UI imports services from here.
 * Implementations live in src/services/firebase/ (shared platform schema
 * on the cafe-review7 Firebase project).
 */
export {
  activityService,
  adminService,
  aiService,
  authService,
  clientService,
  customerService,
  feedbackService,
  loyaltyService,
  menuService,
  metricsService,
  qrService,
  reviewService,
  rewardService,
  searchService,
  staffService,
  storageService,
} from "@/services/firebase";
export { validateStoreForPublish } from "@/services/firebase";
export type { ClientInput, CustomerWithLoyalty, DraftMenuItem, MenuItemRecord, StoreFormData } from "@/services/firebase";
