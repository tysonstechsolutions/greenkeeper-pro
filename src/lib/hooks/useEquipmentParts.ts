"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EquipmentPart } from "@/types/database";

const SESSION_EXPIRED_MSG =
  "Your session expired. Please sign in again with your PIN.";

export function useEquipmentParts() {
  const [parts, setParts] = useState<EquipmentPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const fetchParts = useCallback(async (equipmentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await (supabase.from("equipment_parts") as any)
        .select("*")
        .eq("equipment_id", equipmentId)
        .order("created_at", { ascending: false });
      if (fetchError) throw fetchError;
      setParts(data || []);
      return data || [];
    } catch (err) {
      console.error("Error fetching equipment parts:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const requireSession = async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      // Broadcast a global event so an interceptor can redirect to PIN login.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("auth:session-expired"));
      }
      return { supabase, session: null as null };
    }
    return { supabase, session };
  };

  const addPart = useCallback(async (equipmentId: string, part: {
    name: string;
    part_number?: string;
    description?: string;
    quantity?: number;
    status?: string;
    estimated_cost?: number;
    delay_reason?: string;
  }): Promise<{ data: EquipmentPart | null; error: string | null }> => {
    setError(null);
    try {
      const { supabase, session } = await requireSession();
      if (!session) {
        setError(SESSION_EXPIRED_MSG);
        return { data: null, error: SESSION_EXPIRED_MSG };
      }

      const { data, error: insertError } = await (supabase.from("equipment_parts") as any)
        .insert({
          equipment_id: equipmentId,
          name: part.name,
          part_number: part.part_number || null,
          description: part.description || null,
          quantity: part.quantity || 1,
          status: part.status || "needed",
          estimated_cost: part.estimated_cost != null ? part.estimated_cost : null,
          delay_reason: part.delay_reason || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Supabase insert error:", insertError);
        const msg = insertError.message || "Database error while saving part";
        setError(msg);
        return { data: null, error: msg };
      }

      setParts((prev) => [data, ...prev]);
      return { data, error: null };
    } catch (err) {
      console.error("Error adding part:", err);
      const msg = err instanceof Error ? err.message : "Failed to save part";
      setError(msg);
      return { data: null, error: msg };
    }
  }, []);

  const updatePart = useCallback(async (
    partId: string,
    updates: Partial<EquipmentPart>
  ): Promise<{ data: EquipmentPart | null; error: string | null }> => {
    setError(null);
    try {
      const { supabase, session } = await requireSession();
      if (!session) {
        setError(SESSION_EXPIRED_MSG);
        return { data: null, error: SESSION_EXPIRED_MSG };
      }

      const { data, error: updateError } = await (supabase.from("equipment_parts") as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", partId)
        .select()
        .single();

      if (updateError) {
        console.error("Supabase update error:", updateError);
        const msg = updateError.message || "Database error while updating part";
        setError(msg);
        return { data: null, error: msg };
      }

      setParts((prev) => prev.map((p) => (p.id === partId ? data : p)));
      return { data, error: null };
    } catch (err) {
      console.error("Error updating part:", err);
      const msg = err instanceof Error ? err.message : "Failed to update part";
      setError(msg);
      return { data: null, error: msg };
    }
  }, []);

  const deletePart = useCallback(async (
    partId: string
  ): Promise<{ success: boolean; error: string | null }> => {
    setError(null);
    try {
      const { supabase, session } = await requireSession();
      if (!session) {
        setError(SESSION_EXPIRED_MSG);
        return { success: false, error: SESSION_EXPIRED_MSG };
      }

      const { error: deleteError } = await (supabase.from("equipment_parts") as any)
        .delete()
        .eq("id", partId);

      if (deleteError) {
        console.error("Supabase delete error:", deleteError);
        const msg = deleteError.message || "Database error while deleting part";
        setError(msg);
        return { success: false, error: msg };
      }

      setParts((prev) => prev.filter((p) => p.id !== partId));
      return { success: true, error: null };
    } catch (err) {
      console.error("Error deleting part:", err);
      const msg = err instanceof Error ? err.message : "Failed to delete part";
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

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
