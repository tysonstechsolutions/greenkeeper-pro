"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  directInsertRow,
  directPatchRow,
  directRpc,
  directSelectList,
} from "@/lib/supabase/rest";
import type {
  DutyAssignment,
  DutyPersonSummary,
  DutyVendorSummary,
  OperationDuty,
} from "./types";
import { ymdLocal } from "./engine";

const DUTY_ASSIGNMENT_COLUMNS =
  "*,primary:profiles!duty_assignments_primary_profile_id_fkey(id,full_name,role,department,role_group)," +
  "backup:profiles!duty_assignments_backup_profile_id_fkey(id,full_name,role,department,role_group)," +
  "contractor:vendors!duty_assignments_contractor_vendor_id_fkey(id,name,company)";

export interface SaveDutyInput {
  id?: string;
  duty: Omit<OperationDuty, "id" | "created_at" | "updated_at">;
  primaryProfileId: string | null;
  backupProfileId: string | null;
  contractorVendorId: string | null;
  assignmentEffectiveDate: string;
  assignmentReason: string;
}

export interface ReassignDutiesInput {
  fromProfileId: string;
  replacementProfileId: string | null;
  effectiveDate: string;
  reason: string;
  dutyIds?: string[];
}

export interface ReassignDutiesResult {
  duty_id: string;
  assignment_id: string;
  role_changed: "primary" | "backup";
}

export function useDutyManagement() {
  const { profile } = useAuth();
  const [duties, setDuties] = useState<OperationDuty[]>([]);
  const [assignments, setAssignments] = useState<DutyAssignment[]>([]);
  const [people, setPeople] = useState<DutyPersonSummary[]>([]);
  const [vendors, setVendors] = useState<DutyVendorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManage = !!profile && ["super", "asst_super", "director", "gm"].includes(profile.role);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dutyRows, assignmentRows, profileRows, vendorRows] = await Promise.all([
        directSelectList<OperationDuty>("operation_duties", {
          columns: "*",
          orderBy: [
            { column: "role_group", ascending: true },
            { column: "sort_order", ascending: true },
          ],
          limit: 1000,
          label: "duties.manage.list",
        }),
        directSelectList<DutyAssignment>("duty_assignments", {
          columns: DUTY_ASSIGNMENT_COLUMNS,
          orderBy: [{ column: "effective_from", ascending: false }],
          limit: 2000,
          label: "duties.manage.assignments",
        }),
        directSelectList<DutyPersonSummary>("profiles", {
          columns: "id,full_name,role,department,role_group",
          filters: ["is_active=eq.true"],
          orderBy: [{ column: "full_name", ascending: true }],
          limit: 500,
          label: "duties.manage.people",
        }),
        directSelectList<DutyVendorSummary>("vendors", {
          columns: "id,name,company",
          orderBy: [{ column: "name", ascending: true }],
          limit: 500,
          label: "duties.manage.vendors",
        }),
      ]);
      setDuties(dutyRows);
      setAssignments(assignmentRows);
      setPeople(profileRows);
      setVendors(vendorRows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load duties.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const currentAssignments = useMemo(() => {
    const today = ymdLocal(new Date());
    return assignments.filter((assignment) => (
      assignment.effective_from <= today
      && (!assignment.effective_through || assignment.effective_through >= today)
    ));
  }, [assignments]);

  const saveDuty = useCallback(async (input: SaveDutyInput): Promise<OperationDuty> => {
    if (!canManage) throw new Error("Only a GM or operations manager may change duties.");
    if (!input.assignmentReason.trim()) throw new Error("An assignment reason is required.");
    setSaving(true);
    setError(null);
    try {
      let saved: OperationDuty;
      if (input.id) {
        await directPatchRow(
          "operation_duties",
          "id",
          input.id,
          { ...input.duty, updated_at: new Date().toISOString() },
          "duties.manage.update",
        );
        saved = { ...input.duty, id: input.id } as OperationDuty;
      } else {
        saved = await directInsertRow<OperationDuty>(
          "operation_duties",
          input.duty,
          "duties.manage.create",
        );
      }

      await directRpc<string>(
        "set_duty_assignment",
        {
          p_duty_id: saved.id,
          p_primary_profile_id: input.primaryProfileId,
          p_backup_profile_id: input.backupProfileId,
          p_contractor_vendor_id: input.contractorVendorId,
          p_effective_date: input.assignmentEffectiveDate,
          p_reason: input.assignmentReason.trim(),
        },
        "duties.manage.setAssignment",
      );
      await load();
      return saved;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not save duty.";
      setError(message);
      throw caught;
    } finally {
      setSaving(false);
    }
  }, [canManage, load]);

  const reassignAll = useCallback(async (
    input: ReassignDutiesInput,
  ): Promise<ReassignDutiesResult[]> => {
    if (!canManage) throw new Error("Only a GM or operations manager may reassign duties.");
    if (!input.reason.trim()) throw new Error("A reassignment reason is required.");
    setSaving(true);
    setError(null);
    try {
      const result = await directRpc<ReassignDutiesResult[]>(
        "reassign_active_duties",
        {
          p_from_profile_id: input.fromProfileId,
          p_replacement_profile_id: input.replacementProfileId,
          p_effective_date: input.effectiveDate,
          p_reason: input.reason.trim(),
          p_duty_ids: input.dutyIds?.length ? input.dutyIds : null,
        },
        "duties.manage.reassignAll",
      );
      await load();
      return Array.isArray(result) ? result : [];
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not reassign duties.";
      setError(message);
      throw caught;
    } finally {
      setSaving(false);
    }
  }, [canManage, load]);

  return {
    duties,
    assignments,
    currentAssignments,
    people,
    vendors,
    loading,
    saving,
    error,
    canManage,
    reload: load,
    saveDuty,
    reassignAll,
  };
}
