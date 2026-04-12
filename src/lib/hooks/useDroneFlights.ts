"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { DroneFlight } from "@/types/database";

export interface DroneFlightFilters {
  since?: string;
  until?: string;
  band?: string;
}

export interface UseDroneFlightsReturn {
  flights: DroneFlight[];
  loading: boolean;
  error: string | null;
  fetchFlights: (filters?: DroneFlightFilters) => Promise<DroneFlight[]>;
  uploadFlight: (formData: FormData) => Promise<DroneFlight | null>;
  deleteFlight: (id: string) => Promise<boolean>;
}

export function useDroneFlights(): UseDroneFlightsReturn {
  const [flights, setFlights] = useState<DroneFlight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchFlights = useCallback(
    async (filters?: DroneFlightFilters): Promise<DroneFlight[]> => {
      setLoading(true);
      setError(null);
      try {
        let query = supabase
          .from("drone_flights")
          .select("*")
          .order("flight_date", { ascending: false });

        if (filters?.since) {
          query = query.gte("flight_date", filters.since);
        }
        if (filters?.until) {
          query = query.lte("flight_date", filters.until);
        }
        if (filters?.band) {
          query = query.eq("band", filters.band);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          setError(fetchError.message);
          setFlights([]);
          return [];
        }

        const rows = (data ?? []) as DroneFlight[];
        setFlights(rows);
        return rows;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        setFlights([]);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  const uploadFlight = useCallback(
    async (formData: FormData): Promise<DroneFlight | null> => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/drone/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: res.statusText }));
          setError(body.error ?? "Upload failed");
          return null;
        }

        const row = (await res.json()) as DroneFlight;
        setFlights((prev) => [row, ...prev]);
        return row;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const deleteFlight = useCallback(
    async (id: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      try {
        const { error: delError } = await supabase
          .from("drone_flights")
          .delete()
          .eq("id", id);

        if (delError) {
          setError(delError.message);
          return false;
        }

        setFlights((prev) => prev.filter((f) => f.id !== id));
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Delete failed";
        setError(message);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [supabase]
  );

  return { flights, loading, error, fetchFlights, uploadFlight, deleteFlight };
}
