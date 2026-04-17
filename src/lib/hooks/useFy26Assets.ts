"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Fy26Asset, Fy26AssetStatus, AssetDamageRecord, ConditionPhotoAngle, ConditionPhotos } from "@/types/fy26-assets";
import { uploadPhoto } from "@/lib/supabase/storage";

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
  no_asset_tag: number;
  needs_disposed: number;
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
  uploadConditionPhoto: (assetId: string, angle: ConditionPhotoAngle, file: File, userId: string) => Promise<string | null>;
  fetchDamageRecords: (assetId: string) => Promise<AssetDamageRecord[]>;
  addDamageRecord: (assetId: string, record: { damage_date: string; description: string; photos: string[]; reported_by?: string }) => Promise<AssetDamageRecord | null>;
  deleteDamageRecord: (recordId: string) => Promise<boolean>;
  uploadDamagePhoto: (file: File, userId: string) => Promise<string | null>;
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

  // ── Condition photo upload (front/back/left/right) ─────────────────────

  const uploadConditionPhoto = useCallback(
    async (
      assetId: string,
      angle: ConditionPhotoAngle,
      file: File,
      userId: string
    ): Promise<string | null> => {
      // Upload to storage — throw lets caller surface the exact error.
      const result = await uploadPhoto(file, userId);
      const url = result.publicUrl;

      // Fetch current photos to merge
      const { data: current, error: fetchErr } = await supabase
        .from("fy26_assets")
        .select("condition_photos")
        .eq("id", assetId)
        .single();

      if (fetchErr) {
        throw new Error(`Could not read existing photos: ${fetchErr.message}`);
      }

      const existing: ConditionPhotos =
        (current?.condition_photos as ConditionPhotos) || {};
      const updated = { ...existing, [angle]: url };

      const { error: updateErr } = await supabase
        .from("fy26_assets")
        .update({ condition_photos: updated })
        .eq("id", assetId);

      if (updateErr) {
        throw new Error(`Photo uploaded but DB update failed: ${updateErr.message}`);
      }

      return url;
    },
    [supabase]
  );

  // ── Damage photo upload (goes to photos bucket, returns URL) ──────────

  const uploadDamagePhoto = useCallback(
    async (file: File, userId: string): Promise<string | null> => {
      // Let callers see the real error; they surface it in the UI.
      const result = await uploadPhoto(file, userId);
      return result.publicUrl;
    },
    []
  );

  // ── Damage records CRUD ───────────────────────────────────────────────

  const fetchDamageRecords = useCallback(
    async (assetId: string): Promise<AssetDamageRecord[]> => {
      try {
        const { data, error: fetchError } = await supabase
          .from("asset_damage_records")
          .select("*")
          .eq("asset_id", assetId)
          .order("created_at", { ascending: false });

        if (fetchError) throw new Error(fetchError.message);
        return (data as AssetDamageRecord[]) || [];
      } catch (err) {
        console.error("[useFy26Assets] fetchDamageRecords error:", err);
        return [];
      }
    },
    [supabase]
  );

  const addDamageRecord = useCallback(
    async (
      assetId: string,
      record: {
        damage_date: string;
        description: string;
        photos: string[];
        reported_by?: string;
      }
    ): Promise<AssetDamageRecord | null> => {
      setError(null);
      try {
        const { data, error: insertError } = await supabase
          .from("asset_damage_records")
          .insert({
            asset_id: assetId,
            damage_date: record.damage_date,
            description: record.description,
            photos: record.photos,
            reported_by: record.reported_by || null,
          })
          .select()
          .single();

        if (insertError) throw new Error(insertError.message);
        return data as AssetDamageRecord;
      } catch (err) {
        console.error("[useFy26Assets] addDamageRecord error:", err);
        setError(err instanceof Error ? err.message : "Failed to add damage record");
        return null;
      }
    },
    [supabase]
  );

  const deleteDamageRecord = useCallback(
    async (recordId: string): Promise<boolean> => {
      try {
        const { error: deleteError } = await supabase
          .from("asset_damage_records")
          .delete()
          .eq("id", recordId);

        if (deleteError) throw new Error(deleteError.message);
        return true;
      } catch (err) {
        console.error("[useFy26Assets] deleteDamageRecord error:", err);
        return false;
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
    no_asset_tag: assets.filter((a) => a.status === "no_asset_tag").length,
    needs_disposed: assets.filter((a) => a.status === "needs_disposed").length,
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
    uploadConditionPhoto,
    fetchDamageRecords,
    addDamageRecord,
    deleteDamageRecord,
    uploadDamagePhoto,
    stats,
    refetch,
  };
}
