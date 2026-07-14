"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { directRpc, directSelectAll } from "@/lib/supabase/rest";
import type {
  DutyAssignment,
  DutyAuditEvent,
  DutyPersonSummary,
  DutyRecurrenceRule,
  DutyRecurrenceVersion,
  DutyTemporaryCoverage,
  DutyVendorSummary,
  LegacyRosterLink,
  OperationDuty,
} from "./types";
import { ymdLocal } from "./engine";

const ASSIGNMENT_COLUMNS =
  "*,primary:profiles!duty_assignments_primary_profile_id_fkey(id,full_name,role,department,role_group)," +
  "backup:profiles!duty_assignments_backup_profile_id_fkey(id,full_name,role,department,role_group)," +
  "contractor:vendors!duty_assignments_contractor_vendor_id_fkey(id,name,company)";

const COVERAGE_COLUMNS =
  "*,primary:profiles!duty_temporary_coverages_primary_profile_id_fkey(id,full_name,role,department,role_group)," +
  "backup:profiles!duty_temporary_coverages_backup_profile_id_fkey(id,full_name,role,department,role_group)," +
  "contractor:vendors!duty_temporary_coverages_contractor_vendor_id_fkey(id,name,company)";

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

export interface CoveragePreviewRow {
  task_id: string;
  due_date: string;
  status: string;
  will_move: boolean;
}

export interface TemporaryCoverageInput {
  dutyId: string;
  primaryProfileId: string | null;
  backupProfileId: string | null;
  contractorVendorId: string | null;
  startsOn: string;
  endsOn: string;
  reason: string;
}

export interface RecurrencePreviewRow {
  task_id: string;
  occurrence_key: string;
  original_due_date: string;
  due_date: string;
  status: string;
  action: "preserve" | "cancel_pending";
}

export interface FutureRecurrenceInput {
  dutyId: string;
  effectiveDate: string;
  cadence: OperationDuty["cadence"];
  recurrenceRule: DutyRecurrenceRule;
  reason: string;
}

