"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  directSelectList,
  directInsertRow,
  directPatchRow,
  directDeleteRow,
  getCachedUserId,
} from "@/lib/supabase/rest";
import type { DutyArea, ProShopDuty, ProShopStaff, WeekdayKey } from "./types";
import { groupDuties, type DutySection } from "./duties";

export interface DutyInput {
  title: string;
  /** Provide exactly one of area / staffId. */
  area?: DutyArea | null;
  staffId?: string | null;
  days: WeekdayKey[];
  note?: string | null;
}

export function useProShopDuties() {
  const [staff, setStaff] = useState<ProShopStaff[]>([]);
  const [duties, setDuties] = useState<ProShopDuty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [st, du] = await Promise.all([
        directSelectList<ProShopStaff>("pro_shop_staff", {
          columns: "*",
          orderBy: [{ column: "sort_order", ascending: true }],
          label: "proshop.duties.staff",
        }),
        directSelectList<ProShopDuty>("pro_shop_duties", {
          columns: "*",
          orderBy: [{ column: "sort_order", ascending: true }],
          label: "proshop.duties.list",
        }),
      ]);
      setStaff(st);
      setDuties(du);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load duties.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeStaff = useMemo(() => staff.filter((s) => s.is_active), [staff]);

  const sections: DutySection[] = useMemo(
    () => groupDuties(duties, staff),
    [duties, staff],
  );

  const addDuty = useCallback(
    async (input: DutyInput) => {
      const maxSort = duties.reduce((m, d) => Math.max(m, d.sort_order), 0);
      await directInsertRow(
        "pro_shop_duties",
        {
          title: input.title.trim(),
          area: input.area ?? null,
          staff_id: input.staffId ?? null,
          days: input.days,
          note: input.note?.trim() || null,
          sort_order: maxSort + 1,
          created_by: getCachedUserId(),
        },
        "proshop.duty.add",
      );
      await load();
    },
    [duties, load],
  );

  const updateDuty = useCallback(
    async (id: string, patch: Partial<ProShopDuty>) => {
      await directPatchRow(
        "pro_shop_duties",
        "id",
        id,
        { ...patch, updated_at: new Date().toISOString() },
        "proshop.duty.update",
      );
      await load();
    },
    [load],
  );

  const deleteDuty = useCallback(
    async (id: string) => {
      await directDeleteRow("pro_shop_duties", "id", id, "proshop.duty.delete");
      await load();
    },
    [load],
  );

  return {
    staff,
    activeStaff,
    duties,
    sections,
    loading,
    error,
    reload: load,
    addDuty,
    updateDuty,
    deleteDuty,
  };
}
