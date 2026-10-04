/**
 * services/firebase — the only layer the Admin UI talks to.
 * One shared Firebase project (cafe-review7) across Admin, Customer and
 * Staff apps: Auth for identity, Firestore as the source of truth,
 * Storage for imagery, RTDB for raw analytics events.
 */
export { firebaseConfig, getFirebaseApp, getWorkerApp, SUPER_ADMIN_UID } from "./firebaseClient";
export { authService, adminService } from "./authService";
export { clientService, clientFromRecord, settingsFromRecord } from "./clientService";
export { validateStoreForPublish } from "./clientService";
export type { ClientInput, ClientRecord, DraftMenuItem, StoreFormData } from "./clientService";
export { menuService, fromMenuRecord, toMenuRecord } from "./menuService";
export type { MenuItemRecord } from "./menuMapper";
export { staffService } from "./staffService";
export { customerService } from "./customerService";
export type { CustomerWithLoyalty } from "./customerService";
export { loyaltyService } from "./loyaltyService";
export { rewardService } from "./rewardService";
export { qrService } from "./qrService";
export { reviewService, feedbackService } from "./reviewService";
export { metricsService, aiService } from "./analyticsService";
export { activityService } from "./activityService";
export { storageService, materializeImage, uploadDataUrl } from "./storageService";
export { searchService } from "./searchService";
