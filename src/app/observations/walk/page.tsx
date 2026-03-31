"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  X,
  ChevronRight,
  Plus,
  Loader2,
  ImagePlus,
  Trash2,
  Flag,
  Warehouse,
  Leaf,
  Target,
  Car,
  MapPin,
  Eye,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  useObservations,
  sentimentConfig,
} from "@/lib/hooks/useObservations";
import { usePhotos } from "@/lib/hooks/usePhotos";
import type { CourseObservation, Photo } from "@/types/database";

// ── Location definitions ────────────────────────────────────────────
interface CourseLocation {
  id: string;
  label: string;
  type: "hole" | "facility";
  holeNumber?: number;
  icon?: React.ReactNode;
}

const HOLES: CourseLocation[] = Array.from({ length: 18 }, (_, i) => ({
  id: `hole-${i + 1}`,
  label: `Hole ${i + 1}`,
  type: "hole" as const,
  holeNumber: i + 1,
  icon: <Flag className="w-4 h-4" />,
}));

const FACILITIES: CourseLocation[] = [
  { id: "cart-barn", label: "Cart Barn", type: "facility", icon: <Warehouse className="w-4 h-4" /> },
  { id: "greenhouse", label: "Greenhouse", type: "facility", icon: <Leaf className="w-4 h-4" /> },
  { id: "driving-range", label: "Driving Range", type: "facility", icon: <Target className="w-4 h-4" /> },
  { id: "parking-lot", label: "Parking Lot", type: "facility", icon: <Car className="w-4 h-4" /> },
];

// ── Helper: match observation to a location ─────────────────────────
function obsMatchesLocation(obs: CourseObservation, loc: CourseLocation): boolean {
  if (loc.type === "hole" && loc.holeNumber) {
    return obs.hole_number === loc.holeNumber;
  }
  if (loc.type === "facility") {
    const locLower = (obs.location || "").toLowerCase();
    const labelLower = loc.label.toLowerCase();
    return locLower === labelLower || locLower.includes(labelLower);
  }
  return false;
}

