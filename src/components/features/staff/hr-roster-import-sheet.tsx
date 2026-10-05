"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle, ClipboardPaste, Loader2, UserPlus, UserCheck, MinusCircle } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { directRpc, directSelectList } from "@/lib/supabase/rest";
import { provisionStaffAccount } from "@/lib/staff/import-schedule-staff";
import {
  describeChanges,
  displayNameFor,
  inviteRoleFor,
  matchHrRows,
  mergePersonnelDetails,
  parseHrRoster,
  placementFor,
  type HrMatchReason,
  type HrRosterRow,
} from "@/lib/staff/hr-roster";
import type { PersonnelDetails } from "@/types/database";

/** The slice of a staff profile the import needs. */
export interface HrImportStaff {
  id: string;
  full_name: string;
  is_active: boolean;
  hire_date?: string | null;
  personnel_details?: PersonnelDetails | null;
}

interface HrRosterImportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staff: HrImportStaff[];
  /** Called after anything was saved so the parent can refetch. */
  onDone?: () => void;
}

/**
 * "Import HR roster" — paste the HR staff export straight from Excel; each
 * row updates the matching staff member (position, pay plan/series/grade,
 * cost center, hire date…) or creates them if they aren't in Staff yet.
 * Nothing is saved until the manager reviews the preview and taps Apply.
 */
