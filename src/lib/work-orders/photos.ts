/**
 * Work-order enclosure photos.
 *
 * The bug this exists to fix: photos only ever lived in the new-work-order
 * form's React state. The PDF generated at creation time carried the enclosure
 * pages, but the INSERT never wrote `work_orders.photos`, so every later
 * download rebuilt the form with the enclosure COUNT filled in and nothing
 * behind it — "enclosures attached" with no enclosures.
 *
 * Photos are now uploaded to the public `photos` bucket and the row stores the
 * storage paths. Reads accept three shapes so nothing breaks on rows written
 * by hand or by an older build:
 *   • bare storage path  — "uid/2026/08/uuid.jpg"  (what we write)
 *   • absolute URL       — "https://…/object/public/photos/…"
 *   • inline data: URL   — kept verbatim
 *
 * pdf-lib can only embed JPEG and PNG, so anything else (webp, gif, bmp) is
 * re-encoded to JPEG before upload. Without that, an odd-format photo uploads
 * fine, counts as an enclosure, and then silently fails to render a page.
 */

import {
  directCreateSignedUrl,
  directStorageDelete,
  directStorageUpload,
  publicStorageUrl,
} from "@/lib/supabase/rest";
import { resizeImageFile } from "@/lib/utils/image-resize";

const BUCKET = "photos";

/** Formats pdf-lib can embed directly. Everything else gets re-encoded. */
const PDF_EMBEDDABLE = /^image\/(jpeg|png)$/i;

/** A photo held in the UI before/after it has a home in storage. */
export interface WorkOrderPhoto {
  /** Storage path once uploaded; empty while the photo is still local-only. */
  path: string;
  /** data: URL for the thumbnail and for embedding into the PDF. */
  dataUrl: string;
  /** Present only for a photo that hasn't been uploaded yet. */
  file?: File;
}

// ── Preparing a picked/captured file ──────────────────────────────────────────

/**
 * Shrink a picked photo and guarantee it is a format the PDF can embed.
 * Returns the upload-ready file plus a data: URL for preview.
 */
export async function prepareWorkOrderPhoto(
  file: File,
): Promise<{ file: File; dataUrl: string }> {
  const resized = await resizeImageFile(file, { maxDim: 1600, quality: 0.82 });

  if (PDF_EMBEDDABLE.test(resized.mediaType)) {
    return {
      file: resized.file,
      dataUrl: `data:${resized.mediaType};base64,${resized.base64}`,
    };
  }

  // resizeImageFile passes small images through untouched, so a small webp/gif
  // arrives here with its original mime. Re-encode it to JPEG.
  const jpeg = await reencodeToJpeg(resized.file);
  return { file: jpeg, dataUrl: await blobToDataUrl(jpeg) };
}

async function reencodeToJpeg(file: File): Promise<File> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      URL.revokeObjectURL(url);
      resolve(el);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image"));
    };
    el.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob returned null"))),
      "image/jpeg",
      0.9,
    );
  });

  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

// ── Upload ────────────────────────────────────────────────────────────────────

function storagePathFor(userId: string | null | undefined, file: File): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const ext = file.type === "image/png" ? "png" : "jpg";
  // Same {owner}/{year}/{month}/ convention the rest of the photos bucket uses;
  // work orders created without a resolvable profile land in a shared folder.
  const owner = userId || "work-orders";
  return `${owner}/${year}/${month}/${crypto.randomUUID()}.${ext}`;
}

/** Upload one prepared photo. Returns the storage path to persist on the row. */
export async function uploadWorkOrderPhoto(
  file: File,
  userId?: string | null,
): Promise<string> {
  const path = storagePathFor(userId, file);
  await directStorageUpload(BUCKET, path, file, "work-orders.uploadPhoto");
  return path;
}

/** Upload several prepared photos, preserving order. Throws on the first failure. */
export async function uploadWorkOrderPhotos(
  files: File[],
  userId?: string | null,
): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    paths.push(await uploadWorkOrderPhoto(file, userId));
  }
  return paths;
}

/** Best-effort removal of an enclosure's stored object. */
export async function deleteWorkOrderPhoto(ref: string): Promise<void> {
  const path = toStoragePath(ref);
  if (!path) return;
  try {
    await directStorageDelete(BUCKET, [path], "work-orders.deletePhoto");
  } catch (err) {
    console.warn(
      "[work-orders] couldn't delete photo object:",
      err instanceof Error ? err.message : err,
    );
  }
}

// ── Read back ─────────────────────────────────────────────────────────────────

/** Normalise a stored reference to a bucket-relative path, or null if it isn't one. */
function toStoragePath(ref: string): string | null {
  if (!ref || ref.startsWith("data:")) return null;
  const marker = `/${BUCKET}/`;
  if (/^https?:\/\//i.test(ref)) {
    const idx = ref.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(ref.slice(idx + marker.length).split("?")[0]);
  }
  return ref.replace(/^\/+/, "");
}

/** A browsable URL for a stored reference — used for on-screen thumbnails. */
export function workOrderPhotoUrl(ref: string): string {
  if (!ref) return "";
  if (ref.startsWith("data:") || /^https?:\/\//i.test(ref)) return ref;
  return publicStorageUrl(BUCKET, ref.replace(/^\/+/, ""));
}

/**
 * Turn stored references into data: URLs the PDF generator can embed.
 * A photo that can't be fetched is dropped rather than failing the download —
 * the generator then reports the enclosure count it actually embedded.
 */
export async function resolveWorkOrderPhotoDataUrls(
  refs: string[] | null | undefined,
): Promise<string[]> {
  if (!refs || refs.length === 0) return [];
  const out: string[] = [];
  for (const ref of refs) {
    const dataUrl = await resolveOne(ref);
    if (dataUrl) out.push(dataUrl);
  }
  return out;
}

async function resolveOne(ref: string): Promise<string | null> {
  if (!ref) return null;
  if (ref.startsWith("data:")) return ref;

  const direct = await fetchAsDataUrl(workOrderPhotoUrl(ref));
  if (direct) return direct;

  // Public read failed (bucket flipped private, object moved behind RLS…) —
  // fall back to a short-lived signed URL before giving up.
  const path = toStoragePath(ref);
  if (!path) return null;
  try {
    const signed = await directCreateSignedUrl(
      BUCKET,
      path,
      120,
      "work-orders.photoSignedUrl",
    );
    return await fetchAsDataUrl(signed);
  } catch {
    return null;
  }
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await blobToDataUrl(await res.blob());
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
