"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Fy26Asset, Fy26AssetStatus } from "@/types/fy26-assets";

export interface Fy26AssetFilters {
  site?: string;           // '7009' | '7010'
  status?: Fy26AssetStatus;
  search?: string;         // matches description / asset_number / serial / model / manufacturer
}

export interface Fy26AssetStats {
  total: number;
  unverified: number;
  verified_present: number;
  mia: number;
  disposed: number;
  total_value: number;
}

interface UseFy26AssetsReturn {
  assets: Fy26Asset[];
  loading: boolean;
  error: string | null;
  fetchAssets: (filters?: Fy26AssetFilters) => Promise<Fy26Asset[]>;
  fetchAssetItem: (id: string) => Promise<Fy26Asset | null>;
  updateStatus: (id: string, status: Fy26AssetStatus, notes?: string) => Promise<Fy26Asset | null>;
  updateAsset: (id: string, data: Partial<Fy26Asset>) => Promise<Fy26Asset | null>;
  stats: Fy26AssetStats;
  refetch: () => Promise<void>;
}

export function useFy26Assets(): UseFy26AssetsReturn {
  const [assets, setAssets] = useState<Fy26Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchAssets = useCallback(
    async (filters?: Fy26AssetFilters): Promise<Fy26Asset[]> => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from("fy26_assets")
          .select("*")
          .order("site", { ascending: true })
          .order("asset_number", { ascending: true });

        if (filters?.site) query = query.eq("site", filters.site);
        if (filters?.status) query = query.eq("status", filters.status);
        if (filters?.search && filters.search.trim()) {
          const term = `%${filters.search.trim()}%`;
          query = query.or(
            `description.ilike.${term},asset_number.ilike.${term},serial_number.ilike.${term},model_text.ilike.${term},manufacturer.ilike.${term},license_plate.ilike.${term}`
          );
        }

        const { data, error: fetchError } = await query;
        if (fetchError) throw new Error(fetchError.message);

        const items = (data as Fy26Asset[]) || [];
        setAssets(items);
        return items;
      } catch (err) {
        console.error("[useFy26Assets] fetchAssets error:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch assets");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  const fetchAssetItem = useCallback(
    async (id: string): Promise<Fy26Asset | null> => {
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from("fy26_assets")
          .select("*")
          .eq("id", id)
          .single();

        if (fetchError) throw new Error(fetchError.message);
        return data as Fy26Asset;
      } catch (err) {
        console.error("[useFy26Assets] fetchAssetItem error:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch asset");
        return null;
      }
    },
    [supabase]
  );

  const updateStatus = useCallback(
    async (
      id: string,
      status: Fy26AssetStatus,
      notes?: string
    ): Promise<Fy26Asset | null> => {
      setError(null);
      try {
        const updateFields: Partial<Fy26Asset> = {
          status,
          verified_at: new Date().toISOString(),
        };
        if (notes !== undefined) updateFields.notes = notes;

        const { data, error: updateError } = await supabase
          .from("fy26_assets")
          .update(updateFields)
          .eq("id", id)
          .select()
          .single();

        if (updateError) throw new Error(updateError.message);

        const updated = data as Fy26Asset;
        setAssets((prev) => prev.map((a) => (a.id === id ? updated : a)));
        return updated;
      } catch (err) {
        console.error("[useFy26Assets] updateStatus error:", err);
        setError(err instanceof Error ? err.message : "Failed to update status");
        return null;
      }
    },
    [supabase]
  );

  const updateAsset = useCallback(
    async (id: string, data: Partial<Fy26Asset>): Promise<Fy26Asset | null> => {
      setError(null);
      try {
        // Strip read-only fields
        const {
          id: _id,
          created_at: _ca,
          updated_at: _ua,
          ...updateFields
        } = data as Partial<Fy26Asset>;
        void _id; void _ca; void _ua;

        const { data: updated, error: updateError } = await supabase
          .from("fy26_assets")
          .update(updateFields)
          .eq("id", id)
          .select()
          .single();

        if (updateError) throw new Error(updateError.message);

        const newItem = updated as Fy26Asset;
        setAssets((prev) => prev.map((a) => (a.id === id ? newItem : a)));
        return newItem;
      } catch (err) {
        console.error("[useFy26Assets] updateAsset error:", err);
        setError(err instanceof Error ? err.message : "Failed to update asset");
        return null;
      }
    },
    [supabase]
  );

  const refetch = useCallback(async () => {
    await fetchAssets();
  }, [fetchAssets]);

  // Initial load
  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Stats derived from current in-memory list
  const stats: Fy26AssetStats = {
    total: assets.length,
    unverified: assets.filter((a) => a.status === "unverified").length,
    verified_present: assets.filter((a) => a.status === "verified_present").length,
    mia: assets.filter((a) => a.status === "mia").length,
    disposed: assets.filter((a) => a.status === "disposed").length,
    total_value: assets.reduce((sum, a) => sum + (Number(a.original_value) || 0), 0),
  };

  return {
    assets,
    loading,
    error,
    fetchAssets,
    fetchAssetItem,
    updateStatus,
    updateAsset,
    stats,
    refetch,
  };
}
