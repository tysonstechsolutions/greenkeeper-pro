/**
 * Native camera capture wrapper.
 *
 * Why this and not <input type="file" capture="environment">:
 *   On Capacitor Android the file-input camera path silently OOMs the
 *   WebView for high-resolution photos (the user reports "the app crashes
 *   and goes back to the dashboard"). Routing through the @capacitor/camera
 *   plugin lets us:
 *     • Request CAMERA permission cleanly
 *     • Constrain the image dimensions at capture time (5MP cap)
 *     • Receive a base64-encoded JPEG without the WebView loading the
 *       full bitmap into memory
 *
 * Returns a synthetic File so callers can keep treating it like a
 * file-input upload.
 *
 * Falls back to throwing on web — callers should hide the "Take Photo"
 * button when not on a native platform.
 */

export interface CapturedPhoto {
  file: File;
  base64: string;
  mediaType: string;
}

export async function isNative(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Open the camera, return the captured photo as a File.
 *
 * Throws if the user cancels or the camera permission is denied — callers
 * should catch and treat both as "no photo selected".
 */
export async function capturePhoto(): Promise<CapturedPhoto> {
  const { Camera, CameraResultType, CameraSource } = await import(
    "@capacitor/camera"
  );

  const photo = await Camera.getPhoto({
    quality: 80,
    allowEditing: false,
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
    width: 1600,
    height: 1600,
    correctOrientation: true,
    saveToGallery: false,
  });

  if (!photo.base64String) {
    throw new Error("Camera returned no image data");
  }

  const mediaType = `image/${photo.format || "jpeg"}`;
  const blob = base64ToBlob(photo.base64String, mediaType);
  const filename = `quote-${Date.now()}.${photo.format || "jpg"}`;
  const file = new File([blob], filename, { type: mediaType });

  return { file, base64: photo.base64String, mediaType };
}

function base64ToBlob(b64: string, mime: string): Blob {
  const byteChars = atob(b64);
  const byteArrays: BlobPart[] = [];
  const sliceSize = 0x8000;
  for (let i = 0; i < byteChars.length; i += sliceSize) {
    const slice = byteChars.slice(i, i + sliceSize);
    const arr = new Uint8Array(slice.length);
    for (let j = 0; j < slice.length; j++) arr[j] = slice.charCodeAt(j);
    // Cast away the modern `Uint8Array<ArrayBufferLike>` generic typing —
    // older lib.dom.d.ts versions still expect the plain `Uint8Array` form
    // and BlobPart includes BufferSource which a Uint8Array satisfies at runtime.
    byteArrays.push(arr as unknown as BlobPart);
  }
  return new Blob(byteArrays, { type: mime });
}
