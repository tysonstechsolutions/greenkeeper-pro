"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EquipmentPart } from "@/types/database";

export function useEquipmentParts() {
  const [parts, setParts] = useState<EquipmentPart[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchParts = useCallback(async (equipmentId: string) => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await (supabase.from("equipment_parts") as any)
        .select("*")
        .eq("equipment_id", equipmentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setParts(data || []);
      return data || [];
    } catch (err) {
      console.error("Error fetching equipment parts:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const addPart = useCallback(async (equipmentId: string, part: {
    name: string;
    part_number?: string;
    description?: string;
    quantity?: number;
    status?: string;
    estimated_cost?: number;
  }) => {
    try {
      const supabase = createClient();
      const { data, error } = await (supabase.from("equipment_parts") as any)
        .insert({
          equipment_id: equipmentId,
          name: part.name,
          part_number: part.part_number || null,
          description: part.description || null,
          quantity: part.quantity || 1,
          status: part.status || "needed",
          estimated_cost: part.estimated_cost || null,
        })
        .select()
        .single();
      if (error) throw error;
      setParts((prev) => [data, ...prev]);
      return data;
    } catch (err) {
      console.error("Error adding part:", err);
      return null;
    }
  }, []);

  const updatePart = useCallback(async (partId: string, updates: Partial<EquipmentPart>) => {
    try {
      const supabase = createClient();
      const { data, error } = await (supabase.from("equipment_parts") as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", partId)
        .select()
        .single();
      if (error) throw error;
      setParts((prev) => prev.map((p) => (p.id === partId ? data : p)));
      return data;
    } catch (err) {
      console.error("Error updating part:", err);
      return null;
    }
  }, []);

  const deletePart = useCallback(async (partId: string) => {
    try {
      const supabase = createClient();
      const { error } = await (supabase.from("equipment_parts") as any)
        .delete()
        .eq("id", partId);
      if (error) throw error;
      setParts((prev) => prev.filter((p) => p.id !== partId));
      return true;
    } catch (err) {
      console.error("Error deleting part:", err);
      return false;
    }
  }, []);

  return { parts, loading, fetchParts, addPart, updatePart, deletePart };
}
