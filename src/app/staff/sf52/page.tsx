"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Download, FileText, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/hooks/useAuth";
import { useProfiles, roleLabels } from "@/lib/hooks/useProfiles";
import { directSelectRow } from "@/lib/supabase/rest";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import { generateSf52Report, sf52Filename } from "@/lib/reports/sf52-report";
import { saveCreatedDocument } from "@/lib/documents/saved-documents";
import {
  SF52_ACTIONS,
  getSf52Action,
  buildSf52Data,
  composeSf52Name,
  EMPTY_SF52_INPUTS,
  type Sf52FormInputs,
} from "@/lib/sf52/actions";
import { SF52_FACILITY } from "@/lib/sf52/constants";
import type { FullProfile } from "@/lib/staff/types";
import type { PersonnelDetails, UserRole } from "@/types/database";

const selectCls =
  "w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base";

function Sf52Content() {
  const router = useRouter();
  const params = useSearchParams();
  const { profile } = useAuth();
  const { profiles } = useProfiles();

  const [actionKey, setActionKey] = useState("recruitment");
  const action = getSf52Action(actionKey);

  const [employeeId, setEmployeeId] = useState(params.get("employee") || "");
  const [pd, setPd] = useState<PersonnelDetails | null>(null);
  const [employeeName, setEmployeeName] = useState("");

  const [form, setForm] = useState<Sf52FormInputs>({ ...EMPTY_SF52_INPUTS });
  const update = (k: keyof Sf52FormInputs, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const employees = useMemo(
    () => [...profiles].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [profiles],
  );

  // Preparer (box 3) defaults to the current user.
  useEffect(() => {
    if (!profile) return;
    setForm((f) =>
      f.preparerName
        ? f
        : {
            ...f,
            preparerName: [profile.full_name, roleLabels[profile.role as UserRole]].filter(Boolean).join(", "),
            preparerPhone: profile.phone || "",
          },
    );
  }, [profile]);

  // Reset box-1 text to the action default when the action changes.
  useEffect(() => {
    setForm((f) => ({ ...f, box1: getSf52Action(actionKey).box1 }));
    setDone(false);
  }, [actionKey]);

  // Load the selected employee's personnel details and seed the TO (new)
  // position with their current values (so e.g. a pay increase only needs the
  // new rate typed in).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!employeeId) {
        setPd(null);
        setEmployeeName("");
        return;
      }
      const row = await directSelectRow<FullProfile>("profiles", "id", employeeId, "*", "sf52.employee");
      if (cancelled) return;
      const details = row?.personnel_details || null;
      setPd(details);
      setEmployeeName(row?.full_name || "");
      setForm((f) => ({
        ...f,
        toPositionTitle: details?.position_title || "",
        toPositionNumber: details?.position_number || "",
        toPayPlan: details?.pay_plan || "",
        toOccSeries: details?.occ_series || "",
        toPayBand: details?.pay_band || "",
        toStep: details?.step || "",
        toHourlyRate: details?.hourly_rate || "",
        proposedSalaryRange: f.proposedSalaryRange || (details?.hourly_rate ? `$${details.hourly_rate} / hr` : ""),
      }));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const lastName = pd?.name_last || employeeName.split(/\s+/).slice(-1)[0] || "Employee";
  const positionTitle = pd?.position_title || form.toPositionTitle || "Position";

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const data = buildSf52Data(action, pd, form);
      const filename = sf52Filename(action.box1, lastName, positionTitle);
      const { blob } = await generateSf52Report(data, filename);
      await saveBlobToDevice({ blob, filename, shareTitle: filename });
      await saveCreatedDocument({
        docType: "sf52",
        title: `SF-52 — ${action.label}${employeeName ? ` — ${employeeName}` : ""}`,
        blob,
        filename,
        meta: { action: action.key, employee_id: employeeId || null },
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate the SF-52.");
    } finally {
      setBusy(false);
    }
  }

  const needsEmployee = action.fillFrom || action.key !== "recruitment";
  const canGenerate = !!form.box1.trim() && (!needsEmployee || !!employeeId);

  return (
    <div className="p-4 md:p-6 pb-28 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#1B4332]" />
          <h1 className="text-xl font-bold">Create SF-52</h1>
        </div>
      </div>

      <div className="space-y-5">
        {/* Action + employee */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="action">Personnel action</Label>
            <select id="action" value={actionKey} onChange={(e) => setActionKey(e.target.value)} className={selectCls}>
              {SF52_ACTIONS.map((a) => (
                <option key={a.key} value={a.key}>{a.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="employee">
              {action.key === "recruitment" ? "Position based on (departing employee)" : "Employee"}
            </Label>
            <select id="employee" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={selectCls}>
              <option value="">{action.key === "recruitment" ? "— New / vacant —" : "— Select —"}</option>
              {employees.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        {needsEmployee && employeeId && !pd && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              This employee has no Personnel details saved yet, so position/pay boxes will be blank. Add them on their{" "}
              <button className="underline" onClick={() => router.push(`/staff/profile?id=${employeeId}`)}>profile</button>.
            </span>
          </div>
        )}

        {/* Part A */}
        <Section title="Part A — Request">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Action requested (box 1)</Label>
              <Input value={form.box1} onChange={(e) => update("box1", e.target.value)} />
            </div>
            {action.usesVice && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Vice (former employee being replaced)</Label>
                <Input value={form.vice} onChange={(e) => update("vice", e.target.value)} placeholder="e.g. John A. Smith" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Proposed effective date</Label>
              <Input type="date" value={form.proposedEffectiveDate} onChange={(e) => update("proposedEffectiveDate", e.target.value)} />
              <p className="text-xs text-muted-foreground">{action.effectiveDateHint}</p>
            </div>
            <div className="space-y-1.5">
              <Label>For more info, call (preparer)</Label>
              <Input value={form.preparerName} onChange={(e) => update("preparerName", e.target.value)} />
              <Input value={form.preparerPhone} onChange={(e) => update("preparerPhone", e.target.value)} placeholder="Phone" />
            </div>
          </div>
        </Section>

        {/* TO position (new values) */}
        {action.fillTo && (
          <Section title={action.key === "recruitment" ? "Position to fill (TO)" : "New position / pay (TO)"}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Position title</Label><Input value={form.toPositionTitle} onChange={(e) => update("toPositionTitle", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Position number (PD#)</Label><Input value={form.toPositionNumber} onChange={(e) => update("toPositionNumber", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              <div className="space-y-1.5"><Label className="text-xs">Pay plan</Label><Input value={form.toPayPlan} onChange={(e) => update("toPayPlan", e.target.value)} placeholder="NF" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Occ. series</Label><Input value={form.toOccSeries} onChange={(e) => update("toOccSeries", e.target.value)} placeholder="0189" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Pay band</Label><Input value={form.toPayBand} onChange={(e) => update("toPayBand", e.target.value)} placeholder="02" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Hourly rate</Label><Input value={form.toHourlyRate} onChange={(e) => update("toHourlyRate", e.target.value)} placeholder="17.25" /></div>
            </div>
          </Section>
        )}

        {/* Part D — recruitment */}
        {action.extra === "D" && (
          <Section title="Part D — Recruitment details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label># of positions to hire</Label><Input value={form.numRecruitments} onChange={(e) => update("numRecruitments", e.target.value)} placeholder="1" /></div>
              <div className="space-y-1.5"><Label>Area of consideration</Label><Input value={form.areasOfConsideration} onChange={(e) => update("areasOfConsideration", e.target.value)} placeholder="ALL AREAS or INTERNAL" /></div>
              <div className="space-y-1.5"><Label>Proposed hourly salary range</Label><Input value={form.proposedSalaryRange} onChange={(e) => update("proposedSalaryRange", e.target.value)} placeholder="$17.25 - $19.00 / hr" /></div>
              <div className="space-y-1.5"><Label>Relocation authorized</Label><Input value={form.relocationAuth} onChange={(e) => update("relocationAuth", e.target.value)} placeholder="No" /></div>
            </div>
            <div className="space-y-1.5 mt-3"><Label>Other notes for HR</Label><Textarea rows={3} value={form.otherNotes} onChange={(e) => update("otherNotes", e.target.value)} placeholder="e.g. Must work nights, weekends, holidays. Tip eligible. Post for two weeks." /></div>
          </Section>
        )}

        {/* Part E — resignation */}
        {action.extra === "E" && (
          <Section title="Part E — Resignation">
            <div className="space-y-1.5"><Label>Reason for resignation</Label><Textarea rows={4} value={form.reasonForResign} onChange={(e) => update("reasonForResign", e.target.value)} placeholder="Date of notice; how it was provided (verbal/email/letter); brief reason. Do not include performance issues or opinions." /></div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <div className="space-y-1.5"><Label>Effective date</Label><Input type="date" value={form.resignEffectiveDate} onChange={(e) => update("resignEffectiveDate", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Date signed</Label><Input type="date" value={form.dateSigned} onChange={(e) => update("dateSigned", e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Conflicting reasons?</Label>
                <select value={form.conflictingReasons} onChange={(e) => update("conflictingReasons", e.target.value)} className={selectCls}>
                  <option value="">—</option>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5 mt-3"><Label>Forwarding address (for tax forms)</Label><Input value={form.forwardingAddress} onChange={(e) => update("forwardingAddress", e.target.value)} placeholder="Street, City, State, ZIP" /></div>
            <p className="text-xs text-muted-foreground mt-2">The employee&apos;s signature line is left blank to sign by hand.</p>
          </Section>
        )}

        {/* Part F — other actions */}
        {action.extra === "F" && (
          <Section title="Part F — Remarks">
            <div className="space-y-1.5"><Label>Remarks for SF-50</Label><Textarea rows={4} value={form.partFRemarks} onChange={(e) => update("partFRemarks", e.target.value)} placeholder="Dates, amounts, and reason for the action." /></div>
          </Section>
        )}

        {/* Auto-filled summary */}
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Auto-filled from the employee &amp; facility:</p>
          {action.fillFrom && <p>Current position: {pd ? composeFrom(pd) : "—"}</p>}
          <p>Name: {action.key === "recruitment" ? "(blank — vacancy)" : composeSf52Name(pd) || "—"}</p>
          <p>Work schedule: {pd?.work_schedule || "—"} · FLSA: {pd?.flsa || "—"} · Cost center: {pd?.cost_center || "—"}</p>
          <p>Duty station: {SF52_FACILITY.dutyStation} ({SF52_FACILITY.dutyStationCode})</p>
          <p>Approval/signature blocks are left blank to sign by hand. SSN and date of birth are never filled.</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}
        {done && (
          <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800 flex items-start gap-2">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> SF-52 downloaded and saved to Documents.
          </div>
        )}

        <Button onClick={handleGenerate} disabled={busy || !canGenerate} className="gap-2 bg-[#1B4332] hover:bg-[#2D6A4F]">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {busy ? "Generating…" : "Generate & Download SF-52"}
        </Button>
      </div>
    </div>
  );
}

function composeFrom(pd: PersonnelDetails): string {
  const t = [pd.position_title, pd.position_number ? `PD# ${pd.position_number}` : ""].filter(Boolean).join(" / ");
  const pay = [pd.pay_plan, pd.occ_series, pd.pay_band].filter(Boolean).join("-");
  return [t, pay, pd.hourly_rate ? `$${pd.hourly_rate}/hr` : ""].filter(Boolean).join(" · ") || "—";
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-3 space-y-1">
      <p className="text-sm font-semibold mb-1">{title}</p>
      {children}
    </div>
  );
}

export default function Sf52Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}>
      <Sf52Content />
    </Suspense>
  );
}
