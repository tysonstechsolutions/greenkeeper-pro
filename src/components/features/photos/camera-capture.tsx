"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Camera,
  X,
  RotateCcw,
  Check,
  Loader2,
  MapPin,
  Tag,
  FileText,
  ImagePlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { usePhotos, photoTypeLabels } from "@/lib/hooks/usePhotos";
import { useCourseZones, formatZoneName } from "@/lib/hooks/useCourseZones";
import { addTimestampOverlay } from "@/lib/supabase/storage";
import type { PhotoType, Photo } from "@/types/database";

interface CameraCaptureProps {
  /** Called when photo is successfully saved */
  onPhotoSaved?: (photo: Photo) => void;
  /** Called when user cancels */
  onCancel?: () => void;
  /** Pre-fill task ID */
  taskId?: string;
  /** Pre-fill zone ID */
  zoneId?: string;
  /** Pre-fill photo type */
  defaultPhotoType?: PhotoType;
  /** User ID for upload */
  userId: string;
  /** Whether to show the component inline or as a modal-like overlay */
  inline?: boolean;
  /** Add timestamp overlay to photos */
  addTimestamp?: boolean;
  /** Custom class name */
  className?: string;
}

type CaptureMode = "idle" | "preview" | "saving";

export function CameraCapture({
  onPhotoSaved,
  onCancel,
  taskId,
  zoneId: initialZoneId,
  defaultPhotoType = "other",
  userId,
  inline = false,
  addTimestamp = true,
  className,
}: CameraCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<CaptureMode>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [photoType, setPhotoType] = useState<PhotoType>(defaultPhotoType);
  const [caption, setCaption] = useState("");
  const [zoneId, setZoneId] = useState<string>(initialZoneId || "");
  const [tagsInput, setTagsInput] = useState("");

  // Hooks
  const { uploadAndCreatePhoto } = usePhotos();
  const { zones, loading: zonesLoading } = useCourseZones();

  // Detect if on mobile
  const [isMobile] = useState(() =>
    typeof navigator !== "undefined"
      ? /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      : false
  );

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  /**
   * Handle file selection (from input or camera)
   */
  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setError(null);

      // Validate file type
      if (!file.type.startsWith("image/")) {
        setError("Please select an image file");
        return;
      }

      // Validate file size (max 20MB)
      if (file.size > 20 * 1024 * 1024) {
        setError("Image must be less than 20MB");
        return;
      }

      // Create preview
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setCapturedFile(file);
      setMode("preview");
    },
    []
  );

  /**
   * Open camera/file picker
   */
  const openCapture = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Reset to idle state
   */
  const handleRetake = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setCapturedFile(null);
    setMode("idle");
    setError(null);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [previewUrl]);

  /**
   * Cancel and close
   */
  const handleCancel = useCallback(() => {
    handleRetake();
    setCaption("");
    setTagsInput("");
    setPhotoType(defaultPhotoType);
    setZoneId(initialZoneId || "");
    onCancel?.();
  }, [handleRetake, defaultPhotoType, initialZoneId, onCancel]);

  /**
   * Save the photo
   */
  const handleSave = useCallback(async () => {
    if (!capturedFile) return;

    setMode("saving");
    setError(null);

    try {
      // Optionally add timestamp overlay
      let fileToUpload: File | Blob = capturedFile;
      if (addTimestamp) {
        try {
          fileToUpload = await addTimestampOverlay(capturedFile);
        } catch {
          // If timestamp fails, continue with original
          console.warn("Failed to add timestamp overlay");
        }
      }

      // Parse tags from comma-separated input
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0);

      // Upload and create record
      const photo = await uploadAndCreatePhoto(
        fileToUpload,
        {
          taskId: taskId || undefined,
          zoneId: zoneId || undefined,
          photoType,
          caption: caption.trim() || undefined,
          tags: tags.length > 0 ? tags : undefined,
        },
        userId
      );

      // Success - reset and notify
      handleRetake();
      setCaption("");
      setTagsInput("");
      setPhotoType(defaultPhotoType);
      onPhotoSaved?.(photo);
    } catch (err) {
      console.error("Error saving photo:", err);
      setError(err instanceof Error ? err.message : "Failed to save photo");
      setMode("preview");
    }
  }, [
    capturedFile,
    addTimestamp,
    tagsInput,
    uploadAndCreatePhoto,
    taskId,
    zoneId,
    photoType,
    caption,
    userId,
    handleRetake,
    defaultPhotoType,
    onPhotoSaved,
  ]);

  // Photo type options
  const photoTypeOptions = Object.entries(photoTypeLabels) as [PhotoType, string][];

  return (
    <div
      className={cn(
        "bg-card border border-border rounded-lg overflow-hidden",
        !inline && "fixed inset-0 z-50 md:inset-auto md:fixed md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-lg md:rounded-lg md:shadow-xl",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold flex items-center gap-2">
          <Camera className="w-5 h-5" />
          {mode === "idle" ? "Capture Photo" : mode === "preview" ? "Review Photo" : "Saving..."}
        </h3>
        <Button variant="ghost" size="icon" onClick={handleCancel}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture={isMobile ? "environment" : undefined}
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Idle state - capture button */}
        {mode === "idle" && (
          <div className="flex flex-col items-center py-8">
            <button
              onClick={openCapture}
              className="w-32 h-32 rounded-full bg-primary/10 hover:bg-primary/20 border-2 border-dashed border-primary/50 hover:border-primary flex flex-col items-center justify-center gap-2 transition-colors"
            >
              <ImagePlus className="w-10 h-10 text-primary" />
              <span className="text-sm text-primary font-medium">
                {isMobile ? "Take Photo" : "Select Photo"}
              </span>
            </button>
            <p className="mt-4 text-sm text-muted-foreground text-center">
              {isMobile
                ? "Tap to open camera or select from gallery"
                : "Click to select an image from your computer"}
            </p>
          </div>
        )}

        {/* Preview state */}
        {mode === "preview" && previewUrl && (
          <div className="space-y-4">
            {/* Image preview */}
            <div className="relative aspect-[4/3] bg-muted rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Photo preview"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Photo type selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Photo Type
              </Label>
              <Select value={photoType} onValueChange={(v) => setPhotoType(v as PhotoType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {photoTypeOptions.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Zone selector */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Course Zone (Optional)
              </Label>
              <Select
                value={zoneId}
                onValueChange={setZoneId}
                disabled={zonesLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a zone..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No zone</SelectItem>
                  {zones.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      {formatZoneName(zone)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Caption */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Caption (Optional)
              </Label>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a description..."
                rows={2}
              />
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label>Tags (Optional)</Label>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Enter tags, separated by commas"
              />
              <p className="text-xs text-muted-foreground">
                e.g., hole-7, disease, drought-stress
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={handleRetake} className="flex-1">
                <RotateCcw className="w-4 h-4 mr-2" />
                Retake
              </Button>
              <Button onClick={handleSave} className="flex-1">
                <Check className="w-4 h-4 mr-2" />
                Save Photo
              </Button>
            </div>
          </div>
        )}

        {/* Saving state */}
        {mode === "saving" && (
          <div className="flex flex-col items-center py-12">
            <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Uploading photo...</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Floating action button trigger for camera capture
 */
interface CameraFABProps {
  onClick: () => void;
  className?: string;
}

export function CameraFAB({ onClick, className }: CameraFABProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-[100px] md:bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 flex items-center justify-center transition-transform hover:scale-105 active:scale-95",
        className
      )}
      aria-label="Take photo"
    >
      <Camera className="w-6 h-6" />
    </button>
  );
}

/**
 * Modal wrapper for CameraCapture
 */
interface CameraCaptureModalProps extends Omit<CameraCaptureProps, "inline"> {
  isOpen: boolean;
  onClose: () => void;
}

export function CameraCaptureModal({
  isOpen,
  onClose,
  onPhotoSaved,
  ...props
}: CameraCaptureModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />
      {/* Modal */}
      <CameraCapture
        {...props}
        onCancel={onClose}
        onPhotoSaved={(photo) => {
          onPhotoSaved?.(photo);
          onClose();
        }}
        inline={false}
      />
    </>
  );
}
