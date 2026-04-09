"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EquipmentServiceRecord } from "@/types/database";

export function useEquipmentServiceRecords() {
  const [records, setRecords] = useState<EquipmentServiceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = useCallback(async (equipmentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await (supabase.from("equipment_service_records") as any)
        .select("*")
        .eq("equipment_id", equipmentId)
        .order("service_date", { ascending: false });
      if (fetchError) throw fetchError;
      setRecords(data || []);
      return data || [];
    } catch (err) {
      console.error("Error fetching service records:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const addRecord = useCallback(async (equipmentId: string, record: {
    service_date: string;
    description: string;
    performed_by: string;
    hours_at_service?: number;
    cost?: number;
    parts_used?: string;
  }): Promise<{ data: EquipmentServiceRecord | null; error: string | null }> => {
    setError(null);
    try {
      const supabase = createClient();

      // Verify auth session before insert
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const msg = "You must be logged in to add service records. Please refresh the page and sign in again.";
        setError(msg);
        return { data: null, error: msg };
      }

      const { data, error: insertError } = await (supabase.from("equipment_service_records") as any)
        .insert({
          equipment_id: equipmentId,
          service_date: record.service_date,
          description: record.description,
          performed_by: record.performed_by,
          hours_at_service: record.hours_at_service != null ? record.hours_at_service : null,
          cost: record.cost != null ? record.cost : null,
          parts_used: record.parts_used || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Supabase insert error:", insertError);
        const msg = insertError.message || "Database error while saving service record";
        setError(msg);
        return { data: null, error: msg };
      }

      setRecords((prev) => [data, ...prev]);
      return { data, error: null };
    } catch (err) {
      console.error("Error adding service record:", err);
      const msg = err instanceof Error ? err.message : "Failed to save service record";
      setError(msg);
      return { data: null, error: msg };
    }
  }, []);

  const deleteRecord = useCallback(async (recordId: string) => {
    setError(null);
    try {
      const supabase = createClient();
      const { error: deleteError } = await (supabase.from("equipment_service_records") as any)
        .delete()
        .eq("id", recordId);
      if (deleteError) throw deleteError;
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
      return true;
    } catch (err) {
      console.error("Error deleting service record:", err);
      return false;
    }
  }, []);

  return { records, loading, error, fetchRecords, addRecord, deleteRecord };
}
