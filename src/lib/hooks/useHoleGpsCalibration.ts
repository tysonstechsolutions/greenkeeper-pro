"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  directSelectList,
  directInsertRow,
  directDeleteByFilter,
} from "@/lib/supabase/rest";
import { useAuth } from "./useAuth";
import type {
  HoleGpsCalibration,
  HoleGpsSurfaceType,
} from "@/types/database";

/**
 * Per-(hole, surface) GPS calibration. Each calibration row stores two
 * reference points so a phone's real-world GPS reading can be mapped onto
 * the image's 0-1 coordinate system. See gps-to-pixel.ts for the math.
 *
 * Usage:
 *   const { calibration, loading, save, clear } =
 *     useHoleGpsCalibration(holeNumber, "hole");
 */
export function useHoleGpsCalibration(
  holeNumber: number,
  surfaceType: HoleGpsSurfaceType,
) {
  const { user } = useAuth();
  const [calibration, setCalibration] = useState<HoleGpsCalibration | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCalibration = useCallback(async () => {
    if (!Number.isFinite(holeNumber) || holeNumber < 1 || holeNumber > 18) {
      setCalibration(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await directSelectList<HoleGpsCalibration>(
        "hole_gps_calibrations",
        {
          columns: "*",
          filters: [
            `hole_number=eq.${holeNumber}`,
            `surface_type=eq.${surfaceType}`,
          ],
          limit: 1,
          label: "useHoleGpsCalibration.fetch",
        },
      );
      setCalibration(rows[0] ?? null);
    } catch (err) {
      console.error("Fetch hole GPS calibration error:", err);
      setError("Failed to load calibration");
      setCalibration(null);
    } finally {
      setLoading(false);
    }
  }, [holeNumber, surfaceType]);

  useEffect(() => {
    fetchCalibration();
  }, [fetchCalibration]);

  /**
   * Save a new calibration. Because there's a unique constraint on
   * (hole_number, surface_type), we delete-then-insert rather than using
   * PostgREST's merge-duplicates upsert — keeps the row IDs and
   * calibrated_at fresh on every recalibration, which is what an admin
   * usually wants.
   */
  const save = useCallback(
    async (input: {
      p1_lat: number;
      p1_lng: number;
      p1_x: number;
      p1_y: number;
      p2_lat: number;
      p2_lng: number;
      p2_x: number;
      p2_y: number;
    }): Promise<HoleGpsCalibration | null> => {
      if (!user) {
        setError("Sign in required to calibrate.");
        return null;
      }
      setSaving(true);
      setError(null);
      try {
        // Clear any prior calibration for this hole+surface so the unique
        // constraint can't trip the insert.
        await directDeleteByFilter(
          "hole_gps_calibrations",
          [
            `hole_number=eq.${holeNumber}`,
            `surface_type=eq.${surfaceType}`,
          ],
          "useHoleGpsCalibration.save:clear",
        ).catch(() => {
          // Missing row is fine — DELETE with no matches is not an error
          // in PostgREST, but we swallow any unexpected hiccup here too.
        });

        const inserted = await directInsertRow<HoleGpsCalibration>(
          "hole_gps_calibrations",
          {
            hole_number: holeNumber,
            surface_type: surfaceType,
            p1_lat: input.p1_lat,
            p1_lng: input.p1_lng,
            p1_x: input.p1_x,
            p1_y: input.p1_y,
            p2_lat: input.p2_lat,
            p2_lng: input.p2_lng,
            p2_x: input.p2_x,
            p2_y: input.p2_y,
            calibrated_by: user.id,
          },
          "useHoleGpsCalibration.save:insert",
        );
        setCalibration(inserted);
        return inserted;
      } catch (err) {
        console.error("Save hole GPS calibration error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to save calibration",
        );
        return null;
      } finally {
        setSaving(false);
      }
    },
    [user, holeNumber, surfaceType],
  );

  const clear = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      await directDeleteByFilter(
        "hole_gps_calibrations",
        [
          `hole_number=eq.${holeNumber}`,
          `surface_type=eq.${surfaceType}`,
        ],
        "useHoleGpsCalibration.clear",
      );
      setCalibration(null);
      return true;
    } catch (err) {
      console.error("Clear hole GPS calibration error:", err);
      setError("Failed to clear calibration");
      return false;
    } finally {
      setSaving(false);
    }
  }, [holeNumber, surfaceType]);

  const isCalibrated = useMemo(() => !!calibration, [calibration]);

  return {
    calibration,
    isCalibrated,
    loading,
    saving,
    error,
    save,
    clear,
    refetch: fetchCalibration,
  };
}
