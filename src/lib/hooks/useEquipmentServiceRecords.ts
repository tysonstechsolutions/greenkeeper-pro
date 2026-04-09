"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { EquipmentServiceRecord } from "@/types/database";

export function useEquipmentServiceRecords() {
  const [records, setRecords] = useState<EquipmentServiceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRecords = useCallback(async (equipmentId: string) => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await (supabase.from("equipment_service_records") as any)
        .select("*")
        .eq("equipment_id", equipmentId)
        .order("service_date", { ascending: false });
      if (error) throw error;
      setRecords(data || []);
      return data || [];
    } catch (err) {
      console.error("Error fetching service records:", err);
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
  }) => {
    try {
      const supabase = createClient();
      const { data, error } = await (supabase.from("equipment_service_records") as any)
        .insert({
          equipment_id: equipmentId,
          service_date: record.service_date,
          description: record.description,
          performed_by: record.performed_by,
          hours_at_service: record.hours_at_service || null,
          cost: record.cost || null,
          parts_used: record.parts_used || null,
        })
        .select()
        .single();
      if (error) throw error;
      setRecords((prev) => [data, ...prev]);
      return data;
    } catch (err) {
      console.error("Error adding service record:", err);
      return null;
    }
  }, []);

  const deleteRecord = useCallback(async (recordId: string) => {
    try {
      const supabase = createClient();
      const { error } = await (supabase.from("equipment_service_records") as any)
        .delete()
        .eq("id", recordId);
      if (error) throw error;
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
      return true;
    } catch (err) {
      console.error("Error deleting service record:", err);
      return false;
    }
  }, []);

  return { records, loading, fetchRecords, addRecord, deleteRecord };
}
