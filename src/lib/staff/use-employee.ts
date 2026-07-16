"use client";

import { useCallback, useEffect, useState } from "react";
import {
  directSelectRow,
  directSelectList,
  directPatchRow,
  directInsertRow,
  directDeleteRow,
  directStorageUpload,
  directStorageDelete,
  directCreateSignedUrl,
  directRpc,
  getCachedUserId,
} from "@/lib/supabase/rest";
import type { FullProfile, StaffRecord, StaffRecordType, StaffDocument, StaffConcern } from "./types";
import type { Profile, StaffPersonnelPrivate } from "@/types/database";

const BUCKET = "staff-documents";
// staff-documents is a PRIVATE bucket (Phase 0B/B2). Files are read via
// short-lived signed URLs, never a permanent public URL.
const SIGNED_URL_TTL_SECONDS = 300;

export function useEmployee(employeeId: string) {
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [supervisor, setSupervisor] = useState<{ id: string; full_name: string } | null>(null);
  const [reports, setReports] = useState<{ id: string; full_name: string }[]>([]);
  const [records, setRecords] = useState<StaffRecord[]>([]);
  const [documents, setDocuments] = useState<StaffDocument[]>([]);
  const [concerns, setConcerns] = useState<StaffConcern[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const [directory, personnel] = await Promise.all([
        directSelectRow<Profile & { supervisor_id?: string | null }>(
          "profiles",
          "id",
          employeeId,
          "id,email,full_name,display_name,role,department,role_group,phone,avatar_url,user_preferences,is_active,language_preference,supervisor_id,created_at,updated_at",
          "staff.employee.profile",
        ),
        directSelectRow<StaffPersonnelPrivate>(
          "staff_personnel_private",
          "employee_id",
          employeeId,
          "employee_id,hire_date,certifications,emergency_contact,personnel_details,created_by,updated_by,created_at,updated_at",
          "staff.employee.personnel",
        ),
      ]);
      const p: FullProfile | null = directory
        ? {
            ...directory,
            hire_date: personnel?.hire_date ?? null,
            certifications: personnel?.certifications ?? [],
            emergency_contact: personnel?.emergency_contact ?? null,
            personnel_details: personnel?.personnel_details ?? null,
          }
        : null;
      setProfile(p);

      if (p?.supervisor_id) {
        const sup = await directSelectRow<{ id: string; full_name: string }>(
          "profiles",
          "id",
          p.supervisor_id,
          "id,full_name",
          "staff.employee.supervisor",
        );
        setSupervisor(sup);
      } else {
        setSupervisor(null);
      }

      const [recs, docs, directReports, cons] = await Promise.all([
        directSelectList<StaffRecord>("staff_records", {
          filters: [`employee_id=eq.${employeeId}`],
          orderBy: [
            { column: "event_date", ascending: false },
            { column: "created_at", ascending: false },
          ],
          label: "staff.records",
        }),
        directSelectList<StaffDocument>("staff_documents", {
          filters: [`employee_id=eq.${employeeId}`],
          orderBy: [{ column: "created_at", ascending: false }],
          label: "staff.documents",
        }),
        directSelectList<{ id: string; full_name: string }>("profiles", {
          columns: "id,full_name",
          filters: [`supervisor_id=eq.${employeeId}`, "is_active=eq.true"],
          orderBy: [{ column: "full_name", ascending: true }],
          label: "staff.directReports",
        }),
        directSelectList<StaffConcern>("staff_concerns", {
          filters: [`employee_id=eq.${employeeId}`],
          orderBy: [{ column: "opened_on", ascending: true }],
          label: "staff.concerns",
        }),
      ]);
      setRecords(recs);
      setDocuments(docs);
      setReports(directReports);
      setConcerns(cons);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load employee.");
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveProfile = useCallback(
    async (patch: Record<string, unknown>) => {
      const personnelKeys = new Set([
        "hire_date",
        "certifications",
        "emergency_contact",
        "personnel_details",
      ]);
      const directory: Record<string, unknown> = {};
      const personnel: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(patch)) {
        (personnelKeys.has(key) ? personnel : directory)[key] = value;
      }
      await directRpc(
        "update_staff_profile",
        { p_employee_id: employeeId, p_directory: directory, p_personnel: personnel },
        "staff.employee.saveProfile",
      );
      await load();
    },
    [employeeId, load],
  );

  const addRecord = useCallback(
    async (rec: {
      type: StaffRecordType;
      event_date: string;
      title?: string | null;
      details?: string | null;
      hours?: number | null;
      amount?: number | null;
      follow_up?: string | null;
    }) => {
      await directInsertRow(
        "staff_records",
        { employee_id: employeeId, created_by: getCachedUserId(), ...rec },
        "staff.records.add",
      );
      await load();
    },
    [employeeId, load],
  );

  const updateRecord = useCallback(
    async (id: string, patch: Partial<StaffRecord>) => {
      await directPatchRow("staff_records", "id", id, patch, "staff.records.update");
      await load();
    },
    [load],
  );

  const deleteRecord = useCallback(
    async (id: string) => {
      await directDeleteRow("staff_records", "id", id, "staff.records.delete");
      await load();
    },
    [load],
  );

  const addDocument = useCallback(
    async (file: File, name: string, category: string) => {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${employeeId}/${Date.now()}-${safe}`;
      await directStorageUpload(BUCKET, path, file, "staff.documents.upload");
      // Private bucket: persist the storage PATH, never a permanent public URL.
      await directInsertRow(
        "staff_documents",
        {
          employee_id: employeeId,
          name: name.trim() || file.name,
          category,
          storage_path: path,
          url: null,
          file_type: file.type || null,
          uploaded_by: getCachedUserId(),
        },
        "staff.documents.add",
      );
      await load();
    },
    [employeeId, load],
  );

  /**
   * Resolve a short-lived signed URL for viewing/downloading a staff document.
   * staff-documents is private, so this is how the UI opens a file. Throws a
   * clear error if the document has no stored path or the request fails.
   */
  const getDocumentUrl = useCallback(async (doc: StaffDocument): Promise<string> => {
    if (!doc.storage_path) {
      throw new Error("This document has no stored file to open.");
    }
    return directCreateSignedUrl(
      BUCKET,
      doc.storage_path,
      SIGNED_URL_TTL_SECONDS,
      "staff.documents.signedUrl",
    );
  }, []);

  const deleteDocument = useCallback(
    async (doc: StaffDocument) => {
      if (doc.storage_path) {
        try {
          await directStorageDelete(BUCKET, [doc.storage_path], "staff.documents.deleteFile");
        } catch {
          /* file may already be gone — still remove the row */
        }
      }
      await directDeleteRow("staff_documents", "id", doc.id, "staff.documents.delete");
      await load();
    },
    [load],
  );

  // ── 1:1 concerns ──────────────────────────────────────────────────────────
  const addConcern = useCallback(
    async (title: string, firstNote?: string) => {
      const today = new Date().toISOString().slice(0, 10);
      const updates =
        firstNote && firstNote.trim() ? [{ date: today, note: firstNote.trim() }] : [];
      await directInsertRow(
        "staff_concerns",
        {
          employee_id: employeeId,
          title: title.trim(),
          opened_on: today,
          status: "open",
          updates,
          created_by: getCachedUserId(),
        },
        "staff.concerns.add",
      );
      await load();
    },
    [employeeId, load],
  );

  const addConcernUpdate = useCallback(
    async (concern: StaffConcern, note: string) => {
      const today = new Date().toISOString().slice(0, 10);
      const updates = [...(concern.updates || []), { date: today, note: note.trim() }];
      await directPatchRow("staff_concerns", "id", concern.id, { updates }, "staff.concerns.note");
      await load();
    },
    [load],
  );

  const reconcileConcern = useCallback(
    async (concernId: string) => {
      const today = new Date().toISOString().slice(0, 10);
      await directPatchRow(
        "staff_concerns",
        "id",
        concernId,
        { status: "reconciled", reconciled_on: today },
        "staff.concerns.reconcile",
      );
      await load();
    },
    [load],
  );

  const reopenConcern = useCallback(
    async (concernId: string) => {
      await directPatchRow(
        "staff_concerns",
        "id",
        concernId,
        { status: "open", reconciled_on: null },
        "staff.concerns.reopen",
      );
      await load();
    },
    [load],
  );

  const deleteConcern = useCallback(
    async (concernId: string) => {
      await directDeleteRow("staff_concerns", "id", concernId, "staff.concerns.delete");
      await load();
    },
    [load],
  );

  /** Schedule a 1:1 for this employee — appears on the calendar, movable there. */
  const scheduleOneOnOne = useCallback(
    async (scheduledOn: string, scheduledTime?: string | null, notes?: string | null) => {
      await directInsertRow(
        "staff_one_on_ones",
        {
          employee_id: employeeId,
          scheduled_on: scheduledOn,
          scheduled_time: scheduledTime || null,
          notes: notes || null,
          status: "scheduled",
          created_by: getCachedUserId(),
        },
        "staff.oneonone.schedule",
      );
      await load();
    },
    [employeeId, load],
  );

  return {
    profile,
    supervisor,
    reports,
    records,
    documents,
    loading,
    error,
    reload: load,
    saveProfile,
    addRecord,
    updateRecord,
    deleteRecord,
    addDocument,
    getDocumentUrl,
    deleteDocument,
    concerns,
    addConcern,
    addConcernUpdate,
    reconcileConcern,
    reopenConcern,
    deleteConcern,
    scheduleOneOnOne,
  };
}
