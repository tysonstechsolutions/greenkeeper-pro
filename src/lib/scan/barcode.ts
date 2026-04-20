/**
 * Barcode scanning helpers.
 *
 * Spark-for-Walmart-style live scanner on native:
 *   - Uses @capacitor-mlkit/barcode-scanning's `startScan()` which runs the
 *     BUNDLED ML Kit library (no Play Services dependency, no module
 *     download, works offline).
 *   - The plugin makes the WebView background transparent while scanning;
 *     our own React UI renders ON TOP of the live camera feed. We control
 *     the lifecycle, so there is no full-screen Google Code Scanner
 *     modal that can leave the app on a black screen when it closes.
 *
 * On web: returns null / no-ops, so the caller can fall back to the
 * existing html5-qrcode inline scanner. Keeps `npm run dev` working on
 * a laptop without tethering a phone.
 */
import { Capacitor } from "@capacitor/core";

export function isNativeBarcodeAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

export interface NativeScanSession {
  stop: () => Promise<void>;
}

/**
 * Toggle the global `.barcode-scanner-active` class on the document root.
 * Our CSS hides the normal app chrome and makes the background transparent
 * while this class is applied — that's what lets the native camera feed
 * show through the WebView.
 *
 * Safe to call from SSR (becomes a no-op).
 */
function setScannerActive(active: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("barcode-scanner-active", active);
  document.body.classList.toggle("barcode-scanner-active", active);
}

/**
 * Start a live native barcode scan session (Spark-style). The camera preview
 * shows behind your React UI. The callback fires once for each detected
 * barcode — the caller decides whether to accept it, keep scanning, or stop.
 *
 * Returns a session handle with `.stop()` that restores the WebView
 * background and releases the camera. Always call stop() in your cleanup
 * (component unmount, success path, cancel button, navigation) so the
 * camera light turns off.
 */
export async function startNativeScanSession(opts: {
  onBarcode: (rawValue: string) => void;
  onError?: (err: Error) => void;
}): Promise<NativeScanSession | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const { BarcodeScanner } = await import(
    "@capacitor-mlkit/barcode-scanning"
  );

  // Permission. The plugin prompts if undecided. If the user denies we
  // bail out so the caller can show an error or fall back to manual entry.
  try {
    const { camera } = await BarcodeScanner.checkPermissions();
    if (camera !== "granted") {
      const req = await BarcodeScanner.requestPermissions();
      if (req.camera !== "granted") {
        throw new Error("Camera permission denied");
      }
    }
  } catch (err) {
    opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    return null;
  }

  // Listeners FIRST — otherwise startScan can fire before we subscribe
  // on a fast device.
  const barcodeListener = await BarcodeScanner.addListener(
    "barcodesScanned",
    (event) => {
      const raw = event.barcodes[0]?.rawValue;
      if (typeof raw === "string" && raw.length > 0) {
        opts.onBarcode(raw);
      }
    },
  );
  const errorListener = await BarcodeScanner.addListener(
    "scanError",
    (event) => {
      opts.onError?.(new Error(event.message || "Scanner error"));
    },
  );

  // Transparent WebView → camera shows through.
  setScannerActive(true);

  try {
    await BarcodeScanner.startScan();
  } catch (err) {
    setScannerActive(false);
    await barcodeListener.remove().catch(() => {});
    await errorListener.remove().catch(() => {});
    opts.onError?.(err instanceof Error ? err : new Error(String(err)));
    return null;
  }

  let stopped = false;
  return {
    stop: async () => {
      if (stopped) return;
      stopped = true;
      try {
        await BarcodeScanner.stopScan();
      } catch {
        // best-effort — plugin may already be stopped
      }
      await barcodeListener.remove().catch(() => {});
      await errorListener.remove().catch(() => {});
      setScannerActive(false);
    },
  };
}

/**
 * Convenience wrapper for callers that want a one-shot scan (scan once,
 * stop, return the value). Resolves with the first decoded barcode's raw
 * value, or null if the user cancels / something errors. Uses the same
 * reliable startScan() pipeline under the hood.
 *
 * Callers that want the Spark-style overlay UX should use
 * `startNativeScanSession` directly and render their own overlay.
 */
export async function scanBarcodeNative(): Promise<string | null> {
  if (!isNativeBarcodeAvailable()) return null;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    let session: NativeScanSession | null = null;

    const finish = async (value: string | null) => {
      if (settled) return;
      settled = true;
      if (session) {
        await session.stop().catch(() => {});
      }
      resolve(value);
    };

    startNativeScanSession({
      onBarcode: (raw) => finish(raw),
      onError: () => finish(null),
    })
      .then((s) => {
        if (!s) {
          // Session setup already failed; onError resolved us.
          if (!settled) {
            settled = true;
            resolve(null);
          }
          return;
        }
        session = s;
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      });
  });
}
