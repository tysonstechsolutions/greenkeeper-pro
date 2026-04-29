"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  Camera,
  Loader2,
  Save,
  Trash2,
  ImageIcon,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DetailPageHeader } from "@/components/ui/back-button";
import { InlineCamera } from "@/components/ui/inline-camera";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUntrackedAssets } from "@/lib/hooks/useUntrackedAssets";
import {
  UNTRACKED_ASSET_CATEGORIES,
  untrackedAssetCategoryLabels,
  type UntrackedAsset,
  type UntrackedAssetCategory,
} from "@/types/untracked-assets";

function PageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const { user } = useAuth();
  const { fetchOne, updateAsset, deleteAsset, uploadAssetPhoto } =
    useUntrackedAssets();

  const [asset, setAsset] = useState<UntrackedAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState<UntrackedAssetCategory>("other");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) {
      setError("No asset id provided.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const a = await fetchOne(id);
      if (cancelled) return;
      if (!a) {
        setError("Untracked asset not found.");
      } else {
        setAsset(a);
        setName(a.name);
        setCategory(a.category);
        setManufacturer(a.manufacturer ?? "");
        setModel(a.model ?? "");
        setSerial(a.serial_number ?? "");
        setLocation(a.location ?? "");
        setNotes(a.notes ?? "");
        setPhotos(a.photos ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, fetchOne]);

  // ── Dirty check ───────────────────────────────────────────────────────
  const isDirty =
    !!asset &&
    (name !== asset.name ||
      category !== asset.category ||
      manufacturer !== (asset.manufacturer ?? "") ||
      model !== (asset.model ?? "") ||
      serial !== (asset.serial_number ?? "") ||
      location !== (asset.location ?? "") ||
      notes !== (asset.notes ?? ""));

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!asset) return;
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAsset(asset.id, {
        name: name.trim(),
        category,
        manufacturer: manufacturer.trim() || null,
        model: model.trim() || null,
        serial_number: serial.trim() || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
      });
      if (updated) setAsset(updated);
      else setError("Save failed. Try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!asset) return;
    const ok = window.confirm(
      `Delete "${asset.name}"? This cannot be undone.`
    );
    if (!ok) return;
    setDeleting(true);
    const success = await deleteAsset(asset.id);
    if (success) {
      router.push("/assets/untracked");
    } else {
      setDeleting(false);
      setError("Delete failed. Try again.");
    }
  };

  const handlePhotoCaptured = async (file: File) => {
    setCameraOpen(false);
    if (!asset) return;
    if (!user?.id) {
      setError("Not signed in — reopen the app and try again.");
      return;
    }
    setUploadingPhoto(true);
    setError(null);
    try {
      const url = await uploadAssetPhoto(file, user.id);
      if (!url) {
        setError("Photo upload failed.");
        return;
      }
      const newPhotos = [...photos, url];
      // Persist immediately — no separate save button for photos
      const updated = await updateAsset(asset.id, { photos: newPhotos });
      if (updated) {
        setAsset(updated);
        setPhotos(updated.photos ?? newPhotos);
      } else {
        setError("Photo uploaded but save failed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async (idx: number) => {
    if (!asset) return;
    const ok = window.confirm("Delete this photo?");
    if (!ok) return;
    const newPhotos = photos.filter((_, i) => i !== idx);
    // Optimistic
    const previous = photos;
    setPhotos(newPhotos);
    const updated = await updateAsset(asset.id, { photos: newPhotos });
    if (updated) {
      setAsset(updated);
    } else {
      setPhotos(previous);
      setError("Could not delete photo. Please try again.");
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-4 md:p-6 flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="p-4 md:p-6">
        <DetailPageHeader
          backHref="/assets/untracked"
          backLabel="Back to Untracked"
          title="Untracked Asset"
        />
        <p className="text-muted-foreground">
          {error || "Untracked asset not found."}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-40 max-w-lg mx-auto">
      <DetailPageHeader
        backHref="/assets/untracked"
        backLabel="Back to Untracked"
        title={asset.name}
        subtitle={
          <span className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {untrackedAssetCategoryLabels[asset.category]}
            </Badge>
            <span className="text-xs font-mono text-muted-foreground">
              {asset.id.slice(0, 8)}
            </span>
          </span>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 border-red-200 dark:border-red-900"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-1.5" />
            )}
            Delete
          </Button>
        }
      />

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          <div className="flex items-start justify-between gap-3">
            <span className="flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 text-xs font-medium shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ═══ Photos ═══ */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <Label>
              <Camera className="w-4 h-4 inline mr-1.5" />
              Photos ({photos.length})
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCameraOpen(true)}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Camera className="w-4 h-4 mr-1.5" />
              )}
              Add photo
            </Button>
          </div>
          {photos.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border py-8 text-center">
              <ImageIcon className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                No photos yet — tap Add photo
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((url, idx) => (
                <div
                  key={`${url}-${idx}`}
                  className="relative aspect-square rounded-lg overflow-hidden bg-muted group"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(idx)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md"
                    aria-label={`Delete photo ${idx + 1}`}
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Details form ═══ */}
      <Card className="mb-4">
        <CardContent className="p-4 space-y-4">
          <div>
            <Label htmlFor="name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1"
              required
            />
          </div>

          <div>
            <Label htmlFor="category">
              Category <span className="text-red-500">*</span>
            </Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as UntrackedAssetCategory)}
            >
              <SelectTrigger id="category" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNTRACKED_ASSET_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {untrackedAssetCategoryLabels[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="manufacturer">Manufacturer</Label>
              <Input
                id="manufacturer"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g. HP"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="model">Model #</Label>
              <Input
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. M402dn"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="serial">Serial #</Label>
            <Input
              id="serial"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="e.g. VNCK123456"
              className="mt-1 font-mono"
            />
          </div>

          <div>
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Pro Shop back office"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else worth noting"
              rows={3}
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* ═══ Metadata ═══ */}
      <Card className="mb-4">
        <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
          <div className="flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5" />
            <span>
              Created {new Date(asset.created_at).toLocaleString()}
            </span>
          </div>
          {asset.updated_at && asset.updated_at !== asset.created_at && (
            <div className="flex items-center gap-1.5 pl-5">
              Updated {new Date(asset.updated_at).toLocaleString()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sticky save bar — bottom-20 on mobile to clear the 80px bottom nav */}
      <div className="fixed bottom-20 inset-x-0 p-4 bg-background/95 backdrop-blur border-t border-border z-40 md:static md:bottom-0 md:p-0 md:bg-transparent md:border-0 md:backdrop-blur-none md:z-auto">
        <div className="max-w-lg mx-auto flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push("/assets/untracked")}
            disabled={saving}
          >
            Close
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={saving || !isDirty || !name.trim()}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            {isDirty ? "Save changes" : "Saved"}
          </Button>
        </div>
      </div>

      <InlineCamera
        open={cameraOpen}
        onCapture={handlePhotoCaptured}
        onClose={() => setCameraOpen(false)}
      />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-sm text-muted-foreground animate-pulse">
            Loading…
          </div>
        </div>
      }
    >
      <PageContent />
    </Suspense>
  );
}
