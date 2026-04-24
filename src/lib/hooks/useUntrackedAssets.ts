"use client";

import { useCallback, useState } from "react";
import {
  directSelectList,
  directSelectRow,
  directInsertRow,
  directPatchRowReturning,
  directDeleteRow,
} from "@/lib/supabase/rest";
import { uploadPhoto } from "@/lib/supabase/storage";
import type {
  UntrackedAsset,
  UntrackedAssetCategory,
} from "@/types/untracked-assets";

export interface UntrackedAssetFilters {
  category?: UntrackedAssetCategory;
  search?: string; // matches name / manufacturer / model / serial
}

export interface CreateUntrackedAssetInput {
  name: string;
  category: UntrackedAssetCategory;
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;
  location?: string | null;
  notes?: string | null;
  photos?: string[];
  created_by?: string | null;
}

export function useUntrackedAssets() {
  const [assets, setAssets] = useState<UntrackedAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = useCallback(
    async (filters?: UntrackedAssetFilters): Promise<UntrackedAsset[]> => {
      setLoading(true);
      setError(null);
      try {
        const f: string[] = [];
        let or: string | undefined;
        if (filters?.category) {
          f.push(`category=eq.${encodeURIComponent(filters.category)}`);
        }
        if (filters?.search && filters.search.trim()) {
          const encTerm = encodeURIComponent(`%${filters.search.trim()}%`);
          or = [
            `name.ilike.${encTerm}`,
            `manufacturer.ilike.${encTerm}`,
            `model.ilike.${encTerm}`,
            `serial_number.ilike.${encTerm}`,
          ].join(",");
        }

        const items = await directSelectList<UntrackedAsset>(
          "untracked_assets",
          {
            columns: "*",
            filters: f,
            or,
            orderBy: [{ column: "created_at", ascending: false }],
            label: "fetchUntrackedAssets",
          },
        );
        setAssets(items);
        return items;
      } catch (err) {
        console.error("[useUntrackedAssets] fetchAssets:", err);
        setError(err instanceof Error ? err.message : "Failed to load");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchOne = useCallback(
    async (id: string): Promise<UntrackedAsset | null> => {
      try {
        return await directSelectRow<UntrackedAsset>(
          "untracked_assets",
          "id",
          id,
          "*",
          "fetchUntrackedAsset",
        );
      } catch (err) {
        console.error("[useUntrackedAssets] fetchOne:", err);
        return null;
      }
    },
    [],
  );

  const createAsset = useCallback(
    async (input: CreateUntrackedAssetInput): Promise<UntrackedAsset | null> => {
      setError(null);
      try {
        const row = await directInsertRow<UntrackedAsset>(
          "untracked_assets",
          {
            name: input.name,
            category: input.category,
            manufacturer: input.manufacturer ?? null,
            model: input.model ?? null,
            serial_number: input.serial_number ?? null,
            location: input.location ?? null,
            notes: input.notes ?? null,
            photos: input.photos ?? [],
            created_by: input.created_by ?? null,
          },
          "createUntrackedAsset",
        );
        setAssets((prev) => [row, ...prev]);
        return row;
      } catch (err) {
        console.error("[useUntrackedAssets] createAsset:", err);
        setError(err instanceof Error ? err.message : "Failed to create");
        return null;
      }
    },
    [],
  );

  const updateAsset = useCallback(
    async (
      id: string,
      patch: Partial<Omit<UntrackedAsset, "id" | "created_at" | "updated_at">>,
    ): Promise<UntrackedAsset | null> => {
      setError(null);
      try {
        const row = await directPatchRowReturning<UntrackedAsset>(
          "untracked_assets",
          "id",
          id,
          patch as Record<string, unknown>,
          "updateUntrackedAsset",
        );
        setAssets((prev) => prev.map((a) => (a.id === id ? row : a)));
        return row;
      } catch (err) {
        console.error("[useUntrackedAssets] updateAsset:", err);
        setError(err instanceof Error ? err.message : "Failed to update");
        return null;
      }
    },
    [],
  );

  const deleteAsset = useCallback(async (id: string): Promise<boolean> => {
    try {
      await directDeleteRow("untracked_assets", "id", id, "deleteUntrackedAsset");
      setAssets((prev) => prev.filter((a) => a.id !== id));
      return true;
    } catch (err) {
      console.error("[useUntrackedAssets] deleteAsset:", err);
      return false;
    }
  }, []);

  /** Upload a photo and return its public URL. Caller can then add it to
   *  the asset's `photos` array via updateAsset. */
  const uploadAssetPhoto = useCallback(
    async (file: File, userId: string): Promise<string | null> => {
      try {
        const { publicUrl } = await uploadPhoto(file, userId);
        return publicUrl;
      } catch (err) {
        console.error("[useUntrackedAssets] uploadAssetPhoto:", err);
        setError(err instanceof Error ? err.message : "Photo upload failed");
        return null;
      }
    },
    [],
  );

  return {
    assets,
    loading,
    error,
    fetchAssets,
    fetchOne,
    createAsset,
    updateAsset,
    deleteAsset,
    uploadAssetPhoto,
  };
}