// ── Main page ───────────────────────────────────────────────────────
export default function CourseWalkPage() {
  const { user } = useAuth();
  const { observations, addObservation, deleteObservation } = useObservations();
  const { uploadAndCreatePhoto } = usePhotos();

  const [selectedLocation, setSelectedLocation] = useState<CourseLocation | null>(null);

  const countForLocation = useCallback(
    (loc: CourseLocation) => observations.filter((o) => obsMatchesLocation(o, loc)).length,
    [observations]
  );

  const locationObservations = selectedLocation
    ? observations.filter((o) => obsMatchesLocation(o, selectedLocation))
    : [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/observations">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Eye className="w-6 h-6 text-primary" />
            Course Walk
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Tap a location to add photos &amp; observations
          </p>
        </div>
      </div>

      {selectedLocation ? (
        <LocationDetail
          location={selectedLocation}
          observations={locationObservations}
          userId={user?.id || ""}
          onBack={() => setSelectedLocation(null)}
          onAddObservation={addObservation}
          onDeleteObservation={deleteObservation}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          uploadAndCreatePhoto={uploadAndCreatePhoto as any}
        />
      ) : (
        <>
          {/* Holes grid */}
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Holes
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-8">
            {HOLES.map((loc) => {
              const count = countForLocation(loc);
              return (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc)}
                  className="flex flex-col items-center gap-1.5 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all group"
                >
                  <div className="w-10 h-10 rounded-full bg-green-500/10 text-green-700 flex items-center justify-center font-bold text-lg group-hover:bg-green-500/20 transition-colors">
                    {loc.holeNumber}
                  </div>
                  {count > 0 ? (
                    <span className="text-xs font-medium text-primary">
                      {count} note{count !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No notes</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Facilities */}
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Facilities
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {FACILITIES.map((loc) => {
              const count = countForLocation(loc);
              return (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocation(loc)}
                  className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-700 flex items-center justify-center shrink-0 group-hover:bg-blue-500/20 transition-colors">
                    {loc.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{loc.label}</div>
                    {count > 0 ? (
                      <span className="text-xs font-medium text-primary">
                        {count} note{count !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">No notes</span>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto shrink-0" />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Location detail view ────────────────────────────────────────────
interface LocationDetailProps {
  location: CourseLocation;
  observations: CourseObservation[];
  userId: string;
  onBack: () => void;
  onAddObservation: (
    obs: Omit<CourseObservation, "id" | "created_by" | "created_at" | "updated_at" | "is_addressed" | "linked_plan_item_id">
  ) => Promise<CourseObservation | null>;
  onDeleteObservation: (id: string) => Promise<boolean>;
  uploadAndCreatePhoto: (
    file: File | Blob,
    metadata: { photoType: string; caption?: string },
    userId: string
  ) => Promise<Photo>;
}

function LocationDetail({
  location,
  observations,
  userId,
  onBack,
  onAddObservation,
  onDeleteObservation,
  uploadAndCreatePhoto,
}: LocationDetailProps) {
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Two separate file inputs: one for camera, one for gallery/upload
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [selectedPhotos, setSelectedPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  // Detect mobile
  const [isMobile] = useState(() =>
    typeof navigator !== "undefined"
      ? /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      : false
  );

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      selectedPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(
      (f: File) => f.type.startsWith("image/") && f.size <= 20 * 1024 * 1024
    );
    const newPhotos = imageFiles.map((file: File) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setSelectedPhotos((prev) => [...prev, ...newPhotos]);
    // Reset input so same file can be selected again
    e.target.value = "";
  }, []);

  const removePhoto = useCallback((index: number) => {
    setSelectedPhotos((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[index].preview);
      copy.splice(index, 1);
      return copy;
    });
  }, []);

  const resetForm = useCallback(() => {
    setDescription("");
    setError(null);
    selectedPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
    setSelectedPhotos([]);
    setShowForm(false);
  }, [selectedPhotos]);

  const handleSubmit = async () => {
    if (!description.trim() && selectedPhotos.length === 0) return;
    setSaving(true);
    setError(null);

    try {
      // Upload photos first if any
      const uploadedPhotoIds: string[] = [];
      if (selectedPhotos.length > 0 && userId) {
        setUploadingPhotos(true);
        for (const { file } of selectedPhotos) {
          try {
            const photo = await uploadAndCreatePhoto(
              file,
              {
                photoType: "condition",
                caption: `${location.label} observation`,
              },
              userId
            );
            uploadedPhotoIds.push(photo.id);
          } catch (photoErr) {
            console.error("Photo upload failed:", photoErr);
            // Continue saving the observation even if photo upload fails
          }
        }
        setUploadingPhotos(false);
      }

      // Create observation
      const title = description.trim()
        ? description.trim().slice(0, 80)
        : `Photo observation - ${location.label}`;

      const result = await onAddObservation({
        title,
        description: description.trim() || `Photo observation at ${location.label}`,
        category: "other",
        sentiment: "neutral",
        location: location.type === "facility" ? location.label : null,
        hole_number: location.type === "hole" && location.holeNumber ? location.holeNumber : null,
        zone_id: null,
        photo_ids: uploadedPhotoIds.length > 0 ? uploadedPhotoIds : null,
        tags: [location.type === "hole" ? `hole-${location.holeNumber}` : location.id],
      });

      if (!result) {
        setError("Failed to save observation. Please try again.");
        setSaving(false);
        return;
      }

      // Success — reset form
      setDescription("");
      selectedPhotos.forEach((p) => URL.revokeObjectURL(p.preview));
      setSelectedPhotos([]);
      setShowForm(false);
    } catch (err) {
      console.error("Error saving observation:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSaving(false);
      setUploadingPhotos(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    await onDeleteObservation(id);
    setDeletingId(null);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div>
      {/* Location header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold ${
              location.type === "hole"
                ? "bg-green-500/10 text-green-700"
                : "bg-blue-500/10 text-blue-700"
            }`}
          >
            {location.type === "hole" ? location.holeNumber : location.icon}
          </div>
          <div>
            <h2 className="text-lg font-bold">{location.label}</h2>
            <p className="text-xs text-muted-foreground">
              {observations.length} observation{observations.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button
          className="ml-auto gap-2"
          onClick={() => setShowForm(true)}
        >
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </div>

      {/* Add observation form */}
      {showForm && (
        <div className="mb-6 p-5 bg-card rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">
              New Observation — {location.label}
            </h3>
            <button
              onClick={resetForm}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Description */}
          <div className="mb-4">
            <textarea
              placeholder="What do you see? Describe the condition, any issues, or notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm resize-none"
              autoFocus
            />
          </div>

          {/* Photo section */}
          <div className="mb-4">
            {/* Hidden file inputs — camera and gallery are separate */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              multiple
            />

            {/* Photo previews */}
            {selectedPhotos.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-3">
                {selectedPhotos.map((photo, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.preview}
                      alt={`Photo ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removePhoto(i)}
                      className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {isMobile && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="w-4 h-4" />
                  Take Photo
                </Button>
              )}
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => galleryInputRef.current?.click()}
              >
                <ImagePlus className="w-4 h-4" />
                Upload Photo
              </Button>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetForm}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving || (!description.trim() && selectedPhotos.length === 0)}
              className="gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {uploadingPhotos ? "Uploading photos..." : "Saving..."}
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Existing observations */}
      {observations.length === 0 && !showForm ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/60 flex items-center justify-center">
            <MapPin className="w-7 h-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground mb-1">No observations yet</p>
          <p className="text-sm text-muted-foreground/70 mb-4">
            Tap &quot;Add&quot; to capture photos and notes for {location.label}
          </p>
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add First Observation
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {observations.map((obs) => {
            const sentConfig = sentimentConfig[obs.sentiment];
            return (
              <div
                key={obs.id}
                className="p-4 rounded-xl border border-border bg-card"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {obs.photo_ids && obs.photo_ids.length > 0 && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <Camera className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">
                          {obs.photo_ids.length} photo{obs.photo_ids.length !== 1 ? "s" : ""} attached
                        </span>
                      </div>
                    )}

                    <p className="text-sm mt-1">{obs.description}</p>

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${sentConfig.bg} ${sentConfig.color}`}>
                        {sentConfig.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(obs.created_at)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(obs.id)}
                    disabled={deletingId === obs.id}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    {deletingId === obs.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mobile FAB */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="fixed bottom-20 right-6 sm:hidden w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors z-30"
        >
          <Camera className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
