"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
} from "lucide-react";
import { DetailPageHeader } from "@/components/ui/back-button";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { getPublicUrl } from "@/lib/supabase/storage";
import { useCourseZones, formatZoneName } from "@/lib/hooks/useCourseZones";
import type { Photo, CourseZone } from "@/types/database";

type DateRange = "30" | "90" | "all";

interface PhotoWithUrl extends Photo {
  publicUrl: string;
  thumbnailUrl: string | null;
}

interface WeekGroup {
  label: string;
  weekStart: Date;
  photos: PhotoWithUrl[];
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Set to Monday of that week
  d.setDate(d.getDate() - ((day + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(weekStart: Date): string {
  return `Week of ${weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

function groupByWeek(photos: PhotoWithUrl[]): WeekGroup[] {
  const groups = new Map<string, WeekGroup>();

  for (const photo of photos) {
    const date = new Date(photo.created_at);
    const weekStart = getWeekStart(date);
    const key = weekStart.toISOString();

    if (!groups.has(key)) {
      groups.set(key, {
        label: formatWeekLabel(weekStart),
        weekStart,
        photos: [],
      });
    }
    groups.get(key)!.photos.push(photo);
  }

  // Sort weeks newest first
  return Array.from(groups.values()).sort(
    (a, b) => b.weekStart.getTime() - a.weekStart.getTime()
  );
}

export default function PhotoTimelinePage() {
  const { zones, loading: zonesLoading } = useCourseZones();

  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const [dateRange, setDateRange] = useState<DateRange>("90");
  const [photos, setPhotos] = useState<PhotoWithUrl[]>([]);
  const [loading, setLoading] = useState(false);
  const [weekGroups, setWeekGroups] = useState<WeekGroup[]>([]);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [allPhotosFlat, setAllPhotosFlat] = useState<PhotoWithUrl[]>([]);

  // Fetch photos when zone or date range changes
  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    try {
      let query = supabase
        .from("photos")
        .select("*")
        .order("created_at", { ascending: false });

      if (selectedZoneId) {
        query = query.eq("zone_id", selectedZoneId);
      }

      if (dateRange !== "all") {
        const daysAgo = parseInt(dateRange, 10);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysAgo);
        query = query.gte("created_at", cutoff.toISOString());
      }

      query = query.limit(200);

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching photos:", error);
        setPhotos([]);
        setWeekGroups([]);
        return;
      }

      const photosWithUrls: PhotoWithUrl[] = ((data as Photo[]) || []).map(
        (p) => ({
          ...p,
          publicUrl: getPublicUrl(p.storage_path),
          thumbnailUrl: p.thumbnail_path ? getPublicUrl(p.thumbnail_path) : null,
        })
      );

      setPhotos(photosWithUrls);
      const groups = groupByWeek(photosWithUrls);
      setWeekGroups(groups);
      setAllPhotosFlat(photosWithUrls);
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedZoneId, dateRange]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // Lightbox handlers
  const openLightbox = (photo: PhotoWithUrl) => {
    const idx = allPhotosFlat.findIndex((p) => p.id === photo.id);
    setLightboxIndex(idx >= 0 ? idx : 0);
    setLightboxOpen(true);
  };

  const closeLightbox = () => setLightboxOpen(false);

  const nextPhoto = () => {
    setLightboxIndex((prev) =>
      prev < allPhotosFlat.length - 1 ? prev + 1 : 0
    );
  };

  const prevPhoto = () => {
    setLightboxIndex((prev) =>
      prev > 0 ? prev - 1 : allPhotosFlat.length - 1
    );
  };

  // Zone options sorted for dropdown
  const sortedZones: CourseZone[] = [...zones].sort((a, b) => {
    if (a.hole_number && b.hole_number) return a.hole_number - b.hole_number;
    if (a.hole_number) return -1;
    if (b.hole_number) return 1;
    return a.name.localeCompare(b.name);
  });

  const currentPhoto = allPhotosFlat[lightboxIndex];

  return (
    <div className="p-4 md:p-6 pb-24">
      <DetailPageHeader
        title="Course Condition Timeline"
        backHref="/photos"
        backLabel="Back to Photos"
        subtitle="Track course conditions over time with photo documentation"
      />

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Zone selector */}
            <div className="flex-1">
              <Select
                value={selectedZoneId || "__all__"}
                onValueChange={(v) =>
                  setSelectedZoneId(v === "__all__" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All zones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All Zones</SelectItem>
                  {sortedZones.map((zone) => (
                    <SelectItem key={zone.id} value={zone.id}>
                      {formatZoneName(zone)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date range */}
            <div className="w-full sm:w-48">
              <Select
                value={dateRange}
                onValueChange={(v) => setDateRange(v as DateRange)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {(loading || zonesLoading) && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !zonesLoading && photos.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium">No photos found</p>
          <p className="text-sm mt-1">
            {selectedZoneId
              ? "Try selecting a different zone or expanding the date range."
              : "Upload photos with zone tags to see them here."}
          </p>
        </div>
      )}

      {/* Timeline by week */}
      {!loading && !zonesLoading && weekGroups.length > 0 && (
        <div className="space-y-6">
          {weekGroups.map((group) => (
            <div key={group.weekStart.toISOString()}>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {group.label}
                </h2>
                <span className="text-xs text-muted-foreground">
                  ({group.photos.length} photo{group.photos.length !== 1 ? "s" : ""})
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                {group.photos.map((photo) => (
                  <button
                    key={photo.id}
                    onClick={() => openLightbox(photo)}
                    className="relative aspect-square rounded-lg overflow-hidden bg-muted hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumbnailUrl || photo.publicUrl}
                      alt={photo.caption || "Course photo"}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                      <p className="text-[10px] text-white truncate">
                        {new Date(photo.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox modal */}
      {lightboxOpen && currentPhoto && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
          {/* Close */}
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-4 right-4 text-white hover:bg-white/20 z-10"
            onClick={closeLightbox}
          >
            <X className="w-6 h-6" />
          </Button>

          {/* Prev */}
          {allPhotosFlat.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-10"
              onClick={prevPhoto}
            >
              <ChevronLeft className="w-8 h-8" />
            </Button>
          )}

          {/* Image */}
          <div className="max-w-[90vw] max-h-[85vh] flex flex-col items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentPhoto.publicUrl}
              alt={currentPhoto.caption || "Course photo"}
              className="max-w-full max-h-[75vh] object-contain rounded"
            />
            <div className="mt-3 text-center text-white">
              {currentPhoto.caption && (
                <p className="text-sm mb-1">{currentPhoto.caption}</p>
              )}
              <p className="text-xs text-white/70">
                {new Date(currentPhoto.created_at).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <p className="text-xs text-white/50 mt-1">
                {lightboxIndex + 1} of {allPhotosFlat.length}
              </p>
            </div>
          </div>

          {/* Next */}
          {allPhotosFlat.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 z-10"
              onClick={nextPhoto}
            >
              <ChevronRight className="w-8 h-8" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
