"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Fy26Asset, Fy26AssetStatus, AssetDamageRecord, ConditionPhotoAngle, ConditionPhotos } from "@/types/fy26-assets";
import { uploadPhoto } from "@/lib/supabase/storage";
import {
  directPatchRow,
  directPatchRowReturning,
  directInsertRow,
  directSelectRow,
  directSelectList,
  directDeleteRow,
} from "@/lib/supabase/rest";
import { recordBreadcrumb } from "@/lib/debug/breadcrumbs";

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
  uploadConditionPhoto: (assetId: string, angle: ConditionPhotoAngle, file: File, userId: string, existing?: ConditionPhotos) => Promise<string | null>;
  fetchDamageRecords: (assetId: string) => Promise<AssetDamageRecord[]>;
  addDamageRecord: (assetId: string, record: { damage_date: string; description: string; photos: string[]; reported_by?: string }) => Promise<AssetDamageRecord | null>;
  deleteDamageRecord: (recordId: string) => Promise<boolean>;
  uploadDamagePhoto: (file: File, userId: string) => Promise<string | null>;
  stats: Fy26AssetStats;
  refetch: () => Promise<void>;
}

export function useFy26Assets(): UseFy26AssetsReturn {
  const [assets, setAssets] = useState<Fy26Asset[]>([]);
  // Status-agnostic cache for computing filter counts (so "No Tag" chip
  // doesn't zero out every other chip). Kept in sync with site/search
  // filters but never filtered by status.
  const [allStatusAssets, setAllStatusAssets] = useState<Fy26Asset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonically increasing id for the side-query that refreshes
  // allStatusAssets. Rapid filter toggles fire multiple status-agnostic
  // queries out of order; we record the latest id at dispatch and only
  // apply a result if it's still the latest when it resolves.
  const statsReqIdRef = useRef(0);

  // Build PostgREST filter strings + `or=` clause for the asset list.
  // Shared between the main query and the stats-cache side query.
  function buildAssetFilters(filters?: Fy26AssetFilters): {
    filters: string[];
    or?: string;
  } {
    const f: string[] = [];
    let or: string | undefined;
    if (filters?.site) f.push(`site=eq.${encodeURIComponent(filters.site)}`);
    if (filters?.status) f.push(`status=eq.${encodeURIComponent(filters.status)}`);
    if (filters?.search && filters.search.trim()) {
      const term = filters.search.trim();
      const encTerm = encodeURIComponent(`%${term}%`);
      or = [
        `description.ilike.${encTerm}`,
        `asset_number.ilike.${encTerm}`,
        `serial_number.ilike.${encTerm}`,
        `model_text.ilike.${encTerm}`,
        `manufacturer.ilike.${encTerm}`,
        `license_plate.ilike.${encTerm}`,
      ].join(",");
    }
    return { filters: f, or };
  }

  const fetchAssets = useCallback(
    async (filters?: Fy26AssetFilters): Promise<Fy26Asset[]> => {
      setLoading(true);
      setError(null);

      try {
        const { filters: rawFilters, or } = buildAssetFilters(filters);
        const items = await directSelectList<Fy26Asset>("fy26_assets", {
          columns: "*",
          filters: rawFilters,
          or,
          orderBy: [
            { column: "site", ascending: true },
            { column: "asset_number", ascending: true },
          ],
          label: "fetchAssets",
        });

        setAssets(items);

        // Stats cache: if no status filter was applied, the result
        // already covers every status under the current site/search
        // scope — reuse it. Otherwise fire a separate status-agnostic
        // query for the counts, race-guarded by a monotonic id so only
        // the latest result wins.
        if (!filters?.status) {
          setAllStatusAssets(items);
          statsReqIdRef.current++;
        } else {
          const reqId = ++statsReqIdRef.current;
          const { filters: statsRawFilters, or: statsOr } = buildAssetFilters({
            site: filters.site,
            search: filters.search,
          });
          directSelectList<Fy26Asset>("fy26_assets", {
            columns: "*",
            filters: statsRawFilters,
            or: statsOr,
            label: "fetchAssets:stats",
          }).then(
            (statsData) => {
              if (reqId !== statsReqIdRef.current) return;
              setAllStatusAssets(statsData);
            },
            (err) => {
              if (reqId !== statsReqIdRef.current) return;
              console.warn("[useFy26Assets] stats query failed:", err);
            },
          );
        }

        return items;
      } catch (err) {
        console.error("[useFy26Assets] fetchAssets error:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch assets");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchAssetItem = useCallback(
    async (id: string): Promise<Fy26Asset | null> => {
      setError(null);
      try {
        const row = await directSelectRow<Fy26Asset>(
          "fy26_assets",
          "id",
          id,
          "*",
          "fetchAssetItem",
        );
        return row;
      } catch (err) {
        console.error("[useFy26Assets] fetchAssetItem error:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch asset");
        return null;
      }
    },
    [],
  );

  const updateStatus = useCallback(
    async (
      id: string,
      status: Fy26AssetStatus,
      notes?: string,
    ): Promise<Fy26Asset | null> => {
      setError(null);
      try {
        const updateFields: Partial<Fy26Asset> = {
          status,
          verified_at: new Date().toISOString(),
        };
        if (notes !== undefined) updateFields.notes = notes;

        const updated = await directPatchRowReturning<Fy26Asset>(
          "fy26_assets",
          "id",
          id,
          updateFields,
          "updateStatus",
        );
        setAssets((prev) => prev.map((a) => (a.id === id ? updated : a)));
        return updated;
      } catch (err) {
        console.error("[useFy26Assets] updateStatus error:", err);
        setError(err instanceof Error ? err.message : "Failed to update status");
        return null;
      }
    },
    [],
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
        void _id;
        void _ca;
        void _ua;

        const updated = await directPatchRowReturning<Fy26Asset>(
          "fy26_assets",
          "id",
          id,
          updateFields,
          "updateAsset",
        );
        setAssets((prev) => prev.map((a) => (a.id === id ? updated : a)));
        return updated;
      } catch (err) {
        console.error("[useFy26Assets] updateAsset error:", err);
        setError(err instanceof Error ? err.message : "Failed to update asset");
        return null;
      }
    },
    [],
  );

  // ── Condition photo upload (front/back/left/right) ─────────────────────

  const uploadConditionPhoto = useCallback(
    async (
      assetId: string,
      angle: ConditionPhotoAngle,
      file: File,
      userId: string,
      existing: ConditionPhotos = {},
    ): Promise<string | null> => {
      // Step 1: upload the image to Storage. Throws on failure so the
      // caller can surface the real error.
      const result = await uploadPhoto(file, userId);
      const url = result.publicUrl;
      recordBreadcrumb(
        "lifecycle",
        `uploadConditionPhoto: storage OK, updating fy26_assets.${angle}`,
      );

      // Step 2: merge client-side (no pre-update SELECT round trip) and
      // PATCH via direct PostgREST fetch. This bypasses supabase-js's
      // query builder, which was hanging silently after Storage uploads
      // on this WebView — the builder's internal await never fired
      // window.fetch, so nothing timed out and nothing errored. Direct
      // fetch + AbortController + breadcrumbs makes every failure mode
      // visible.
      const updated: ConditionPhotos = { ...existing, [angle]: url };
      await directPatchRow(
        "fy26_assets",
        "id",
        assetId,
        { condition_photos: updated },
        `uploadConditionPhoto:${angle}`,
      );

      recordBreadcrumb(
        "lifecycle",
        `uploadConditionPhoto: ${angle} linked to asset ${assetId}`,
      );
      return url;
    },
    []
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
        return await directSelectList<AssetDamageRecord>(
          "asset_damage_records",
          {
            columns: "*",
            filters: [`asset_id=eq.${encodeURIComponent(assetId)}`],
            orderBy: [{ column: "created_at", ascending: false }],
            label: "fetchDamageRecords",
          },
        );
      } catch (err) {
        console.error("[useFy26Assets] fetchDamageRecords error:", err);
        return [];
      }
    },
    [],
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
        // Direct PostgREST INSERT — bypasses supabase-js query builder
        // which has been hanging after Storage uploads on this WebView.
        const data = await directInsertRow<AssetDamageRecord>(
          "asset_damage_records",
          {
            asset_id: assetId,
            damage_date: record.damage_date,
            description: record.description,
            photos: record.photos,
            reported_by: record.reported_by || null,
          },
          "addDamageRecord",
        );
        return data;
      } catch (err) {
        console.error("[useFy26Assets] addDamageRecord error:", err);
        setError(err instanceof Error ? err.message : "Failed to add damage record");
        return null;
      }
    },
    []
  );

  const deleteDamageRecord = useCallback(
    async (recordId: string): Promise<boolean> => {
      try {
        await directDeleteRow(
          "asset_damage_records",
          "id",
          recordId,
          "deleteDamageRecord",
        );
        return true;
      } catch (err) {
        console.error("[useFy26Assets] deleteDamageRecord error:", err);
        return false;
      }
    },
    []
  );

  const refetch = useCallback(async () => {
    await fetchAssets();
  }, [fetchAssets]);

  // Initial load
  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  // Stats derived from the STATUS-AGNOSTIC cache so each chip shows the
  // true total for its status even when another filter chip is active.
  // Previously these were derived from `assets` (the filtered list), which
  // made every chip except the active one drop to 0.
  const statsSource = allStatusAssets.length > 0 ? allStatusAssets : assets;
  const stats: Fy26AssetStats = {
    total: statsSource.length,
    unverified: statsSource.filter((a) => a.status === "unverified").length,
    verified_present: statsSource.filter((a) => a.status === "verified_present").length,
    mia: statsSource.filter((a) => a.status === "mia").length,
    disposed: statsSource.filter((a) => a.status === "disposed").length,
    no_asset_tag: statsSource.filter((a) => a.status === "no_asset_tag").length,
    needs_disposed: statsSource.filter((a) => a.status === "needs_disposed").length,
    total_value: statsSource.reduce((sum, a) => sum + (Number(a.original_value) || 0), 0),
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
