"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PinPosition } from "@/types/database";

export type CreatePinInput = Partial<PinPosition> & {
  date: string;
  hole_number: number;
  paces_from_front: number;
  paces_from_left: number;
};

export interface UsePinPositionsReturn {
  pins: PinPosition[];
  loading: boolean;
  error: string | null;
  fetchPinsByDate: (date: string) => Promise<PinPosition[]>;
  upsertPin: (pin: CreatePinInput) => Promise<PinPosition | null>;
  getTodayPins: () => Promise<PinPosition[]>;
  setBulkPins: (pins: CreatePinInput[]) => Promise<boolean>;
}

/**
 * Return today's date as an ISO `YYYY-MM-DD` string (local time).
 */
export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Validate a pin input. Returns an error string on failure, null on success.
 */
export function validatePin(pin: CreatePinInput): string | null {
  if (
    typeof pin.hole_number !== "number" ||
    pin.hole_number < 1 ||
    pin.hole_number > 18 ||
    !Number.isInteger(pin.hole_number)
  ) {
    return "hole_number must be an integer between 1 and 18";
  }
  if (
    typeof pin.paces_from_front !== "number" ||
    pin.paces_from_front < 0 ||
    pin.paces_from_front > 50
  ) {
    return "paces_from_front must be between 0 and 50";
  }
  if (
    typeof pin.paces_from_left !== "number" ||
    pin.paces_from_left < 0 ||
    pin.paces_from_left > 40
  ) {
    return "paces_from_left must be between 0 and 40";
  }
  if (!pin.date) {
    return "date is required";
  }
  if (
    pin.difficulty != null &&
    pin.difficulty !== "easy" &&
    pin.difficulty !== "medium" &&
    pin.difficulty !== "hard"
  ) {
    return "difficulty must be easy, medium, or hard";
  }
  return null;
}

export function usePinPositions(): UsePinPositionsReturn {
  const [pins, setPins] = useState<PinPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchPinsByDate = useCallback(
    async (date: string): Promise<PinPosition[]> => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchErr } = await supabase
          .from("pin_positions")
          .select("*")
          .eq("date", date)
          .order("hole_number", { ascending: true });

        if (fetchErr) {
          console.error("[usePinPositions] fetchPinsByDate error:", fetchErr);
          setError(fetchErr.message);
          return [];
        }

        const rows = (data as PinPosition[]) || [];
        setPins(rows);
        return rows;
      } catch (err) {
        console.error("[usePinPositions] fetchPinsByDate exception:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch pins");
        return [];
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  const upsertPin = useCallback(
    async (pin: CreatePinInput): Promise<PinPosition | null> => {
      setError(null);

      const validationError = validatePin(pin);
      if (validationError) {
        console.error("[usePinPositions] upsertPin validation:", validationError);
        setError(validationError);
        return null;
      }

      try {
        const payload = {
          date: pin.date,
          hole_number: pin.hole_number,
          paces_from_front: pin.paces_from_front,
          paces_from_left: pin.paces_from_left,
          difficulty: pin.difficulty ?? null,
          notes: pin.notes ?? null,
          set_by: pin.set_by ?? null,
        };

        const { data, error: upsertErr } = await supabase
          .from("pin_positions")
          .upsert(payload, { onConflict: "date,hole_number" })
          .select()
          .single();

        if (upsertErr) {
          console.error("[usePinPositions] upsertPin error:", upsertErr);
          setError(upsertErr.message);
          return null;
        }

        return data as PinPosition;
      } catch (err) {
        console.error("[usePinPositions] upsertPin exception:", err);
        setError(err instanceof Error ? err.message : "Failed to upsert pin");
        return null;
      }
    },
    [supabase]
  );

  const getTodayPins = useCallback(async (): Promise<PinPosition[]> => {
    return fetchPinsByDate(todayIso());
  }, [fetchPinsByDate]);

  const setBulkPins = useCallback(
    async (pinsIn: CreatePinInput[]): Promise<boolean> => {
      setError(null);

      for (const p of pinsIn) {
        const err = validatePin(p);
        if (err) {
          console.error("[usePinPositions] setBulkPins validation:", err);
          setError(err);
          return false;
        }
      }

      try {
        const payload = pinsIn.map((p) => ({
          date: p.date,
          hole_number: p.hole_number,
          paces_from_front: p.paces_from_front,
          paces_from_left: p.paces_from_left,
          difficulty: p.difficulty ?? null,
          notes: p.notes ?? null,
          set_by: p.set_by ?? null,
        }));

        const { error: upsertErr } = await supabase
          .from("pin_positions")
          .upsert(payload, { onConflict: "date,hole_number" });

        if (upsertErr) {
          console.error("[usePinPositions] setBulkPins error:", upsertErr);
          setError(upsertErr.message);
          return false;
        }

        return true;
      } catch (err) {
        console.error("[usePinPositions] setBulkPins exception:", err);
        setError(err instanceof Error ? err.message : "Failed to save pins");
        return false;
      }
    },
    [supabase]
  );

  return {
    pins,
    loading,
    error,
    fetchPinsByDate,
    upsertPin,
    getTodayPins,
    setBulkPins,
  };
}
