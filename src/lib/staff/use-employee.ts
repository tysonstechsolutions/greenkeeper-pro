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
  publicStorageUrl,
  getCachedUserId,
} from "@/lib/supabase/rest";
import type { FullProfile, StaffRecord, StaffRecordType, StaffDocument } from "./types";

const BUCKET = "staff-documents";

export function useEmployee(employeeId: string) {
  const [profile, setProfile] = useState<FullProfile | null>(null);
  const [supervisor, setSupervisor] = useState<{ id: string; full_name: string } | null>(null);
  const [reports, setReports] = useState<{ id: string; full_name: string }[]>([]);
  const [records, setRecords] = useState<StaffRecord[]>([]);
  const [documents, setDocuments] = useState<StaffDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!employeeId) return;
    setLoading(true);
    setError(null);
    try {
      const p = await directSelectRow<FullProfile>(
        "profiles",
        "id",
        employeeId,
        "*",
        "staff.employee.profile",
      );
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

      const [recs, docs, directReports] = await Promise.all([
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
      ]);
      setRecords(recs);
      setDocuments(docs);
      setReports(directReports);
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
      await directPatchRow("profiles", "id", employeeId, patch, "staff.employee.saveProfile");
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
      const url = publicStorageUrl(BUCKET, path);
      await directInsertRow(
        "staff_documents",
        {
          employee_id: employeeId,
          name: name.trim() || file.name,
          category,
          storage_path: path,
          url,
          file_type: file.type || null,
          uploaded_by: getCachedUserId(),
        },
        "staff.documents.add",
      );
      await load();
    },
    [employeeId, load],
  );

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
    deleteDocument,
  };
}
