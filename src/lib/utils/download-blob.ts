/**
 * Reliable blob/file download helper that works in both browser and
 * Capacitor (native Android) WebViews.
 *
 * Why not just use `<a href download>`?
 *   On Android Capacitor 8 the WebView silently ignores anchor-tag
 *   downloads when there's no SAF intent registered, so the user taps
 *   the button and nothing happens. The fallback path here writes the
 *   file to the app's cache directory and hands it to the native Share
 *   sheet (Gmail, Drive, Save to Files, etc.) — which is what the user
 *   wants anyway since these PDFs ultimately get emailed.
 *
 * Browser path is unchanged so dev (npm run dev in a browser) still
 * works without the Capacitor plugins.
 */

interface DownloadOptions {
  /** Blob content */
  blob: Blob;
  /** Filename including extension */
  filename: string;
  /**
   * Subject / dialog title shown by the share sheet on native. Defaults to
   * the filename. Web path ignores this.
   */
  shareTitle?: string;
}

/**
 * Save a blob to the user's device. On native, opens the share sheet.
 * On web, triggers a normal browser download.
 *
 * Resolves only after the OS has accepted the file (or the share dialog
 * closed). Throws on unrecoverable failure.
 */
export async function saveBlobToDevice(opts: DownloadOptions): Promise<void> {
  const { blob, filename, shareTitle } = opts;

  // ── Native (Capacitor) path ────────────────────────────────────────────
  if (await isCapacitorNative()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");

    // Convert blob → base64 (Capacitor Filesystem.writeFile wants base64
    // for binary data when not given a string).
    const base64 = await blobToBase64(blob);

    // Write to cache so we don't pollute Documents permanently. The OS
    // cleans the cache directory; if the user wants a permanent copy
    // they "Save to Files" / "Save to Drive" from the share sheet.
    const writeResult = await Filesystem.writeFile({
      path: filename,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });

    // Hand to native share sheet so the user can pick Gmail / Drive /
    // any installed app.
    try {
      await Share.share({
        title: shareTitle || filename,
        url: writeResult.uri,
        dialogTitle: shareTitle || filename,
      });
    } catch (err) {
      // Some Capacitor builds throw when the user cancels the share
      // sheet. That isn't an error from our perspective — the file is
      // saved to cache. Swallow ABORT-style errors.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/abort|cancel/i.test(msg)) throw err;
    }
    return;
  }

  // ── Browser path ───────────────────────────────────────────────────────
  // Prefer the File System Access API so the user gets a "Save As" dialog
  // and can pick the destination folder each time. Chromium-only (Chrome,
  // Edge, Opera, Brave). Safari / Firefox fall through to the anchor-tag
  // fallback, which uses the browser's default Downloads folder.
  if (supportsSaveFilePicker()) {
    try {
      const ext = filename.includes(".")
        ? filename.slice(filename.lastIndexOf("."))
        : "";
      const mime = blob.type || "application/octet-stream";
      const handle = await window.showSaveFilePicker!({
        suggestedName: filename,
        types: ext
          ? [
              {
                description: shareTitle || filename,
                accept: { [mime]: [ext] },
              },
            ]
          : undefined,
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // User cancelled the picker — that's expected, not a failure.
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError" || name === "NotAllowedError") return;
      // Other failures (sandboxed iframe, permission denied, etc.) — fall
      // through to the anchor-tag fallback so the user still gets the file.
      console.warn("showSaveFilePicker failed, falling back:", err);
    }
  }

  // Legacy fallback: anchor-tag download → browser's default Downloads folder.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so iOS Safari finishes the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Feature-detect the File System Access API. Must be in a secure context
 * (https or localhost) and not inside a sandboxed iframe without
 * `allow-downloads`.
 */
function supportsSaveFilePicker(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.showSaveFilePicker === "function"
  );
}

// ── Types for File System Access API ────────────────────────────────────
// TypeScript's lib.dom.d.ts doesn't include these in all versions, so
// declare the minimal surface we use.
type SaveFilePickerAcceptType = {
  description?: string;
  accept: Record<string, string | string[]>;
};
type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: SaveFilePickerAcceptType[];
};
type SaveFileWritableStream = {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
};
type SaveFileHandle = {
  createWritable: () => Promise<SaveFileWritableStream>;
};
declare global {
  interface Window {
    showSaveFilePicker?: (
      opts?: SaveFilePickerOptions,
    ) => Promise<SaveFileHandle>;
  }
}

/**
 * Detect whether we're running inside a Capacitor native shell.
 * Returns false on web (SSR or browser).
 */
async function isCapacitorNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Read a Blob as a base64 string (no data: prefix).
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,XXX" — strip the prefix.
      const idx = result.indexOf(",");
      resolve(idx === -1 ? result : result.slice(idx + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