export function HrRosterImportSheet({ open, onOpenChange, staff, onDone }: HrRosterImportSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetTitle className="sr-only">Import HR roster</SheetTitle>
        <SheetDescription className="sr-only">
          Paste the HR staff export to update existing staff and add new ones.
        </SheetDescription>
        {open && <ImportForm staff={staff} onDone={onDone} onClose={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

/** Row choice: skip it, create a new person, or update this profile id. */
type Decision = "skip" | "new" | string;

interface RowOutcome {
  ok: boolean;
  text: string;
}

const REASON_NOTE: Record<HrMatchReason, string> = {
  name: "",
  last_name_only: "Matched on last name only — check it's the right person.",
  ambiguous: "More than one possible match — pick the right person.",
  none: "",
};

function ImportForm({
  staff,
  onDone,
  onClose,
}: {
  staff: HrImportStaff[];
  onDone?: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<HrRosterRow[] | null>(null);
  const [parseErrors, setParseErrors] = useState<{ line: number; message: string }[]>([]);
  const [reasons, setReasons] = useState<HrMatchReason[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [applying, setApplying] = useState(false);
  const [outcomes, setOutcomes] = useState<(RowOutcome | null)[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  // Accounts already created per row, so a retry after a failed details
  // save reuses the account instead of creating the person twice.
  const createdIds = useRef(new Map<number, string>());

  // Schedule names ("DJ Skinner") — a new person found on the pro shop
  // schedule is created under that name so the schedule's "add to Staff"
  // prompt recognizes them instead of adding them a second time.
  const [scheduleNames, setScheduleNames] = useState<{ id: string; full_name: string }[]>([]);
  useEffect(() => {
    let alive = true;
    directSelectList<{ id: string; full_name: string }>("pro_shop_staff", {
      columns: "id,full_name",
      label: "staff.hrImport.scheduleNames",
    })
      .then((r) => alive && setScheduleNames(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const byId = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const sortedStaff = useMemo(
    () => [...staff].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [staff],
  );

  const scheduleMatch = useMemo(() => {
    if (!rows) return [] as (string | null)[];
    const m = matchHrRows(rows, scheduleNames);
    return m.map((x) => (x.candidateId ? scheduleNames.find((s) => s.id === x.candidateId)?.full_name ?? null : null));
  }, [rows, scheduleNames]);

  const preview = () => {
    createdIds.current.clear();
    setFatal(null);
    setOutcomes([]);
    const parsed = parseHrRoster(text);
    setParseErrors(parsed.errors);
    if (parsed.rows.length === 0) {
      setRows(null);
      setFatal("No staff rows found. Copy the rows from the HR spreadsheet (header row optional) and paste them here.");
      return;
    }
    const matches = matchHrRows(parsed.rows, staff);
    setRows(parsed.rows);
    setReasons(matches.map((m) => m.reason));
    setDecisions(
      parsed.rows.map((r, i) => {
        if (matches[i].candidateId) return matches[i].candidateId as string;
        // Someone HR doesn't list as active isn't created automatically.
        if (r.employmentStatus && r.employmentStatus.toLowerCase() !== "active") return "skip";
        return matches[i].reason === "ambiguous" ? "skip" : "new";
      }),
    );
  };

  /** What applying a row would do — computed for the preview and reused on apply. */
  const plan = (row: HrRosterRow, decision: Decision) => {
    const existing = decision !== "skip" && decision !== "new" ? byId.get(decision) ?? null : null;
    const personnel = mergePersonnelDetails(existing?.personnel_details, row);
    const hireDate = row.activityStartDate || existing?.hire_date || null;
    const reactivate =
      !!existing && !existing.is_active && row.employmentStatus.toLowerCase() === "active";
    const changes = existing
      ? [
          ...(reactivate ? ["Status: Inactive → Active"] : []),
          ...describeChanges(existing, { hire_date: hireDate, personnel_details: personnel }),
        ]
      : [];
    return { existing, personnel, hireDate, reactivate, changes };
  };

  const counts = useMemo(() => {
    const c = { update: 0, create: 0, skip: 0 };
    decisions.forEach((d) => {
      if (d === "skip") c.skip++;
      else if (d === "new") c.create++;
      else c.update++;
    });
    return c;
  }, [decisions]);

  // The same profile picked for two rows would overwrite itself.
  const duplicatePicks = useMemo(() => {
    const seen = new Map<string, number>();
    decisions.forEach((d) => {
      if (d !== "skip" && d !== "new") seen.set(d, (seen.get(d) || 0) + 1);
    });
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id));
  }, [decisions]);

  const apply = async () => {
    if (!rows || applying || duplicatePicks.size > 0) return;
    setApplying(true);
    setFatal(null);
    // Keep rows that already saved (a retry only re-runs the failures).
    const results: (RowOutcome | null)[] = rows.map((_, i) => (outcomes[i]?.ok ? outcomes[i] : null));
    let saved = 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const decision = decisions[i];
      if (decision === "skip" || results[i]?.ok) continue;
      const { existing, personnel, hireDate, reactivate } = plan(row, decision);
      try {
        let employeeId: string;
        const directory: Record<string, unknown> = {};
        if (existing) {
          employeeId = existing.id;
          if (reactivate) directory.is_active = true;
        } else {
          const name = scheduleMatch[i] || displayNameFor(row);
          employeeId =
            createdIds.current.get(row.line) ??
            (await provisionStaffAccount(name, { role: inviteRoleFor(row) }));
          createdIds.current.set(row.line, employeeId);
          const place = placementFor(row);
          if (place.department) directory.department = place.department;
          if (place.roleGroup) directory.role_group = place.roleGroup;
        }
        await directRpc(
          "update_staff_profile",
          {
            p_employee_id: employeeId,
            p_directory: directory,
            p_personnel: {
              ...(hireDate ? { hire_date: hireDate } : {}),
              personnel_details: personnel,
            },
          },
          "staff.hrImport.save",
        );
        results[i] = { ok: true, text: existing ? "Updated" : "Added" };
        saved++;
      } catch (e) {
        results[i] = { ok: false, text: e instanceof Error ? e.message : String(e) };
      }
      setOutcomes([...results]);
    }
    setOutcomes(results);
    setApplying(false);
    if (saved > 0 || createdIds.current.size > 0) onDone?.();
  };

  const finished = outcomes.some(Boolean) && !applying;
  const failed = outcomes.filter((o) => o && !o.ok).length;
  const succeeded = outcomes.filter((o) => o && o.ok).length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-sm font-semibold flex items-center gap-2">
          <ClipboardPaste className="w-4 h-4 text-primary" />
          Import HR roster
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Updates position, pay plan/series/grade, cost center and dates for SF-52s and evaluations.
          People not in Staff yet are added.
        </div>
      </div>

      <div className="px-4 py-4 flex-1 overflow-y-auto space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="hrRoster">Paste the rows from the HR spreadsheet</Label>
          <Textarea
            id="hrRoster"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setRows(null);
              setOutcomes([]);
            }}
            rows={6}
            placeholder={"NS GREAT LAKES\tBRACKETT ANIYA LESHELL\tRecreation Aid\tActive\tFlex Continuing\t08/11/2025\tNF 0189 01\t20087\t…"}
            className="font-mono text-xs"
            disabled={applying}
          />
          <p className="text-xs text-muted-foreground">
            In Excel, select the rows (the header row is fine too), copy, and paste here.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={preview} disabled={!text.trim() || applying}>
            Preview
          </Button>
        </div>

        {fatal && (
          <p className="text-sm text-red-700 dark:text-red-400 flex items-start gap-1.5">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {fatal}
          </p>
        )}
        {parseErrors.length > 0 && (
          <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
            {parseErrors.map((e) => (
              <li key={`${e.line}-${e.message}`}>Line {e.line}: {e.message}</li>
            ))}
          </ul>
        )}

        {rows && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {counts.update} to update · {counts.create} to add · {counts.skip} skipped
            </p>
            {rows.map((row, i) => {
              const decision = decisions[i];
              const p = plan(row, decision);
              const outcome = outcomes[i];
              const note = decision !== "new" && decision !== "skip" ? REASON_NOTE[reasons[i]] : "";
              const newName = scheduleMatch[i] || displayNameFor(row);
              const dupe = decision !== "skip" && decision !== "new" && duplicatePicks.has(decision);
              return (
                <div key={row.line} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{row.rawName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.position || "—"} · {[row.payPlan, row.occSeries, row.grade].filter(Boolean).join("-") || "—"}
                        {row.employeeSubgroup ? ` · ${row.employeeSubgroup}` : ""}
                        {row.employmentStatus && row.employmentStatus.toLowerCase() !== "active"
                          ? ` · ${row.employmentStatus}`
                          : ""}
                      </p>
                    </div>
                    <select
                      aria-label={`What to do with ${row.rawName}`}
                      value={decision}
                      onChange={(e) =>
                        setDecisions((d) => d.map((x, ix) => (ix === i ? e.target.value : x)))
                      }
                      disabled={applying || !!outcome?.ok}
                      className="w-full sm:w-64 px-2 py-2 rounded-lg border border-input bg-background text-sm"
                    >
                      <option value="new">Add as new: {newName}</option>
                      <option value="skip">Skip</option>
                      <optgroup label="Update existing staff">
                        {sortedStaff.map((s) => (
                          <option key={s.id} value={s.id}>
                            Update {s.full_name}
                            {s.is_active ? "" : " (inactive)"}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>

                  {note && <p className="text-xs text-amber-700 dark:text-amber-400">{note}</p>}
                  {dupe && (
                    <p className="text-xs text-red-700 dark:text-red-400">
                      This person is picked for more than one row — choose a different one.
                    </p>
                  )}

                  {decision === "new" && (
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <UserPlus className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      Creates {newName} with all HR details filled in.
                    </p>
                  )}
                  {decision === "skip" && (
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <MinusCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Not imported.
                    </p>
                  )}
                  {p.existing &&
                    (p.changes.length > 0 ? (
                      <ul className="text-xs text-muted-foreground space-y-0.5">
                        {p.changes.map((c) => (
                          <li key={c} className="flex items-start gap-1.5">
                            <UserCheck className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" /> {c}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">Already up to date.</p>
                    ))}

                  {outcome && (
                    <p
                      className={`text-xs flex items-start gap-1.5 ${
                        outcome.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"
                      }`}
                    >
                      {outcome.ok ? (
                        <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      )}
                      {outcome.text}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {finished
            ? failed > 0
              ? `${succeeded} saved, ${failed} failed — see the red notes.`
              : `All ${succeeded} saved.`
            : ""}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={applying}>
            {finished ? "Done" : "Cancel"}
          </Button>
          {rows && (!finished || failed > 0) && (
            <Button
              onClick={apply}
              disabled={applying || counts.update + counts.create === 0 || duplicatePicks.size > 0}
              className="gap-2"
            >
              {applying && <Loader2 className="w-4 h-4 animate-spin" />}
              {applying ? "Saving…" : failed > 0 ? `Retry ${failed} failed` : `Apply ${counts.update + counts.create}`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
