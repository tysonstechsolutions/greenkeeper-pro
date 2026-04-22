"use client";

import { useState, useCallback } from "react";
import {
  directSelectList,
  directInsertRow,
  directPatchRowReturning,
  directDeleteRow,
} from "@/lib/supabase/rest";
import type { EquipmentPart } from "@/types/database";

export function useEquipmentParts() {
  const [parts, setParts] = useState<EquipmentPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchParts = useCallback(async (equipmentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await directSelectList<EquipmentPart>("equipment_parts", {
        columns: "*",
        filters: [`equipment_id=eq.${encodeURIComponent(equipmentId)}`],
        orderBy: [{ column: "created_at", ascending: false }],
        label: "fetchParts",
      });
      setParts(data);
      return data;
    } catch (err) {
      console.error("Error fetching equipment parts:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const addPart = useCallback(
    async (
      equipmentId: string,
      part: {
        name: string;
        part_number?: string;
        description?: string;
        quantity?: number;
        status?: string;
        estimated_cost?: number;
        delay_reason?: string;
      },
    ): Promise<{ data: EquipmentPart | null; error: string | null }> => {
      setError(null);
      try {
        const data = await directInsertRow<EquipmentPart>(
          "equipment_parts",
          {
            equipment_id: equipmentId,
            name: part.name,
            part_number: part.part_number || null,
            description: part.description || null,
            quantity: part.quantity || 1,
            status: part.status || "needed",
            estimated_cost:
              part.estimated_cost != null ? part.estimated_cost : null,
            delay_reason: part.delay_reason || null,
          },
          "addPart",
        );
        setParts((prev) => [data, ...prev]);
        return { data, error: null };
      } catch (err) {
        console.error("Error adding part:", err);
        const msg = err instanceof Error ? err.message : "Failed to save part";
        setError(msg);
        return { data: null, error: msg };
      }
    },
    [],
  );

  const updatePart = useCallback(
    async (
      partId: string,
      updates: Partial<EquipmentPart>,
    ): Promise<{ data: EquipmentPart | null; error: string | null }> => {
      setError(null);
      try {
        const data = await directPatchRowReturning<EquipmentPart>(
          "equipment_parts",
          "id",
          partId,
          { ...updates, updated_at: new Date().toISOString() },
          "updatePart",
        );
        setParts((prev) => prev.map((p) => (p.id === partId ? data : p)));
        return { data, error: null };
      } catch (err) {
        console.error("Error updating part:", err);
        const msg = err instanceof Error ? err.message : "Failed to update part";
        setError(msg);
        return { data: null, error: msg };
      }
    },
    [],
  );

  const deletePart = useCallback(
    async (
      partId: string,
    ): Promise<{ success: boolean; error: string | null }> => {
      setError(null);
      try {
        await directDeleteRow("equipment_parts", "id", partId, "deletePart");
        setParts((prev) => prev.filter((p) => p.id !== partId));
        return { success: true, error: null };
      } catch (err) {
        console.error("Error deleting part:", err);
        const msg = err instanceof Error ? err.message : "Failed to delete part";
        setError(msg);
        return { success: false, error: msg };
      }
    },
    [],
  );

  return {
    parts,
    loading,
    error,
    clearError,
    fetchParts,
    addPart,
    updatePart,
    deletePart,
  };
}