export function useDutyManagement() {
  const { profile } = useAuth();
  const [duties, setDuties] = useState<OperationDuty[]>([]);
  const [assignments, setAssignments] = useState<DutyAssignment[]>([]);
  const [coverages, setCoverages] = useState<DutyTemporaryCoverage[]>([]);
  const [recurrenceVersions, setRecurrenceVersions] = useState<DutyRecurrenceVersion[]>([]);
  const [auditEvents, setAuditEvents] = useState<DutyAuditEvent[]>([]);
  const [legacyRoster, setLegacyRoster] = useState<LegacyRosterLink[]>([]);
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
      const [dutyRows, assignmentRows, coverageRows, versionRows, auditRows, profileRows, vendorRows, rosterRows] =
        await Promise.all([
          directSelectAll<OperationDuty>("operation_duties", {
            columns: "*",
            orderBy: [{ column: "role_group" }, { column: "sort_order" }, { column: "id" }],
            label: "duties.manage.list",
          }),
          directSelectAll<DutyAssignment>("duty_assignments", {
            columns: ASSIGNMENT_COLUMNS,
            orderBy: [{ column: "effective_from", ascending: false }, { column: "id" }],
            label: "duties.manage.assignments",
          }),
          directSelectAll<DutyTemporaryCoverage>("duty_temporary_coverages", {
            columns: COVERAGE_COLUMNS,
            orderBy: [{ column: "starts_on", ascending: false }, { column: "id" }],
            label: "duties.manage.coverages",
          }),
          directSelectAll<DutyRecurrenceVersion>("duty_recurrence_versions", {
            columns: "*",
            orderBy: [{ column: "effective_from", ascending: false }, { column: "id" }],
            label: "duties.manage.recurrenceVersions",
          }),
          directSelectAll<DutyAuditEvent>("duty_audit_events", {
            columns: "*",
            orderBy: [{ column: "created_at", ascending: false }, { column: "id" }],
            label: "duties.manage.audit",
          }),
          directSelectAll<DutyPersonSummary>("profiles", {
            columns: "id,full_name,role,department,role_group",
            filters: ["is_active=eq.true"],
            orderBy: [{ column: "full_name" }, { column: "id" }],
            label: "duties.manage.people",
          }),
          directSelectAll<DutyVendorSummary>("vendors", {
            columns: "id,name,company",
            orderBy: [{ column: "name" }, { column: "id" }],
            label: "duties.manage.vendors",
          }),
          directSelectAll<LegacyRosterLink>("pro_shop_staff", {
            columns: "id,full_name,position,is_active,profile_id",
            orderBy: [{ column: "sort_order" }, { column: "id" }],
            label: "duties.manage.legacyRoster",
          }),
        ]);
      setDuties(dutyRows);
      setAssignments(assignmentRows);
      setCoverages(coverageRows);
      setRecurrenceVersions(versionRows);
      setAuditEvents(auditRows);
      setPeople(profileRows);
      setVendors(vendorRows);
      setLegacyRoster(rosterRows);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load duties.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const currentAssignments = useMemo(() => {
    const today = ymdLocal(new Date());
    return assignments.filter((assignment) =>
      assignment.effective_from <= today &&
      (!assignment.effective_through || assignment.effective_through >= today),
    );
  }, [assignments]);

  const runMutation = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    if (!canManage) throw new Error("Only a GM or operations manager may change duties.");
    setSaving(true);
    setError(null);
    try {
      const result = await action();
      await load();
      return result;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not save duty changes.";
      setError(message);
      throw caught;
    } finally {
      setSaving(false);
    }
  }, [canManage, load]);

  const saveDuty = useCallback((input: SaveDutyInput) => runMutation(async () => {
    return await directRpc<OperationDuty>("save_operation_duty", {
      p_duty_id: input.id ?? null,
      p_duty: input.duty,
      p_primary_profile_id: input.primaryProfileId,
      p_backup_profile_id: input.backupProfileId,
      p_contractor_vendor_id: input.contractorVendorId,
      p_assignment_effective_date: input.assignmentEffectiveDate,
      p_assignment_reason: input.assignmentReason.trim() || null,
    }, "duties.manage.saveAtomic");
  }), [runMutation]);

  const reassignAll = useCallback((input: ReassignDutiesInput) => runMutation(async () => {
    const result = await directRpc<ReassignDutiesResult[]>("reassign_active_duties", {
      p_from_profile_id: input.fromProfileId,
      p_replacement_profile_id: input.replacementProfileId,
      p_effective_date: input.effectiveDate,
      p_reason: input.reason.trim(),
      p_duty_ids: input.dutyIds?.length ? input.dutyIds : null,
    }, "duties.manage.reassignAll");
    return Array.isArray(result) ? result : [];
  }), [runMutation]);

  const previewCoverage = useCallback(async (dutyId: string, startsOn: string, endsOn: string) => {
    const result = await directRpc<CoveragePreviewRow[]>("preview_temporary_duty_coverage", {
      p_duty_id: dutyId,
      p_starts_on: startsOn,
      p_ends_on: endsOn,
    }, "duties.manage.previewCoverage");
    return Array.isArray(result) ? result : [];
  }, []);

  const setTemporaryCoverage = useCallback((input: TemporaryCoverageInput) => runMutation(() =>
    directRpc<string>("set_temporary_duty_coverage", {
      p_duty_id: input.dutyId,
      p_primary_profile_id: input.primaryProfileId,
      p_backup_profile_id: input.backupProfileId,
      p_contractor_vendor_id: input.contractorVendorId,
      p_starts_on: input.startsOn,
      p_ends_on: input.endsOn,
      p_reason: input.reason.trim(),
    }, "duties.manage.setCoverage"),
  ), [runMutation]);

  const previewRecurrence = useCallback(async (input: FutureRecurrenceInput) => {
    const result = await directRpc<RecurrencePreviewRow[]>("preview_duty_recurrence_change", {
      p_duty_id: input.dutyId,
      p_effective_date: input.effectiveDate,
      p_recurrence_rule: input.recurrenceRule,
    }, "duties.manage.previewRecurrence");
    return Array.isArray(result) ? result : [];
  }, []);

  const changeFutureRecurrence = useCallback((input: FutureRecurrenceInput) => runMutation(() =>
    directRpc<string>("change_future_duty_recurrence", {
      p_duty_id: input.dutyId,
      p_effective_date: input.effectiveDate,
      p_cadence: input.cadence,
      p_recurrence_rule: input.recurrenceRule,
      p_reason: input.reason.trim(),
    }, "duties.manage.changeFutureRecurrence"),
  ), [runMutation]);

  const linkLegacyRoster = useCallback((staffId: string, profileId: string, reason: string) =>
    runMutation(() => directRpc<void>("link_pro_shop_staff_profile", {
      p_staff_id: staffId,
      p_profile_id: profileId,
      p_reason: reason.trim(),
    }, "duties.manage.linkLegacyRoster")), [runMutation]);

  return {
    duties,
    assignments,
    currentAssignments,
    coverages,
    recurrenceVersions,
    auditEvents,
    legacyRoster,
    people,
    vendors,
    loading,
    saving,
    error,
    canManage,
    reload: load,
    saveDuty,
    reassignAll,
    previewCoverage,
    setTemporaryCoverage,
    previewRecurrence,
    changeFutureRecurrence,
    linkLegacyRoster,
  };
}
