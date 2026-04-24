"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Check, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InlineCamera } from "@/components/ui/inline-camera";
import { useAuth } from "@/lib/hooks/useAuth";
import { useUntrackedAssets } from "@/lib/hooks/useUntrackedAssets";
import {
  UNTRACKED_ASSET_CATEGORIES,
  untrackedAssetCategoryLabels,
  type UntrackedAssetCategory,
} from "@/types/untracked-assets";

function NewUntrackedAssetContent() {
  const router = useRouter();
  const { user } = useAuth();
  const { createAsset, uploadAssetPhoto } = useUntrackedAssets();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<UntrackedAssetCategory>("other");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhotoCaptured = async (file: File) => {
    setCameraOpen(false);
    if (!user?.id) {
      setError("Not signed in — reopen the app and try again.");
      return;
    }
    setUploadingPhoto(true);
    setError(null);
    try {
      const url = await uploadAssetPhoto(file, user.id);
      if (url) {
        setPhotos((prev) => [...prev, url]);
      } else {
        setError("Photo upload failed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const row = await createAsset({
        name: name.trim(),
        category,
        manufacturer: manufacturer.trim() || null,
        model: model.trim() || null,
        serial_number: serial.trim() || null,
        location: location.trim() || null,
        notes: notes.trim() || null,
        photos,
        created_by: user?.id ?? null,
      });
      if (row) {
        router.push("/assets/untracked");
      } else {
        setError("Could not save. Try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6 pb-40 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/assets/untracked")}
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Add Untracked Asset</h1>
          <p className="text-xs text-muted-foreground">
            Record an item that isn&apos;t on the FY26 inventory
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

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
              placeholder="e.g. Pro Shop HP LaserJet"
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

      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <Label>Photos</Label>
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
              Take photo
            </Button>
          </div>
          {photos.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              No photos yet
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((url, idx) => (
                <div
                  key={idx}
                  className="relative aspect-square rounded-lg overflow-hidden bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`Photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-md"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="fixed bottom-0 inset-x-0 p-4 bg-background/95 backdrop-blur border-t border-border md:static md:p-0 md:bg-transparent md:border-0 md:backdrop-blur-none">
        <div className="max-w-lg mx-auto flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.push("/assets/untracked")}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-1.5" />
            )}
            Save
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
          <div className="text-sm text-muted-foreground animate-pulse">Loading…</div>
        </div>
      }
    >
      <NewUntrackedAssetContent />
    </Suspense>
  );
}
