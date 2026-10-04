/**
 * Image hosting service — backed by ImgBB, NOT Firebase Cloud Storage.
 * Firebase Storage is intentionally unused so the project runs without
 * enabling billing. Firestore stores only hosted https URLs.
 *
 * Kept under the historical name so every existing call site
 * (clientService, menuService, barrels) continues to work unchanged.
 */
import { materializeImage, uploadImage, uploadImageDataUrl } from "@/lib/imageUpload";

export { materializeImage, uploadImage, uploadImageDataUrl };

/** Back-compat alias for older imports. */
export const uploadDataUrl = async (_folder: string, dataUrl: string): Promise<string> => uploadImageDataUrl(dataUrl);

/** ImgBB free tier has no delete-by-URL API; replaced images simply stop being referenced. */
export async function deleteByUrl(_url: string): Promise<void> {
  /* no-op by design */
}

export const storageService = { uploadDataUrl, deleteByUrl, materializeImage, uploadImage };
