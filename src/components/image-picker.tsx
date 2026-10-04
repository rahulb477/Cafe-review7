"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { uploadImage, ImageUploadError, isImageHostingConfigured } from "@/lib/imageUpload";
import { Avatar, Button, cn } from "./ui";

/**
 * Image upload field — uploads to ImgBB at selection time and keeps only the
 * hosted https URL in form state, so saving/publishing never re-uploads and
 * Firestore never sees base64. Firebase Storage is not used.
 */
export function ImagePicker({
  name,
  defaultValue,
  label = "Image",
  round,
  aspect = "aspect-[16/9]",
  onChange,
}: {
  name: string;
  defaultValue?: string | null;
  label?: string;
  round?: boolean;
  aspect?: string;
  /** Lifts the value for controlled forms (Store Setup wizard). */
  onChange?: (value: string) => void;
}) {
  const [value, setValueRaw] = useState(defaultValue ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justUploaded, setJustUploaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setValue = (v: string) => {
    setValueRaw(v);
    onChange?.(v);
  };

  const pickFile = async (file?: File | null) => {
    if (!file) return;
    setError(null);
    setJustUploaded(false);
    setBusy(true);
    try {
      const hostedUrl = await uploadImage(file); // validate → ImgBB → https URL
      setValue(hostedUrl);
      setJustUploaded(true);
    } catch (err) {
      const message = err instanceof ImageUploadError ? err.message : "Image upload failed";
      console.error("[IMAGE_UPLOAD] failed", (err as { code?: string })?.code, message);
      setError(message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = ""; // allow re-selecting the same file
    }
  };

  const isHosted = value.startsWith("http");

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div
          className={cn(
            "relative grid shrink-0 place-items-center overflow-hidden border border-linen bg-linen/60",
            round ? "size-16 rounded-full" : cn("w-32 rounded-xl", aspect),
          )}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="size-full object-cover" />
          ) : round ? (
            <Avatar name="New" size={64} />
          ) : (
            <ImagePlus className="size-5 text-mocha" />
          )}
          {busy ? (
            <span className="absolute inset-0 grid place-items-center bg-bean/40">
              <Loader2 className="size-5 animate-spin text-cream" />
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload className="size-3.5" /> {busy ? "Uploading…" : value ? "Change image" : "Choose image"}
          </Button>
          {value && !busy ? (
            <>
              <Button type="button" variant="quiet" size="sm" onClick={() => window.open(value, "_blank")} title="Preview">
                Preview
              </Button>
              <Button type="button" variant="danger" size="sm" onClick={() => { setValue(""); setJustUploaded(false); }} title="Delete image">
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </>
          ) : null}
          {justUploaded && isHosted ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-stamp">
              <Check className="size-3.5" /> Uploaded
            </span>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => pickFile(e.target.files?.[0])}
      />
      <input type="hidden" name={name} value={value} />
      {error ? (
        <p role="alert" className="mt-1.5 break-words text-[11px] font-semibold text-ember">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-mocha">
          {busy
            ? "Uploading to image host…"
            : isHosted
              ? "Hosted image URL saved with this record. Change or delete any time."
              : isImageHostingConfigured()
                ? "JPEG, PNG or WebP up to 3.5 MB. Uploads to ImgBB; only the URL is stored."
                : "Optional — image hosting key not configured (NEXT_PUBLIC_IMGBB_API_KEY)."}
        </p>
      )}
    </div>
  );
}
