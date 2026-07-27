"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { directSelectAll } from "@/lib/supabase/rest";
import { analyseFleet, type FleetAnalysis, type FleetUnitInput } from "./gap-analysis";

interface EquipmentRow {
  id: string;
  name: string | null;
  status: string | null;
}

interface AssetRow {
  equipment_id: string | null;
  description: string | null;
  original_value: number | string | null;
}

interface UseFleetReadiness {
  analysis: FleetAnalysis | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Load the equipment register and its DPAS money, and run the gap analysis.
 *
 * Two small tables (117 and 211 rows today) — no windowing needed, but both
 * are read with the paging helper so a growing register cannot silently
 * truncate at a page boundary.
 */
export function useFleetReadiness(): UseFleetReadiness {
  const { session } = useAuth();
  const ready = !!session?.access_token;
  const [equipment, setEquipment] = useState<EquipmentRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [equipmentRows, assetRows] = await Promise.all([
          directSelectAll<EquipmentRow>("equipment", {
            columns: "id,name,status",
            orderBy: [{ column: "name" }, { column: "id" }],
            label: "fleet-readiness.equipment",
          }),
          directSelectAll<AssetRow>("fy26_assets", {
            columns: "equipment_id,description,original_value",
            filters: ["equipment_id=not.is.null"],
            orderBy: [{ column: "equipment_id" }],
            label: "fleet-readiness.assets",
          }),
        ]);
        if (cancelled) return;
        setEquipment(equipmentRows);
        setAssets(assetRows);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Couldn't load the equipment register.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, nonce]);

  const analysis = useMemo(() => {
    if (equipment.length === 0) return null;
    const assetByEquipment = new Map<string, AssetRow>();
    for (const asset of assets) {
      if (asset.equipment_id && !assetByEquipment.has(asset.equipment_id)) {
        assetByEquipment.set(asset.equipment_id, asset);
      }
    }
    const units: FleetUnitInput[] = equipment.map((row) => {
      const asset = assetByEquipment.get(row.id);
      return {
        id: row.id,
        name: row.name,
        status: row.status,
        description: asset?.description ?? null,
        originalValue: asset?.original_value ?? null,
      };
    });
    return analyseFleet(units);
  }, [equipment, assets]);

  return { analysis, loading, error, reload };
}
