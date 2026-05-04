/**
 * Resize an image File client-side before uploading.
 *
 * Why: phone cameras shoot 12-50 MP raw images. Sending those over fetch on
 * Capacitor Android frequently OOMs the WebView (silent crash, app jumps
 * back to dashboard). The Anthropic vision endpoint also rejects payloads
 * over a few MB. Re-encoding through a canvas at ~1600px wide and JPEG
 * quality 0.82 keeps the file under 700KB while still being readable for
 * vendor-quote OCR.
 *
 * Returns a fresh File (with a new name and JPEG mime), and the base64
 * representation in case the caller wants to skip another encode step.
 */

interface ResizeOptions {
  /** Max dimension on the longer side, px. Default 1600. */
  maxDim?: number;
  /** JPEG quality 0..1. Default 0.82. */
  quality?: number;
  /** Output mime — usually "image/jpeg". */
  outputMime?: string;
}

interface ResizedImage {
  file: File;
  /** Base64 string, no data: prefix. */
  base64: string;
  mediaType: string;
  /** Bytes of the resized output. */
  size: number;
  /** Original width / height the camera reported. */
  originalSize: { width: number; height: number };
  /** Final width / height after resize. */
  finalSize: { width: number; height: number };
}

/**
 * Detect HEIC / HEIF — the iPhone default photo format. Browsers and
 * Capacitor's Android WebView can't decode HEIC into a canvas, so the
 * normal resize path silently hangs forever. We need to convert to JPEG
 * with heic2any first.
 *
 * iOS sometimes reports the type as "image/heic", "image/heif", or just
 * empty string with a `.heic` extension on the filename — check both.
 */
function isHeic(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "image/heic" || t === "image/heif") return true;
  const n = (file.name || "").toLowerCase();
  return n.endsWith(".heic") || n.endsWith(".heif");
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const blob = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.9,
  });
  // heic2any returns Blob | Blob[] (multi-image HEICs); take the first.
  const out = Array.isArray(blob) ? blob[0] : blob;
  const base = file.name.replace(/\.(heic|heif)$/i, "") || "photo";
  return new File([out], `${base}.jpg`, { type: "image/jpeg" });
}

/**
 * Resize a File. If the input is already small enough OR not an image,
 * returns it unchanged (with base64 still computed for upload).
 *
 * Throws if the image fails to decode (e.g. truncated download).
 */
export async function resizeImageFile(
  file: File,
  options: ResizeOptions = {},
): Promise<ResizedImage> {
  const { maxDim = 1600, quality = 0.82, outputMime = "image/jpeg" } = options;

  // HEIC: convert to JPEG up-front, then continue with the normal path.
  // The conversion can take 2-4s on a large iPhone photo; that's faster
  // than the alternative (silent hang in the canvas decoder).
  let workingFile = file;
  if (isHeic(file)) {
    try {
      workingFile = await convertHeicToJpeg(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Couldn't convert HEIC photo to JPEG: ${msg}. Try a regular JPEG/PNG instead, or take a fresh photo through the in-app camera (which always saves JPEG).`,
      );
    }
  }

  // Non-image: pass through (e.g. PDF for the quote upload path).
  if (!workingFile.type.startsWith("image/")) {
    const base64 = await fileToBase64(workingFile);
    return {
      file: workingFile,
      base64,
      mediaType: workingFile.type || "application/octet-stream",
      size: workingFile.size,
      originalSize: { width: 0, height: 0 },
      finalSize: { width: 0, height: 0 },
    };
  }

  const img = await loadImageFromFile(workingFile);
  const longSide = Math.max(img.width, img.height);

  // Already small? Skip canvas re-encode (preserve quality, save battery).
  if (longSide <= maxDim) {
    const base64 = await fileToBase64(workingFile);
    return {
      file: workingFile,
      base64,
      mediaType: workingFile.type || "image/jpeg",
      size: workingFile.size,
      originalSize: { width: img.width, height: img.height },
      finalSize: { width: img.width, height: img.height },
    };
  }

  const scale = maxDim / longSide;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, w, h);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Canvas toBlob returned null"));
      },
      outputMime,
      quality,
    );
  });

  const base = workingFile.name.replace(/\.[^.]+$/, "") || "quote";
  const ext = outputMime === "image/png" ? "png" : "jpg";
  const newFile = new File([blob], `${base}.${ext}`, { type: outputMime });
  const base64 = await blobToBase64(blob);

  return {
    file: newFile,
    base64,
    mediaType: outputMime,
    size: blob.size,
    originalSize: { width: img.width, height: img.height },
    finalSize: { width: w, height: h },
  };
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image"));
    };
    img.src = url;
  });
}

function fileToBase64(file: File): Promise<string> {
  return blobToBase64(file);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx === -1 ? result : result.slice(idx + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
