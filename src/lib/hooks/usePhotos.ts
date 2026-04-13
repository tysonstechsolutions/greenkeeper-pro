"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  uploadPhoto,
  uploadPhotoFromBlob,
  generateThumbnail,
  uploadThumbnail,
  deletePhoto as deletePhotoFromStorage,
  getPublicUrl,
} from "@/lib/supabase/storage";
import { getGPSWithFallback, extractDateTime } from "@/lib/utils/exif";
import type { Photo, PhotoType, Profile } from "@/types/database";

export interface PhotoWithUploader extends Photo {
  uploader?: Pick<Profile, "id" | "full_name" | "display_name" | "avatar_url">;
}

export interface PhotoFilters {
  dateRange?: {
    start: string; // ISO date string
    end: string;
  };
  zoneId?: string;
  taskId?: string;
  photoType?: PhotoType;
  uploadedBy?: string;
  tags?: string[];
  search?: string;
}

export interface PhotoMetadata {
  taskId?: string;
  zoneId?: string;
  photoType: PhotoType;
  caption?: string;
  tags?: string[];
}

interface UsePhotosReturn {
  photos: PhotoWithUploader[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  fetchPhotos: (filters?: PhotoFilters, page?: number) => Promise<void>;
  fetchTaskPhotos: (taskId: string) => Promise<PhotoWithUploader[]>;
  fetchZonePhotos: (zoneId: string, limit?: number) => Promise<PhotoWithUploader[]>;
  fetchZoneTimeline: (zoneId: string) => Promise<PhotoWithUploader[]>;
  uploadAndCreatePhoto: (
    file: File | Blob,
    metadata: PhotoMetadata,
    userId: string
  ) => Promise<Photo>;
  updatePhoto: (
    id: string,
    data: { caption?: string; tags?: string[]; zone_id?: string; photo_type?: PhotoType }
  ) => Promise<Photo | null>;
  deletePhoto: (id: string) => Promise<boolean>;
  getPhotoUrl: (photo: Photo) => string;
  getThumbnailUrl: (photo: Photo) => string | null;
  clearPhotos: () => void;
}

const PAGE_SIZE = 20;

export function usePhotos(): UsePhotosReturn {
  const [photos, setPhotos] = useState<PhotoWithUploader[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const supabase = createClient();

  /**
   * Fetch photos with optional filters and pagination
   */
  const fetchPhotos = useCallback(
    async (filters?: PhotoFilters, page: number = 0) => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from("photos")
          .select(
            `
            *,
            uploader:profiles!photos_uploaded_by_fkey (
              id,
              full_name,
              display_name,
              avatar_url
            )
          `
          )
          .order("created_at", { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        // Apply filters
        if (filters?.dateRange) {
          query = query
            .gte("created_at", filters.dateRange.start)
            .lte("created_at", filters.dateRange.end + "T23:59:59.999Z");
        }

        if (filters?.zoneId) {
          query = query.eq("zone_id", filters.zoneId);
        }

        if (filters?.taskId) {
          query = query.eq("task_id", filters.taskId);
        }

        if (filters?.photoType) {
          query = query.eq("photo_type", filters.photoType);
        }

        if (filters?.uploadedBy) {
          query = query.eq("uploaded_by", filters.uploadedBy);
        }

        if (filters?.tags && filters.tags.length > 0) {
          // Match any of the provided tags
          query = query.overlaps("tags", filters.tags);
        }

        if (filters?.search) {
          query = query.ilike("caption", `%${filters.search}%`);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          console.error("Error fetching photos:", fetchError);
          setError(fetchError.message);
          return;
        }

        const photosWithUploader = (data || []) as PhotoWithUploader[];

        if (page === 0) {
          setPhotos(photosWithUploader);
        } else {
          setPhotos((prev) => [...prev, ...photosWithUploader]);
        }

        setHasMore(photosWithUploader.length === PAGE_SIZE);
      } catch (err) {
        console.error("Unexpected error fetching photos:", err);
        setError("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  /**
   * Fetch all photos for a specific task
   */
  const fetchTaskPhotos = useCallback(
    async (taskId: string): Promise<PhotoWithUploader[]> => {
      try {
        const { data, error: fetchError } = await supabase
          .from("photos")
          .select(
            `
            *,
            uploader:profiles!photos_uploaded_by_fkey (
              id,
              full_name,
              display_name,
              avatar_url
            )
          `
          )
          .eq("task_id", taskId)
          .order("created_at", { ascending: true })
          .limit(50); // Limit photos per task

        if (fetchError) {
          console.error("Error fetching task photos:", fetchError);
          return [];
        }

        return (data || []) as PhotoWithUploader[];
      } catch (err) {
        console.error("Unexpected error fetching task photos:", err);
        return [];
      }
    },
    [supabase]
  );

  /**
   * Fetch photos for a specific zone (newest first)
   */
  const fetchZonePhotos = useCallback(
    async (zoneId: string, limit?: number): Promise<PhotoWithUploader[]> => {
      try {
        let query = supabase
          .from("photos")
          .select(
            `
            *,
            uploader:profiles!photos_uploaded_by_fkey (
              id,
              full_name,
              display_name,
              avatar_url
            )
          `
          )
          .eq("zone_id", zoneId)
          .order("created_at", { ascending: false });

        if (limit) {
          query = query.limit(limit);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          console.error("Error fetching zone photos:", fetchError);
          return [];
        }

        return (data || []) as PhotoWithUploader[];
      } catch (err) {
        console.error("Unexpected error fetching zone photos:", err);
        return [];
      }
    },
    [supabase]
  );

  /**
   * Fetch zone timeline (chronological order for condition tracking)
   */
  const fetchZoneTimeline = useCallback(
    async (zoneId: string): Promise<PhotoWithUploader[]> => {
      try {
        const { data, error: fetchError } = await supabase
          .from("photos")
          .select(
            `
            *,
            uploader:profiles!photos_uploaded_by_fkey (
              id,
              full_name,
              display_name,
              avatar_url
            )
          `
          )
          .eq("zone_id", zoneId)
          .order("created_at", { ascending: true })
          .limit(100); // Limit timeline photos

        if (fetchError) {
          console.error("Error fetching zone timeline:", fetchError);
          return [];
        }

        return (data || []) as PhotoWithUploader[];
      } catch (err) {
        console.error("Unexpected error fetching zone timeline:", err);
        return [];
      }
    },
    [supabase]
  );

  /**
   * Upload a photo and create the database record
   */
  const uploadAndCreatePhoto = useCallback(
    async (
      file: File | Blob,
      metadata: PhotoMetadata,
      userId: string
    ): Promise<Photo> => {
      // Upload main photo
      let uploadResult;
      try {
        if (file instanceof File) {
          uploadResult = await uploadPhoto(file, userId);
        } else {
          uploadResult = await uploadPhotoFromBlob(file, userId, "jpg");
        }
      } catch (uploadErr) {
        console.error("Photo upload failed:", uploadErr);
        throw new Error(`Photo upload failed: ${uploadErr instanceof Error ? uploadErr.message : "Unknown error"}`);
      }

      // Generate and upload thumbnail
      let thumbnailPath: string | null = null;
      try {
        const thumbnailBlob = await generateThumbnail(file);
        const thumbnailResult = await uploadThumbnail(thumbnailBlob, userId);
        thumbnailPath = thumbnailResult.storagePath;
      } catch (thumbErr) {
        console.warn("Failed to create thumbnail:", thumbErr);
        // Continue without thumbnail
      }

      // Try to extract GPS from EXIF or browser
      let gpsLat: number | null = null;
      let gpsLng: number | null = null;

      try {
        if (file instanceof File) {
          const gps = await getGPSWithFallback(file);
          if (gps) {
            gpsLat = gps.lat;
            gpsLng = gps.lng;
          }
        } else {
          // For blobs (camera captures), try browser geolocation
          const { getBrowserGeolocation } = await import("@/lib/utils/exif");
          const gps = await getBrowserGeolocation();
          if (gps) {
            gpsLat = gps.lat;
            gpsLng = gps.lng;
          }
        }
      } catch (gpsErr) {
        console.warn("GPS extraction failed:", gpsErr);
        // Continue without GPS
      }

      // Try to extract datetime from EXIF
      const exifMetadata: Record<string, unknown> = {};
      if (file instanceof File) {
        try {
          const dateTime = await extractDateTime(file);
          if (dateTime) {
            exifMetadata.originalDateTime = dateTime.toISOString();
          }
        } catch {
          // Continue without EXIF datetime
        }
      }

      // Insert database record
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: insertError } = await (supabase as any)
        .from("photos")
        .insert({
          storage_path: uploadResult.storagePath,
          thumbnail_path: thumbnailPath,
          uploaded_by: userId,
          task_id: metadata.taskId || null,
          zone_id: metadata.zoneId || null,
          photo_type: metadata.photoType,
          caption: metadata.caption || null,
          gps_lat: gpsLat,
          gps_lng: gpsLng,
          tags: metadata.tags || [],
          metadata: Object.keys(exifMetadata).length > 0 ? exifMetadata : null,
        })
        .select()
        .single() as { data: Photo | null; error: Error | null };

      if (insertError || !data) {
        // Try to clean up uploaded files on failure
        try {
          await deletePhotoFromStorage(uploadResult.storagePath);
          if (thumbnailPath) {
            await deletePhotoFromStorage(thumbnailPath);
          }
        } catch {
          // Ignore cleanup errors
        }
        throw new Error(`Failed to create photo record: ${insertError?.message || "No data returned"}`);
      }

      return data;
    },
    [supabase]
  );

  /**
   * Update a photo's metadata
   */
  const updatePhoto = useCallback(
    async (
      id: string,
      data: {
        caption?: string;
        tags?: string[];
        zone_id?: string;
        photo_type?: PhotoType;
      }
    ): Promise<Photo | null> => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: updated, error: updateError } = await (supabase as any)
          .from("photos")
          .update(data)
          .eq("id", id)
          .select()
          .single() as { data: Photo | null; error: Error | null };

        if (updateError) {
          console.error("Error updating photo:", updateError);
          setError(updateError.message);
          return null;
        }

        // Update local state
        if (updated) {
          setPhotos((prev) =>
            prev.map((p) => (p.id === id ? { ...p, ...updated } : p))
          );
        }

        return updated;
      } catch (err) {
        console.error("Unexpected error updating photo:", err);
        setError("An unexpected error occurred");
        return null;
      }
    },
    [supabase]
  );

  /**
   * Delete a photo and its storage files
   */
  const deletePhoto = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        // First get the photo to know storage paths
        const { data: photo, error: fetchError } = await supabase
          .from("photos")
          .select("storage_path, thumbnail_path")
          .eq("id", id)
          .single() as { data: { storage_path: string; thumbnail_path: string | null } | null; error: Error | null };

        if (fetchError || !photo) {
          console.error("Error fetching photo for deletion:", fetchError);
          setError(fetchError?.message || "Photo not found");
          return false;
        }

        // Delete from storage
        try {
          await deletePhotoFromStorage(photo.storage_path);
          if (photo.thumbnail_path) {
            await deletePhotoFromStorage(photo.thumbnail_path);
          }
        } catch (storageErr) {
          console.warn("Error deleting from storage:", storageErr);
          // Continue with database deletion
        }

        // Delete database record
        const { error: deleteError } = await supabase
          .from("photos")
          .delete()
          .eq("id", id);

        if (deleteError) {
          console.error("Error deleting photo record:", deleteError);
          setError(deleteError.message);
          return false;
        }

        // Update local state
        setPhotos((prev) => prev.filter((p) => p.id !== id));

        return true;
      } catch (err) {
        console.error("Unexpected error deleting photo:", err);
        setError("An unexpected error occurred");
        return false;
      }
    },
    [supabase]
  );

  /**
   * Get the public URL for a photo
   */
  const getPhotoUrl = useCallback((photo: Photo): string => {
    return getPublicUrl(photo.storage_path);
  }, []);

  /**
   * Get the thumbnail URL for a photo
   */
  const getThumbnailUrl = useCallback((photo: Photo): string | null => {
    if (!photo.thumbnail_path) return null;
    return getPublicUrl(photo.thumbnail_path);
  }, []);

  /**
   * Clear the photos array
   */
  const clearPhotos = useCallback(() => {
    setPhotos([]);
    setHasMore(true);
    setError(null);
  }, []);

  return {
    photos,
    loading,
    error,
    hasMore,
    fetchPhotos,
    fetchTaskPhotos,
    fetchZonePhotos,
    fetchZoneTimeline,
    uploadAndCreatePhoto,
    updatePhoto,
    deletePhoto,
    getPhotoUrl,
    getThumbnailUrl,
    clearPhotos,
  };
}

// Photo type labels for UI
export const photoTypeLabels: Record<PhotoType, string> = {
  before: "Before",
  after: "After",
  condition: "Condition",
  problem: "Problem",
  completed_work: "Completed Work",
  equipment: "Equipment",
  safety: "Safety",
  other: "Other",
};

// Photo type colors for UI
export const photoTypeColors: Record<PhotoType, string> = {
  before: "#3b82f6", // Blue
  after: "#22c55e", // Green
  condition: "#8b5cf6", // Violet
  problem: "#ef4444", // Red
  completed_work: "#10b981", // Emerald
  equipment: "#f59e0b", // Amber
  safety: "#f97316", // Orange
  other: "#6b7280", // Gray
};
