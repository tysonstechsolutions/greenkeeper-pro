"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Upload,
  Plane,
  Calendar,
  Loader2,
  Image as ImageIcon,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
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
import { Badge } from "@/components/ui/badge";
import { RoleGuard, RoleVisible, MANAGEMENT_ROLES, STAFF_ROLES } from "@/components/auth/role-guard";
import { useDroneFlights } from "@/lib/hooks/useDroneFlights";
import type { DroneFlight } from "@/types/database";

const BAND_LABELS: Record<string, string> = {
  ndvi: "NDVI",
  ndre: "NDRE",
  thermal: "Thermal",
  rgb: "RGB",
};

const BAND_COLORS: Record<string, string> = {
  ndvi: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  ndre: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  thermal: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  rgb: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
};

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function DronePage() {
  const { flights, loading, error, fetchFlights, uploadFlight, deleteFlight } =
    useDroneFlights();

  // Upload form state
  const [flightDate, setFlightDate] = useState(todayIso());
  const [band, setBand] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    fetchFlights();
  }, [fetchFlights]);

  const handleUpload = useCallback(async () => {
    if (!file || !flightDate) return;

    setUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("flight_date", flightDate);
    if (band) formData.append("band", band);
    if (source) formData.append("source", source);
    if (notes.trim()) formData.append("notes", notes.trim());
    if (previewFile) formData.append("preview", previewFile);

    const result = await uploadFlight(formData);
    setUploading(false);

    if (result) {
      // Reset form
      setFile(null);
      setPreviewFile(null);
      setBand("");
      setSource("");
      setNotes("");
      setFlightDate(todayIso());
      // Reset file inputs
      const fileInputs = document.querySelectorAll<HTMLInputElement>(
        'input[type="file"]'
      );
      fileInputs.forEach((input) => {
        input.value = "";
      });
    } else {
      setUploadError("Upload failed. Check permissions and try again.");
    }
  }, [file, previewFile, flightDate, band, source, notes, uploadFlight]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this drone flight record?")) return;
      await deleteFlight(id);
    },
    [deleteFlight]
  );

  const getPreviewUrl = useCallback((flight: DroneFlight): string | null => {
    const path = flight.preview_png_path || flight.geotiff_path;
    if (!path) return null;
    // Build Supabase storage URL - using the public URL pattern
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return null;
    return `${supabaseUrl}/storage/v1/object/public/drone-flights/${path}`;
  }, []);

  return (
    <RoleGuard allowedRoles={STAFF_ROLES}>
      <div className="flex flex-col gap-6 p-4 pb-24 max-w-4xl mx-auto">
        <PageHeader
          title="Drone Flights"
          description="Upload and view NDVI, thermal, and RGB drone imagery"
          icon={Plane}
        />

        {/* Upload Section - management + foreman only */}
        <RoleVisible visibleToRoles={MANAGEMENT_ROLES}>
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Flight Data
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="flight-date">Flight Date *</Label>
                <Input
                  id="flight-date"
                  type="date"
                  value={flightDate}
                  onChange={(e) => setFlightDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="band">Band Type</Label>
                <Select value={band} onValueChange={setBand}>
                  <SelectTrigger id="band">
                    <SelectValue placeholder="Select band..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ndvi">NDVI</SelectItem>
                    <SelectItem value="ndre">NDRE</SelectItem>
                    <SelectItem value="thermal">Thermal</SelectItem>
                    <SelectItem value="rgb">RGB</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="source">Source</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger id="source">
                    <SelectValue placeholder="Select source..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="greensight">GreenSight</SelectItem>
                    <SelectItem value="pix4d">Pix4D</SelectItem>
                    <SelectItem value="dji">DJI</SelectItem>
                    <SelectItem value="manual">Manual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="file">Image File *</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".tif,.tiff,.geotiff,.png,.jpg,.jpeg"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="preview">Preview PNG (for TIFF files)</Label>
                <Input
                  id="preview"
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  onChange={(e) => setPreviewFile(e.target.files?.[0] ?? null)}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Flight conditions, coverage area, etc."
                  rows={2}
                />
              </div>
            </div>

            {(uploadError || error) && (
              <p className="text-sm text-destructive">
                {uploadError || error}
              </p>
            )}

            <Button
              onClick={handleUpload}
              disabled={!file || !flightDate || uploading}
              className="w-full sm:w-auto"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Flight
                </>
              )}
            </Button>
          </div>
        </RoleVisible>

        {/* Flight History */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Flight History
          </h2>

          {loading && flights.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && flights.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Plane className="w-12 h-12 mb-3 opacity-50" />
              <p className="text-sm">No drone flights uploaded yet.</p>
            </div>
          )}

          <div className="space-y-2">
            {flights.map((flight) => {
              const previewUrl = getPreviewUrl(flight);
              return (
                <div
                  key={flight.id}
                  className="rounded-lg border bg-card p-3 flex items-start gap-3 hover:bg-accent/50 transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="flex-shrink-0 w-16 h-16 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                    {previewUrl && flight.preview_png_path ? (
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full h-full"
                      >
                        <img
                          src={previewUrl}
                          alt="Flight preview"
                          className="w-full h-full object-cover"
                        />
                      </a>
                    ) : (
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {new Date(flight.flight_date + "T00:00:00").toLocaleDateString(
                          "en-US",
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </span>
                      {flight.band && (
                        <Badge
                          variant="secondary"
                          className={BAND_COLORS[flight.band] ?? ""}
                        >
                          {BAND_LABELS[flight.band] ?? flight.band}
                        </Badge>
                      )}
                      {flight.source && (
                        <span className="text-xs text-muted-foreground capitalize">
                          {flight.source}
                        </span>
                      )}
                    </div>
                    {flight.notes && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {flight.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {previewUrl && (
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-md hover:bg-muted transition-colors"
                        title="Open full image"
                      >
                        <ExternalLink className="w-4 h-4 text-muted-foreground" />
                      </a>
                    )}
                    <RoleVisible visibleToRoles={["super", "asst_super", "director"]}>
                      <button
                        onClick={() => handleDelete(flight.id)}
                        className="p-2 rounded-md hover:bg-destructive/10 transition-colors"
                        title="Delete flight"
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </button>
                    </RoleVisible>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
