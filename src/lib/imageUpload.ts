/**
 * Centralized image hosting — ImgBB API v1.
 *
 * Architecture: Firebase Auth + Firestore hold all application data;
 * images are hosted on ImgBB and ONLY the resulting https URL is stored in
 * Firestore. Firebase Cloud Storage is NOT used anywhere (no billing
 * required). Never store File/Blob/base64 blobs in Firestore.
 */

const IMGBB_ENDPOINT = "https://api.imgbb.com/1/upload";

/** Single env-sourced key — never hardcoded in components. */
function imgbbKey(): string {
  return process.env.NEXT_PUBLIC_IMGBB_API_KEY ?? "";
}

export function isImageHostingConfigured(): boolean {
  return imgbbKey().length > 0;
}

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 3_500_000; // ~3.5 MB

export class ImageUploadError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Validates before any network request. Throws ImageUploadError. */
export function validateImageFile(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new ImageUploadError("invalid-type", "Please select a valid image (JPEG, PNG or WebP).");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageUploadError("too-large", "Image is too large. Please choose a smaller image (max 3.5 MB).");
  }
}

type ImgBBResponse = {
  success?: boolean;
  status_code?: number;
  data?: { url?: string; display_url?: string; delete_url?: string };
  error?: { message?: string; code?: number } | string;
  status_txt?: string;
};

async function postToImgBB(imageBase64: string): Promise<string> {
  const key = imgbbKey();
  if (!key) {
    throw new ImageUploadError(
      "not-configured",
      "Image hosting is not configured. Set NEXT_PUBLIC_IMGBB_API_KEY in the environment (get a free key at api.imgbb.com), or remove the selected image.",
    );
  }
  const body = new FormData();
  body.append("key", key);
  body.append("image", imageBase64);

  const controller = new AbortController();
  const watchdog = setTimeout(() => controller.abort(), 25000);
  let res: Response;
  try {
    res = await fetch(IMGBB_ENDPOINT, { method: "POST", body, signal: controller.signal });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw new ImageUploadError("timeout", "Image upload received no response from ImgBB after 25s. Check your connection and try again.");
    }
    throw new ImageUploadError("network", "Image upload failed: could not reach ImgBB. Check your network connection.");
  } finally {
    clearTimeout(watchdog);
  }

  let json: ImgBBResponse;
  try {
    json = (await res.json()) as ImgBBResponse;
  } catch {
    throw new ImageUploadError("bad-response", `Image upload failed: ImgBB returned an unreadable response (HTTP ${res.status}).`);
  }

  if (!res.ok || json.success === false || !json.data?.url) {
    const detail =
      typeof json.error === "string" ? json.error : (json.error?.message ?? json.status_txt ?? `HTTP ${res.status}`);
    console.error("[IMAGE_UPLOAD] ImgBB rejected upload", { status: res.status, detail });
    throw new ImageUploadError("rejected", `Image upload failed: ${detail}`);
  }
  // Prefer the direct image URL for <img src>.
  return json.data.display_url || json.data.url;
}

/** Uploads a browser File. Returns the hosted https URL. */
export async function uploadImage(file: File): Promise<string> {
  validateImageFile(file);
  const base64 = await fileToBase64(file);
  return postToImgBB(base64);
}

/** Uploads a data: URL (already-read file). Returns the hosted https URL. */
export async function uploadImageDataUrl(dataUrl: string): Promise<string> {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:image/") || comma < 0) {
    throw new ImageUploadError("invalid-type", "Please select a valid image.");
  }
  const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
  if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
    throw new ImageUploadError("invalid-type", "Please select a valid image (JPEG, PNG or WebP).");
  }
  const base64 = dataUrl.slice(comma + 1);
  // base64 is ~4/3 of binary size
  if (base64.length * 0.75 > MAX_IMAGE_BYTES) {
    throw new ImageUploadError("too-large", "Image is too large. Please choose a smaller image (max 3.5 MB).");
  }
  return postToImgBB(base64);
}

/**
 * Normalises an image form value for Firestore:
 *  - already-hosted http(s) URL → passes through UNCHANGED (never re-uploads)
 *  - data: URL → uploaded to ImgBB, hosted URL returned
 *  - empty → null
 */
export async function materializeImage(_folder: string, value: string | null | undefined): Promise<string | null> {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (v.startsWith("data:")) return uploadImageDataUrl(v);
  return v;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new ImageUploadError("read-failed", "Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}
