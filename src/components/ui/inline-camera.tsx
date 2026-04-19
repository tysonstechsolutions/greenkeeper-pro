"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X, RotateCcw, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

interface InlineCameraProps {
  open: boolean;
  onCapture: (file: File) => void;
  onClose: () => void;
}

/**
 * Photo capture component.
 *
 * On native (Capacitor Android/iOS): delegates to `@capacitor/camera`, which
 * launches the OS camera full-screen. No in-webview video stream — ML Kit /
 * hardware camera2 pipeline, much better low-light + autofocus than
 * `getUserMedia`.
 *
 * On web: falls back to `getUserMedia` + <video> preview + canvas capture,
 * so `npm run dev` in a browser still works.
 *
 * Interface is identical in both modes: `open` opens, `onCapture(file)`
 * returns a JPEG File, `onClose()` dismisses.
 */
export function InlineCamera({ open, onCapture, onClose }: InlineCameraProps) {
  const isNative = Capacitor.isNativePlatform();

  // ── Native path ────────────────────────────────────────────────────────────
  // When `open` flips to true on native, launch the Capacitor camera and pipe
  // the result back through onCapture. There's no in-component UI to render.
  const nativeInFlightRef = useRef(false);

  useEffect(() => {
    if (!isNative || !open || nativeInFlightRef.current) return;
    nativeInFlightRef.current = true;

    (async () => {
      try {
        const photo = await Camera.getPhoto({
          quality: 85,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
          saveToGallery: false,
          correctOrientation: true,
          width: 1920,
        });

        const webPath = photo.webPath;
        if (!webPath) {
          onClose();
          return;
        }

        // Convert the file:// (or blob:) URI into a File for the caller.
        const res = await fetch(webPath);
        const blob = await res.blob();
        const file = new File([blob], `photo-${Date.now()}.jpg`, {
          type: blob.type || "image/jpeg",
        });
        onCapture(file);
      } catch (err) {
        // User cancelled, or permission denied — close gracefully.
        // (Capacitor throws "User cancelled photos app" or similar.)
        const msg = err instanceof Error ? err.message : String(err);
        if (!/cancel/i.test(msg)) {
          console.error("Native camera error:", err);
        }
        onClose();
      } finally {
        nativeInFlightRef.current = false;
      }
    })();
  }, [isNative, open, onCapture, onClose]);

  // ── Web path (existing getUserMedia flow) ──────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const startCamera = useCallback(async () => {
    setError(null);
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch (err) {
      console.error("Camera access error:", err);
      if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
          setError("Camera permission denied. Please allow camera access in your browser settings, or use the gallery option.");
        } else if (err.name === "NotFoundError") {
          setError("No camera found on this device. Use the gallery option instead.");
        } else {
          setError("Could not access camera. Use the gallery option instead.");
        }
      } else {
        setError("Could not access camera. Use the gallery option instead.");
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  useEffect(() => {
    if (isNative) return; // native path handles itself
    if (open) {
      startCamera(); // eslint-disable-line react-hooks/set-state-in-effect -- camera lifecycle
    } else {
      stopCamera();
      setPreview(null); // eslint-disable-line react-hooks/set-state-in-effect -- reset on close
      setCapturedBlob(null); // eslint-disable-line react-hooks/set-state-in-effect -- reset on close
      setError(null); // eslint-disable-line react-hooks/set-state-in-effect -- reset on close
    }
    return () => stopCamera();
  }, [isNative, open, startCamera, stopCamera]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w > 1920) {
      h = Math.round((h * 1920) / w);
      w = 1920;
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob);
          setPreview(URL.createObjectURL(blob));
          video.pause();
        }
      },
      "image/jpeg",
      0.85
    );
  }, []);

  const handleRetake = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCapturedBlob(null);
    if (videoRef.current && streamRef.current) {
      videoRef.current.play();
    }
  }, [preview]);

  const handleConfirm = useCallback(() => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `photo-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    onCapture(file);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCapturedBlob(null);
  }, [capturedBlob, preview, onCapture]);

  const handleClose = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCapturedBlob(null);
    onClose();
  }, [preview, onClose]);

  // On native, the component renders nothing — the OS camera takes over.
  if (!open || isNative) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[60] bg-black flex flex-col overflow-hidden"
      style={{ height: "100svh", maxHeight: "100svh" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 shrink-0">
        <button onClick={handleClose} className="text-white p-2">
          <X className="w-6 h-6" />
        </button>
        <span className="text-white text-sm font-medium">Take Photo</span>
        <div className="w-10" /> {/* Spacer */}
      </div>

      {/* Camera / Preview / Error */}
      <div className="flex-1 relative overflow-hidden bg-black">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
            <p className="text-white text-sm mb-6">{error}</p>
            <Button variant="outline" onClick={handleClose} className="text-white border-white/30">
              Close
            </Button>
          </div>
        ) : preview ? (
          <img
            src={preview}
            alt="Captured"
            className="w-full h-full object-contain"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <div className="text-white text-sm animate-pulse">Starting camera...</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black px-6 pt-4 pb-6 shrink-0" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
        {preview ? (
          <div className="flex items-center justify-center gap-12">
            <button
              onClick={handleRetake}
              className="flex flex-col items-center gap-2 text-white active:scale-95 transition-transform"
            >
              <div className="w-16 h-16 rounded-full border-2 border-white/50 flex items-center justify-center">
                <RotateCcw className="w-7 h-7" />
              </div>
              <span className="text-sm font-medium">Retake</span>
            </button>
            <button
              onClick={handleConfirm}
              className="flex flex-col items-center gap-2 text-white active:scale-95 transition-transform"
            >
              <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="w-8 h-8" />
              </div>
              <span className="text-sm font-medium">Use Photo</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={handleCapture}
              disabled={!cameraReady}
              className="rounded-full border-4 border-white flex items-center justify-center disabled:opacity-30 active:scale-95 transition-transform"
              style={{ width: 80, height: 80 }}
            >
              <div
                className="rounded-full bg-white"
                style={{ width: 66, height: 66 }}
              />
            </button>
            <span className="text-white/70 text-sm">Tap to capture</span>
          </div>
        )}
      </div>
    </div>
  );
}

