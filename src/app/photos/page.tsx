"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Camera,
  Filter,
  Grid3X3,
  Clock,
  ChevronDown,
  ChevronUp,
  X,
  Download,
  Trash2,
  Edit2,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Tag,
  User,
  Calendar,
  FileText,
  Check,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { SkeletonPhotoGrid } from "@/components/ui/skeleton-card";
import Link from "next/link";
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
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/useAuth";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import {
  usePhotos,
  photoTypeLabels,
  photoTypeColors,
  type PhotoWithUploader,
  type PhotoFilters,
} from "@/lib/hooks/usePhotos";
import { useCourseZones, formatZoneName } from "@/lib/hooks/useCourseZones";
import { useProfiles, getDisplayName, getInitials } from "@/lib/hooks/useProfiles";
import {
  CameraCaptureModal,
} from "@/components/features/photos/camera-capture";
import { directSelectList, directSelectCount } from "@/lib/supabase/rest";
import type { PhotoType } from "@/types/database";
import { formatLocalDate } from "@/lib/utils/date";

type ViewMode = "grid" | "timeline";

interface PhotoStats {
  thisMonth: number;
  today: number;
  mostDocumentedZone: { name: string; count: number } | null;
  topContributor: { name: string; count: number } | null;
}

export default function PhotosPage() {
  const { user, isManager, isForeman } = useAuth();
  const {
    photos,
    loading,
    hasMore,
    fetchPhotos,
    fetchZoneTimeline,
    updatePhoto,
    deletePhoto,
    getPhotoUrl,
    getThumbnailUrl,
    clearPhotos,
  } = usePhotos();
  const { zones } = useCourseZones();
  const { profiles } = useProfiles();

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);

  // Filter state
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [selectedZone, setSelectedZone] = useState("");
  const [selectedPhotoTypes, setSelectedPhotoTypes] = useState<PhotoType[]>([]);
  const [selectedUploader, setSelectedUploader] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Timeline state
  const [timelineZoneId, setTimelineZoneId] = useState("");
  const [timelinePhotos, setTimelinePhotos] = useState<PhotoWithUploader[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [editingCaption, setEditingCaption] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [editCaption, setEditCaption] = useState("");
  const [editTags, setEditTags] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Compare mode for timeline
  const [compareMode, setCompareMode] = useState(false);
  const [comparePhotos, setComparePhotos] = useState<PhotoWithUploader[]>([]);

  // Lock body scroll while the compare view is showing (the two-photo
  // full-screen overlay should behave like a modal).
  useBodyScrollLock(compareMode && comparePhotos.length === 2);

  // Stats
  const [stats, setStats] = useState<PhotoStats>({
    thisMonth: 0,
    today: 0,
    mostDocumentedZone: null,
    topContributor: null,
  });

  // Pagination
  const [page, setPage] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (dateStart || dateEnd) count++;
    if (selectedZone) count++;
    if (selectedPhotoTypes.length > 0) count++;
    if (selectedUploader) count++;
    if (tagsInput) count++;
    if (searchQuery) count++;
    return count;
  }, [dateStart, dateEnd, selectedZone, selectedPhotoTypes, selectedUploader, tagsInput, searchQuery]);

  // Build filters object
  const buildFilters = useCallback((): PhotoFilters => {
    const f: PhotoFilters = {};

    if (dateStart && dateEnd) {
      f.dateRange = { start: dateStart, end: dateEnd };
    } else if (dateStart) {
      f.dateRange = { start: dateStart, end: dateStart };
    } else if (dateEnd) {
      f.dateRange = { start: "2000-01-01", end: dateEnd };
    }

    if (selectedZone) f.zoneId = selectedZone;
    if (selectedPhotoTypes.length === 1) f.photoType = selectedPhotoTypes[0];
    if (selectedUploader) f.uploadedBy = selectedUploader;
    if (tagsInput) {
      f.tags = tagsInput.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    }
    if (searchQuery) f.search = searchQuery;

    return f;
  }, [dateStart, dateEnd, selectedZone, selectedPhotoTypes, selectedUploader, tagsInput, searchQuery]);

  // Fetch stats — direct REST so a wedged supabase-js auth wrapper can't
  // hang the dashboard load. The four sub-queries run in parallel since
  // they're independent.
  const fetchStats = useCallback(async () => {
    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();

    try {
      const [monthCount, todayCount, zoneStats, uploaderStats] =
        await Promise.all([
          directSelectCount(
            "photos",
            [`created_at=gte.${encodeURIComponent(startOfMonth)}`],
            "photos.fetchStats.monthCount",
          ),
          directSelectCount(
            "photos",
            [`created_at=gte.${encodeURIComponent(startOfToday)}`],
            "photos.fetchStats.todayCount",
          ),
          directSelectList<{ zone_id: string | null }>("photos", {
            columns: "zone_id",
            filters: [`zone_id=not.is.null`],
            label: "photos.fetchStats.zoneStats",
          }),
          directSelectList<{ uploaded_by: string }>("photos", {
            columns: "uploaded_by",
            filters: [`created_at=gte.${encodeURIComponent(startOfMonth)}`],
            label: "photos.fetchStats.uploaderStats",
          }),
        ]);

      // Most documented zone
      const zoneCounts: Record<string, number> = {};
      zoneStats.forEach((p) => {
        if (p.zone_id) {
          zoneCounts[p.zone_id] = (zoneCounts[p.zone_id] || 0) + 1;
        }
      });

      let topZone: { name: string; count: number } | null = null;
      let maxZoneCount = 0;
      Object.entries(zoneCounts).forEach(([zoneId, count]) => {
        if (count > maxZoneCount) {
          maxZoneCount = count;
          const zone = zones.find((z) => z.id === zoneId);
          topZone = { name: zone ? formatZoneName(zone) : "Unknown Zone", count };
        }
      });

      // Top contributor
      const uploaderCounts: Record<string, number> = {};
      uploaderStats.forEach((p) => {
        uploaderCounts[p.uploaded_by] = (uploaderCounts[p.uploaded_by] || 0) + 1;
      });

      let topUploader: { name: string; count: number } | null = null;
      let maxUploaderCount = 0;
      Object.entries(uploaderCounts).forEach(([uploaderId, count]) => {
        if (count > maxUploaderCount) {
          maxUploaderCount = count;
          const uploaderProfile = profiles.find((p) => p.id === uploaderId);
          topUploader = {
            name: uploaderProfile ? getDisplayName(uploaderProfile) : "Unknown",
            count,
          };
        }
      });

      setStats({
        thisMonth: monthCount,
        today: todayCount,
        mostDocumentedZone: topZone,
        topContributor: topUploader,
      });
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }, [zones, profiles]);

  // Initial load
  useEffect(() => {
    if (viewMode === "grid") {
      clearPhotos();
      setPage((prev) => (prev !== 0 ? 0 : prev)); // eslint-disable-line react-hooks/set-state-in-effect
      fetchPhotos(buildFilters(), 0);
    }
    void fetchStats();
  }, [viewMode, fetchStats]);

  // Apply filters
  const applyFilters = useCallback(() => {
    clearPhotos();
    setPage(0);
    fetchPhotos(buildFilters(), 0);
  }, [buildFilters, fetchPhotos, clearPhotos]);

  // Clear filters
  const clearFilters = useCallback(() => {
    setDateStart("");
    setDateEnd("");
    setSelectedZone("");
    setSelectedPhotoTypes([]);
    setSelectedUploader("");
    setTagsInput("");
    setSearchQuery("");
    clearPhotos();
    setPage(0);
    fetchPhotos({}, 0);
  }, [fetchPhotos, clearPhotos]);

  // Quick date filters
  const setQuickDate = (range: "today" | "week" | "month") => {
    const now = new Date();
    const endDate = formatLocalDate(now);
    let startDate = endDate;

    if (range === "week") {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      startDate = formatLocalDate(weekAgo);
    } else if (range === "month") {
      startDate = formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1));
    }

    setDateStart(startDate);
    setDateEnd(endDate);
  };

  // Toggle photo type filter
  const togglePhotoType = (type: PhotoType) => {
    setSelectedPhotoTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  // Infinite scroll
  useEffect(() => {
    if (viewMode !== "grid") return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const nextPage = page + 1;
          setPage(nextPage);
          fetchPhotos(buildFilters(), nextPage);
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [hasMore, loading, page, buildFilters, fetchPhotos, viewMode]);

  // Timeline view
  useEffect(() => {
    if (viewMode === "timeline" && timelineZoneId) {
      setTimelineLoading((prev) => (prev ? prev : true)); // eslint-disable-line react-hooks/set-state-in-effect
      fetchZoneTimeline(timelineZoneId).then((photos) => {
        setTimelinePhotos(photos);
        setTimelineLoading(false);
      });
    }
  }, [viewMode, timelineZoneId, fetchZoneTimeline]);

  // Group timeline photos by date
  const timelineGrouped = useMemo(() => {
    const groups: Record<string, PhotoWithUploader[]> = {};
    timelinePhotos.forEach((photo) => {
      const date = new Date(photo.created_at).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(photo);
    });
    return groups;
  }, [timelinePhotos]);

  // Lightbox navigation
  const currentPhotos = viewMode === "grid" ? photos : timelinePhotos;
  const currentPhoto = currentPhotos[lightboxIndex];

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
    setEditingCaption(false);
    setEditingTags(false);
    setDeleteConfirm(false);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    setEditingCaption(false);
    setEditingTags(false);
    setDeleteConfirm(false);
  };

  const navigateLightbox = (direction: "prev" | "next") => {
    if (direction === "prev" && lightboxIndex > 0) {
      setLightboxIndex(lightboxIndex - 1);
    } else if (direction === "next" && lightboxIndex < currentPhotos.length - 1) {
      setLightboxIndex(lightboxIndex + 1);
    }
    setEditingCaption(false);
    setEditingTags(false);
    setDeleteConfirm(false);
  };

  // Body scroll lock while the lightbox is open.
  useBodyScrollLock(lightboxOpen);

  // Keyboard navigation for the lightbox.
  useEffect(() => {
    if (!lightboxOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") navigateLightbox("prev");
      else if (e.key === "ArrowRight") navigateLightbox("next");
      else if (e.key === "Escape") closeLightbox();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen, lightboxIndex, currentPhotos.length]);

  // Touch swipe for lightbox — horizontal swipes switch photos, mirroring
  // native photo viewers. Threshold ignores incidental scrolling.
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onLightboxTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };
  const onLightboxTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const dt = Date.now() - start.t;
    // Treat as a horizontal swipe only when |dx| dominates |dy|, the
    // distance crosses 50px, and the gesture finished within 600ms.
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 600) {
      navigateLightbox(dx > 0 ? "prev" : "next");
    }
  };

  // Save caption
  const saveCaption = async () => {
    if (!currentPhoto) return;
    await updatePhoto(currentPhoto.id, { caption: editCaption });
    setEditingCaption(false);
  };

  // Save tags
  const saveTags = async () => {
    if (!currentPhoto) return;
    const tags = editTags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    await updatePhoto(currentPhoto.id, { tags });
    setEditingTags(false);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!currentPhoto) return;
    const success = await deletePhoto(currentPhoto.id);
    if (success) {
      if (lightboxIndex >= currentPhotos.length - 1) {
        setLightboxIndex(Math.max(0, lightboxIndex - 1));
      }
      if (currentPhotos.length <= 1) {
        closeLightbox();
      }
    }
    setDeleteConfirm(false);
  };

  // Download photo
  const downloadPhoto = () => {
    if (!currentPhoto) return;
    const url = getPhotoUrl(currentPhoto);
    const a = document.createElement("a");
    a.href = url;
    a.download = `photo-${currentPhoto.id}.jpg`;
    a.click();
  };

  // Compare mode handlers
  const toggleComparePhoto = (photo: PhotoWithUploader) => {
    if (comparePhotos.find(p => p.id === photo.id)) {
      setComparePhotos(comparePhotos.filter(p => p.id !== photo.id));
    } else if (comparePhotos.length < 2) {
      setComparePhotos([...comparePhotos, photo]);
    }
  };

  // Check if user can edit/delete photo
  const canEditPhoto = (photo: PhotoWithUploader) => {
    if (isManager) return true;
    return photo.uploaded_by === user?.id;
  };

  // Get zone name
  const getZoneName = (zoneId: string | null) => {
    if (!zoneId) return null;
    const zone = zones.find(z => z.id === zoneId);
    return zone ? formatZoneName(zone) : null;
  };

  return (
    <div className="p-4 md:p-6 pb-24">
      <PageHeader
        title="Photos"
        description="Course documentation"
        icon={Camera}
      >
        <div className="flex items-center gap-2">
          {user && (
            <Button
              size="sm"
              onClick={() => setShowCameraModal(true)}
              className="active:scale-95"
            >
              <Camera className="w-4 h-4 mr-1" />
              Take Photo
            </Button>
          )}
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("grid")}
          >
            <Grid3X3 className="w-4 h-4 mr-1" />
            Grid
          </Button>
          <Button
            variant={viewMode === "timeline" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("timeline")}
          >
            <Clock className="w-4 h-4 mr-1" />
            Timeline
          </Button>
          <Link href="/photos/timeline">
            <Button variant="outline" size="sm">
              <Calendar className="w-4 h-4 mr-1" />
              Condition Timeline
            </Button>
          </Link>
        </div>
      </PageHeader>

      {/* Stats Bar */}
      <div className="flex gap-3 overflow-x-auto pb-2 mb-4 -mx-4 pl-4 pr-12 md:mx-0 md:px-0">
        <div className="flex-shrink-0 bg-card border border-border rounded-lg p-3 min-w-[140px]">
          <p className="text-xs text-muted-foreground">Photos This Month</p>
          <p className="text-xl font-bold">{stats.thisMonth}</p>
        </div>
        <div className="flex-shrink-0 bg-card border border-border rounded-lg p-3 min-w-[140px]">
          <p className="text-xs text-muted-foreground">Photos Today</p>
          <p className="text-xl font-bold">{stats.today}</p>
        </div>
        <div className="flex-shrink-0 bg-card border border-border rounded-lg p-3 min-w-[160px]">
          <p className="text-xs text-muted-foreground">Most Documented</p>
          <p className="text-sm font-semibold truncate">
            {stats.mostDocumentedZone?.name || "—"}
          </p>
        </div>
        <div className="flex-shrink-0 bg-card border border-border rounded-lg p-3 min-w-[140px]">
          <p className="text-xs text-muted-foreground">Top Contributor</p>
          <p className="text-sm font-semibold truncate">
            {stats.topContributor?.name || "—"}
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      {viewMode === "grid" && (
        <div className="mb-4 bg-card border border-border rounded-lg">
          {/* Filter toggle */}
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="w-full p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" />
              <span className="font-medium">Filters</span>
              {activeFilterCount > 0 && (
                <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </div>
            {filtersExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {/* Filter content */}
          {filtersExpanded && (
            <div className="p-4 pt-0 space-y-4 border-t border-border">
              {/* Date range */}
              <div className="space-y-2">
                <Label>Date Range</Label>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickDate("today")}
                  >
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickDate("week")}
                  >
                    This Week
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickDate("month")}
                  >
                    This Month
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={dateStart}
                    onChange={(e) => setDateStart(e.target.value)}
                    className="flex-1"
                  />
                  <span className="self-center text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={dateEnd}
                    onChange={(e) => setDateEnd(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Zone */}
              <div className="space-y-2">
                <Label>Zone</Label>
                <Select value={selectedZone} onValueChange={setSelectedZone}>
                  <SelectTrigger>
                    <SelectValue placeholder="All zones" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All zones</SelectItem>
                    {zones.map((zone) => (
                      <SelectItem key={zone.id} value={zone.id}>
                        {formatZoneName(zone)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Photo Type */}
              <div className="space-y-2">
                <Label>Photo Type</Label>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(photoTypeLabels) as [PhotoType, string][]).map(
                    ([type, label]) => (
                      <button
                        key={type}
                        onClick={() => togglePhotoType(type)}
                        className={cn(
                          "px-3 py-1.5 rounded-full text-sm border transition-colors",
                          selectedPhotoTypes.includes(type)
                            ? "border-transparent text-white"
                            : "border-border hover:border-primary/50"
                        )}
                        style={{
                          backgroundColor: selectedPhotoTypes.includes(type)
                            ? photoTypeColors[type]
                            : undefined,
                        }}
                      >
                        {label}
                      </button>
                    )
                  )}
                </div>
              </div>

              {/* Uploaded By (manager/foreman only) */}
              {(isManager || isForeman) && (
                <div className="space-y-2">
                  <Label>Uploaded By</Label>
                  <Select value={selectedUploader} onValueChange={setSelectedUploader}>
                    <SelectTrigger>
                      <SelectValue placeholder="Anyone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Anyone</SelectItem>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {getDisplayName(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Tags */}
              <div className="space-y-2">
                <Label>Tags</Label>
                <Input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="e.g., disease, drought"
                />
              </div>

              {/* Search */}
              <div className="space-y-2">
                <Label>Search Captions</Label>
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                />
              </div>

              {/* Filter actions */}
              <div className="flex gap-2 pt-2">
                <Button onClick={applyFilters} className="flex-1">
                  Apply Filters
                </Button>
                <Button variant="outline" onClick={clearFilters}>
                  Clear
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Timeline Zone Selector */}
      {viewMode === "timeline" && (
        <div className="mb-4 space-y-3">
          <div className="flex items-center gap-3">
            <Select value={timelineZoneId} onValueChange={setTimelineZoneId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a zone to view timeline" />
              </SelectTrigger>
              <SelectContent>
                {zones.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {formatZoneName(zone)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={compareMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setCompareMode(!compareMode);
                setComparePhotos([]);
              }}
            >
              Compare
            </Button>
          </div>
          {compareMode && (
            <p className="text-sm text-muted-foreground">
              Select 2 photos to compare ({comparePhotos.length}/2 selected)
            </p>
          )}
        </div>
      )}

      {/* Grid View */}
      {viewMode === "grid" && (
        <>
          {loading && photos.length === 0 ? (
            <SkeletonPhotoGrid count={12} />
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                <Camera className="w-10 h-10 text-muted-foreground" />
              </div>
              {activeFilterCount > 0 ? (
                <>
                  <h3 className="text-lg font-semibold mb-2">No photos match your filters</h3>
                  <p className="text-muted-foreground mb-4">
                    Try adjusting your search criteria.
                  </p>
                  <Button variant="outline" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold mb-2">Start documenting your course!</h3>
                  <p className="text-muted-foreground">
                    Tap the camera button to take your first photo.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {photos.map((photo, index) => (
                <button
                  key={photo.id}
                  onClick={() => openLightbox(index)}
                  className="relative aspect-square bg-muted rounded-lg overflow-hidden group hover:ring-2 hover:ring-primary transition-all"
                >
                  {getThumbnailUrl(photo) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={getThumbnailUrl(photo)!}
                      alt={photo.caption || "Photo"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  {/* Photo type badge */}
                  <span
                    className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-medium text-white"
                    style={{ backgroundColor: photoTypeColors[photo.photo_type] }}
                  >
                    {photoTypeLabels[photo.photo_type]}
                  </span>
                  {/* Date */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6">
                    <p className="text-white text-xs">
                      {new Date(photo.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Load more trigger */}
          <div ref={loadMoreRef} className="h-10 flex items-center justify-center mt-4">
            {loading && <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />}
          </div>
        </>
      )}

      {/* Timeline View */}
      {viewMode === "timeline" && (
        <>
          {!timelineZoneId ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                <Clock className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Select a zone</h3>
              <p className="text-muted-foreground">
                Choose a zone to view its photo timeline.
              </p>
            </div>
          ) : timelineLoading ? (
            <SkeletonPhotoGrid count={8} className="grid-cols-2 md:grid-cols-4" />
          ) : timelinePhotos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                <Camera className="w-10 h-10 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No photos for this zone</h3>
              <p className="text-muted-foreground">
                Start documenting by taking photos of this area.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(timelineGrouped).map(([date, datePhotos]) => (
                <div key={date}>
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">{date}</h3>
                  <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
                    {datePhotos.map((photo) => (
                      <div
                        key={photo.id}
                        className={cn(
                          "flex-shrink-0 w-40",
                          compareMode && comparePhotos.find(p => p.id === photo.id) && "ring-2 ring-primary rounded-lg"
                        )}
                      >
                        <button
                          onClick={() => {
                            if (compareMode) {
                              toggleComparePhoto(photo);
                            } else {
                              const globalIndex = timelinePhotos.findIndex(p => p.id === photo.id);
                              openLightbox(globalIndex);
                            }
                          }}
                          className="relative w-full aspect-square bg-muted rounded-lg overflow-hidden group"
                        >
                          {getThumbnailUrl(photo) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={getThumbnailUrl(photo)!}
                              alt={photo.caption || "Photo"}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="w-8 h-8 text-muted-foreground" />
                            </div>
                          )}
                          {compareMode && comparePhotos.find(p => p.id === photo.id) && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <Check className="w-8 h-8 text-white" />
                            </div>
                          )}
                        </button>
                        {photo.caption && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {photo.caption}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Compare View */}
          {compareMode && comparePhotos.length === 2 && (
            <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
              <div className="flex items-center justify-between p-4 text-white">
                <h3 className="font-semibold">Comparing Photos</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setComparePhotos([])}
                  className="text-white hover:bg-white/20"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
              <div className="flex-1 flex">
                {comparePhotos.map((photo) => (
                  <div key={photo.id} className="flex-1 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getPhotoUrl(photo)}
                      alt={photo.caption || "Photo"}
                      className="w-full h-full object-contain"
                    />
                    <p className="text-white text-center text-sm mt-2">
                      {new Date(photo.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Lightbox */}
      {lightboxOpen && currentPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col"
          onTouchStart={onLightboxTouchStart}
          onTouchEnd={onLightboxTouchEnd}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 text-white">
            <span className="text-sm">
              {lightboxIndex + 1} / {currentPhotos.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={downloadPhoto}
                className="text-white hover:bg-white/20"
              >
                <Download className="w-5 h-5" />
              </Button>
              {canEditPhoto(currentPhoto) && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditCaption(currentPhoto.caption || "");
                      setEditingCaption(true);
                    }}
                    className="text-white hover:bg-white/20"
                  >
                    <Edit2 className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirm(true)}
                    className="text-white hover:bg-white/20"
                  >
                    <Trash2 className="w-5 h-5" />
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={closeLightbox}
                className="text-white hover:bg-white/20"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Image */}
          <div className="flex-1 flex items-center justify-center relative px-12">
            {/* Navigation arrows */}
            {lightboxIndex > 0 && (
              <button
                onClick={() => navigateLightbox("prev")}
                className="absolute left-2 p-2 text-white hover:bg-white/20 rounded-full"
              >
                <ChevronLeft className="w-8 h-8" />
              </button>
            )}
            {lightboxIndex < currentPhotos.length - 1 && (
              <button
                onClick={() => navigateLightbox("next")}
                className="absolute right-2 p-2 text-white hover:bg-white/20 rounded-full"
              >
                <ChevronRight className="w-8 h-8" />
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getPhotoUrl(currentPhoto)}
              alt={currentPhoto.caption || "Photo"}
              className="max-w-full max-h-full object-contain"
            />
          </div>

          {/* Info panel */}
          <div className="bg-card text-foreground p-4 max-h-[40vh] overflow-y-auto md:absolute md:right-0 md:top-16 md:bottom-0 md:w-80 md:max-h-none">
            {/* Photo type badge */}
            <span
              className="inline-block px-3 py-1 rounded-full text-sm font-medium text-white mb-3"
              style={{ backgroundColor: photoTypeColors[currentPhoto.photo_type] }}
            >
              {photoTypeLabels[currentPhoto.photo_type]}
            </span>

            {/* Caption */}
            <div className="mb-4">
              <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                <FileText className="w-3 h-3" /> Caption
              </Label>
              {editingCaption ? (
                <div className="space-y-2">
                  <Textarea
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveCaption}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingCaption(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm">{currentPhoto.caption || "No caption"}</p>
              )}
            </div>

            {/* Date/time */}
            <div className="mb-4">
              <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                <Calendar className="w-3 h-3" /> Date
              </Label>
              <p className="text-sm">
                {new Date(currentPhoto.created_at).toLocaleString()}
              </p>
            </div>

            {/* Uploaded by */}
            {currentPhoto.uploader && (
              <div className="mb-4">
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <User className="w-3 h-3" /> Uploaded by
                </Label>
                <div className="flex items-center gap-2">
                  {currentPhoto.uploader.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentPhoto.uploader.avatar_url}
                      alt=""
                      className="w-6 h-6 rounded-full"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">
                      {getInitials(currentPhoto.uploader.full_name)}
                    </div>
                  )}
                  <span className="text-sm">
                    {currentPhoto.uploader.display_name || currentPhoto.uploader.full_name || "Unknown"}
                  </span>
                </div>
              </div>
            )}

            {/* Zone */}
            {currentPhoto.zone_id && (
              <div className="mb-4">
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <MapPin className="w-3 h-3" /> Zone
                </Label>
                <p className="text-sm">{getZoneName(currentPhoto.zone_id)}</p>
              </div>
            )}

            {/* GPS */}
            {currentPhoto.gps_lat && currentPhoto.gps_lng && (
              <div className="mb-4">
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <MapPin className="w-3 h-3" /> Location
                </Label>
                <a
                  href={`https://www.google.com/maps?q=${currentPhoto.gps_lat},${currentPhoto.gps_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary flex items-center gap-1"
                >
                  View on Map <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* Linked task */}
            {currentPhoto.task_id && (
              <div className="mb-4">
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                  <FileText className="w-3 h-3" /> Linked Task
                </Label>
                <Link
                  href={`/tasks/view?id=${currentPhoto.task_id}`}
                  className="text-sm text-primary flex items-center gap-1"
                >
                  View Task <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            )}

            {/* Tags */}
            <div className="mb-4">
              <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                <Tag className="w-3 h-3" /> Tags
              </Label>
              {editingTags ? (
                <div className="space-y-2">
                  <Input
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    placeholder="tag1, tag2, tag3"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={saveTags}>
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingTags(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : currentPhoto.tags && currentPhoto.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {currentPhoto.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-muted rounded text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                  {canEditPhoto(currentPhoto) && (
                    <button
                      onClick={() => {
                        setEditTags(currentPhoto.tags?.join(", ") || "");
                        setEditingTags(true);
                      }}
                      className="px-2 py-0.5 text-primary text-xs hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">No tags</span>
                  {canEditPhoto(currentPhoto) && (
                    <button
                      onClick={() => {
                        setEditTags("");
                        setEditingTags(true);
                      }}
                      className="text-primary text-xs hover:underline"
                    >
                      Add tags
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Delete confirmation */}
          {deleteConfirm && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
              <div className="bg-card p-6 rounded-lg max-w-sm mx-4">
                <h3 className="text-lg font-semibold mb-2">Delete Photo?</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  This action cannot be undone. The photo will be permanently removed.
                </p>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setDeleteConfirm(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleDelete}>
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Camera Modal */}
      {user && (
        <CameraCaptureModal
          isOpen={showCameraModal}
          onClose={() => setShowCameraModal(false)}
          userId={user.id}
          onPhotoSaved={() => {
            // Refresh photos
            if (viewMode === "grid") {
              clearPhotos();
              setPage(0);
              fetchPhotos(buildFilters(), 0);
            }
            fetchStats();
          }}
        />
      )}
    </div>
  );
}
