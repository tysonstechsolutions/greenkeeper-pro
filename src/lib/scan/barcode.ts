/**
 * Barcode scanning helper.
 *
 * On native (Capacitor): uses @capacitor-mlkit/barcode-scanning, which
 * wraps Google's ML Kit barcode scanner module. Full-screen native
 * overlay, hardware-accelerated, dramatically faster + more accurate
 * than html5-qrcode — particularly for 1D codes (Code 128, Code 39)
 * like the MWRMA property tags used on every piece of equipment.
 *
 * On web: returns null immediately, so the caller can fall back to the
 * existing html5-qrcode inline scanner. Keeps `npm run dev` working on
 * a laptop without tethering a phone.
 */
import { Capacitor } from "@capacitor/core";

export function isNativeBarcodeAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Open the native ML Kit barcode scanner once. Resolves with the raw
 * decoded text, or null if the user cancelled, no barcode was read,
 * permission was denied, or we're not on a native platform.
 *
 * The caller should feed the returned value into its existing lookup
 * logic the same way it would have with an html5-qrcode decode.
 */
export async function scanBarcodeNative(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  // Dynamic import so web builds never pull ML Kit into the bundle.
  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");

  // Android ships ML Kit as a Play Services module that the user may
  // need to download on first use. Fire-and-check — it's idempotent.
  try {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
    }
  } catch {
    // iOS, older plugin versions, or module-check not supported —
    // scan() still works, ML Kit handles its own bootstrapping.
  }

  // Verify camera permission. Plugin prompts if undecided.
  try {
    const { camera } = await BarcodeScanner.checkPermissions();
    if (camera !== "granted") {
      const req = await BarcodeScanner.requestPermissions();
      if (req.camera !== "granted") return null;
    }
  } catch {
    // If the permission API isn't available just try scan() anyway.
  }

  try {
    const { barcodes } = await BarcodeScanner.scan();
    const raw = barcodes[0]?.rawValue;
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch (err) {
    // User cancelled the native UI, or ML Kit failed to init.
    const msg = err instanceof Error ? err.message : String(err);
    if (!/cancel/i.test(msg)) {
      console.error("[scanBarcodeNative] scan error:", err);
    }
    return null;
  }
}
