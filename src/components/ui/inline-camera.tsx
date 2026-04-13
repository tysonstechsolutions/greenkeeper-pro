"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, X, RotateCcw, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InlineCameraProps {
  open: boolean;
  onCapture: (file: File) => void;
  onClose: () => void;
}

/**
 * Inline camera component using getUserMedia.
 * Opens the device camera inside the browser — no native intent, no tab kill.
 * Returns a compressed JPEG File via onCapture callback.
 */
export function InlineCamera({ open, onCapture, onClose }: InlineCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  // Start camera stream
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

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
  }, []);

  // Start/stop camera when open changes
  useEffect(() => {
    if (open) {
      startCamera(); // eslint-disable-line react-hooks/set-state-in-effect -- camera lifecycle
    } else {
      stopCamera();
      setPreview(null); // eslint-disable-line react-hooks/set-state-in-effect -- reset on close
      setCapturedBlob(null); // eslint-disable-line react-hooks/set-state-in-effect -- reset on close
      setError(null); // eslint-disable-line react-hooks/set-state-in-effect -- reset on close
    }
    return () => stopCamera();
  }, [open, startCamera, stopCamera]);

  // Capture photo from video stream
  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement("canvas");

    // Limit to 1920px wide for reasonable file size
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
          // Pause video to show captured frame
          video.pause();
        }
      },
      "image/jpeg",
      0.85
    );
  }, []);

  // Retake — resume video
  const handleRetake = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCapturedBlob(null);
    if (videoRef.current && streamRef.current) {
      videoRef.current.play();
    }
  }, [preview]);

  // Confirm — pass file to parent
  const handleConfirm = useCallback(() => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `photo-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    onCapture(file);
    // Cleanup
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCapturedBlob(null);
  }, [capturedBlob, preview, onCapture]);

  // Close — stop everything
  const handleClose = useCallback(() => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setCapturedBlob(null);
    onClose();
  }, [preview, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
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
      <div className="bg-black px-6 py-8 pb-12 safe-area-bottom">
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
