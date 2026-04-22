"use client";

import { useState, useCallback } from "react";
import {
  directSelectList,
  directInsertRow,
  directDeleteRow,
} from "@/lib/supabase/rest";
import type { EquipmentServiceRecord } from "@/types/database";

export function useEquipmentServiceRecords() {
  const [records, setRecords] = useState<EquipmentServiceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = useCallback(async (equipmentId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await directSelectList<EquipmentServiceRecord>(
        "equipment_service_records",
        {
          columns: "*",
          filters: [`equipment_id=eq.${encodeURIComponent(equipmentId)}`],
          orderBy: [{ column: "service_date", ascending: false }],
          label: "fetchServiceRecords",
        },
      );
      setRecords(data);
      return data;
    } catch (err) {
      console.error("Error fetching service records:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const addRecord = useCallback(
    async (
      equipmentId: string,
      record: {
        service_date: string;
        description: string;
        performed_by: string;
        hours_at_service?: number;
        cost?: number;
        parts_used?: string;
        sent_to_manufacturer?: boolean;
        pickup_date?: string;
        return_date?: string;
      },
    ): Promise<{ data: EquipmentServiceRecord | null; error: string | null }> => {
      setError(null);
      try {
        const data = await directInsertRow<EquipmentServiceRecord>(
          "equipment_service_records",
          {
            equipment_id: equipmentId,
            service_date: record.service_date,
            description: record.description,
            performed_by: record.performed_by,
            hours_at_service:
              record.hours_at_service != null ? record.hours_at_service : null,
            cost: record.cost != null ? record.cost : null,
            parts_used: record.parts_used || null,
            sent_to_manufacturer: record.sent_to_manufacturer || false,
            pickup_date: record.pickup_date || null,
            return_date: record.return_date || null,
          },
          "addServiceRecord",
        );
        setRecords((prev) => [data, ...prev]);
        return { data, error: null };
      } catch (err) {
        console.error("Error adding service record:", err);
        const msg =
          err instanceof Error ? err.message : "Failed to save service record";
        setError(msg);
        return { data: null, error: msg };
      }
    },
    [],
  );

  const deleteRecord = useCallback(async (recordId: string) => {
    setError(null);
    try {
      await directDeleteRow(
        "equipment_service_records",
        "id",
        recordId,
        "deleteServiceRecord",
      );
      setRecords((prev) => prev.filter((r) => r.id !== recordId));
      return true;
    } catch (err) {
      console.error("Error deleting service record:", err);
      return false;
    }
  }, []);

  return { records, loading, error, fetchRecords, addRecord, deleteRecord };
}
