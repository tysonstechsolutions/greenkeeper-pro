"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type MeasurementType = "green" | "moss" | "disease" | "damage" | "other";

export interface GreenMeasurement {
  id: string;
  hole_number: number;
  measurement_type: MeasurementType;
  label: string | null;
  geojson: {
    type: "Polygon";
    coordinates: number[][][];
  };
  area_sq_ft: number;
  perimeter_ft: number | null;
  photo_url: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useGreenMeasurements(holeNumber: number | null) {
  const supabase = createClient();
  const [items, setItems] = useState<GreenMeasurement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (holeNumber == null) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("green_measurements")
      .select("*")
      .eq("hole_number", holeNumber)
      .order("created_at", { ascending: false });
    if (err) setError(err.message);
    else setItems((data as GreenMeasurement[]) ?? []);
    setLoading(false);
  }, [holeNumber, supabase]);

  useEffect(() => {
    // Lint: setState-in-effect. This hook is the data-fetching boundary —
    // the initial fetch genuinely has to run in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
  }, [refetch]);

  const create = useCallback(
    async (input: {
      hole_number: number;
      measurement_type: MeasurementType;
      label?: string | null;
      coordinates: [number, number][]; // GeoJSON ring
      area_sq_ft: number;
      perimeter_ft?: number;
      notes?: string;
      created_by?: string | null;
    }): Promise<GreenMeasurement | null> => {
      setError(null);
      const { data, error: err } = await supabase
        .from("green_measurements")
        .insert({
          hole_number: input.hole_number,
          measurement_type: input.measurement_type,
          label: input.label ?? null,
          geojson: { type: "Polygon", coordinates: [input.coordinates] },
          area_sq_ft: input.area_sq_ft,
          perimeter_ft: input.perimeter_ft ?? null,
          notes: input.notes ?? null,
          created_by: input.created_by ?? null,
        })
        .select()
        .single();
      if (err) {
        setError(err.message);
        return null;
      }
      const created = data as GreenMeasurement;
      setItems((prev) => [created, ...prev]);
      return created;
    },
    [supabase]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);
      const { error: err } = await supabase
        .from("green_measurements")
        .delete()
        .eq("id", id);
      if (err) {
        setError(err.message);
        return false;
      }
      setItems((prev) => prev.filter((m) => m.id !== id));
      return true;
    },
    [supabase]
  );

  const totals = items.reduce(
    (acc, m) => {
      acc.byType[m.measurement_type] =
        (acc.byType[m.measurement_type] ?? 0) + Number(m.area_sq_ft);
      acc.total += Number(m.area_sq_ft);
      return acc;
    },
    { byType: {} as Record<MeasurementType, number>, total: 0 }
  );

  return { items, loading, error, refetch, create, remove, totals };
}
