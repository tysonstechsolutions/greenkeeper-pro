"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Download, FileText, AlertTriangle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/hooks/useAuth";
import { useProfiles } from "@/lib/hooks/useProfiles";
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
import {
  PAY_PLANS,
  PAY_SCALE_STEPS,
  PAY_SCALE_YEAR,
  payScaleGrades,
  lookupPayRate,
  formatPayRate,
  type PayPlan,
} from "@/lib/sf52/payscale";
import type { FullProfile } from "@/lib/staff/types";
import type { PersonnelDetails } from "@/types/database";

const selectCls =
  "w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base";

/** The office's standard Part E reason skeleton — the last line is the personal reason. */
const REASON_SKELETON =
  "Notified leadership 2 weeks prior to resignation date\nVerbal\nEmployee is no longer employed with us\n";

const pad2 = (n: number) => String(n).padStart(2, "0");

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

  // Reset box-1 text (and the Part E skeleton) when the action changes.
  useEffect(() => {
    const a = getSf52Action(actionKey);
    setForm((f) => ({
      ...f,
      box1: a.box1,
      reasonForResign: a.extra === "E" && !f.reasonForResign ? REASON_SKELETON : f.reasonForResign,
    }));
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
        proposedSalaryRange:
          f.proposedSalaryRange || (details?.hourly_rate ? `$${details.hourly_rate}` : ""),
      }));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [employeeId]);

  const onScale = PAY_PLANS.includes(form.toPayPlan as PayPlan);
  const scaleGrade = parseInt(form.toPayBand, 10);
  const scaleStep = parseInt(form.toStep, 10);

  /** Apply a pay-scale pick: update plan/grade/step and auto-fill the rate. */
  function applyPay(plan: string, gradeStr: string, stepStr: string) {
    setForm((f) => {
      const next = { ...f, toPayPlan: plan, toPayBand: gradeStr, toStep: stepStr };
      const rate = lookupPayRate(plan, parseInt(gradeStr, 10), parseInt(stepStr, 10) || 1);
      if (rate !== null) {
        next.toHourlyRate = formatPayRate(rate);
        next.proposedSalaryRange = `$${formatPayRate(rate)}`;
      }
      return next;
    });
  }

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
              <Label>For more info, call (box 3 — optional)</Label>
              <Input value={form.preparerName} onChange={(e) => update("preparerName", e.target.value)} placeholder={profile?.full_name || "Name"} />
              <Input value={form.preparerPhone} onChange={(e) => update("preparerPhone", e.target.value)} placeholder="Phone" />
            </div>
            <div className="space-y-1.5">
              <Label>Requested by (box 5)</Label>
              <Input value={form.requestedBy} onChange={(e) => update("requestedBy", e.target.value)} />
              <p className="text-xs text-muted-foreground">Typed name/title — you sign it in Adobe with your CAC.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Authorized by (box 6)</Label>
              <Input value={form.authorizedBy} onChange={(e) => update("authorizedBy", e.target.value)} />
            </div>
          </div>
        </Section>

        {/* TO position (new values) */}
        {action.fillTo && (
          <Section title={action.key === "recruitment" ? "Position to fill (TO)" : "New position / pay (TO)"}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Position title</Label><Input value={form.toPositionTitle} onChange={(e) => update("toPositionTitle", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Position number (optional)</Label><Input value={form.toPositionNumber} onChange={(e) => update("toPositionNumber", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Pay plan</Label>
                <select
                  value={onScale ? form.toPayPlan : form.toPayPlan ? "__other" : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__other") update("toPayPlan", "NF");
                    else if (PAY_PLANS.includes(v as PayPlan)) applyPay(v, form.toPayBand || "01", form.toStep || "1");
                    else update("toPayPlan", "");
                  }}
                  className={selectCls}
                >
                  <option value="">—</option>
                  {PAY_PLANS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                  <option value="__other">Other (NF…)</option>
                </select>
              </div>
              {onScale ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Grade</Label>
                    <select
                      value={Number.isFinite(scaleGrade) ? String(scaleGrade) : ""}
                      onChange={(e) => applyPay(form.toPayPlan, pad2(parseInt(e.target.value, 10) || 1), form.toStep || "1")}
                      className={selectCls}
                    >
                      <option value="">—</option>
                      {payScaleGrades(form.toPayPlan as PayPlan).map((g) => (
                        <option key={g} value={g}>{pad2(g)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Step</Label>
                    <select
                      value={Number.isFinite(scaleStep) ? String(scaleStep) : ""}
                      onChange={(e) => applyPay(form.toPayPlan, form.toPayBand || "01", e.target.value)}
                      className={selectCls}
                    >
                      <option value="">—</option>
                      {PAY_SCALE_STEPS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5"><Label className="text-xs">Pay plan (typed)</Label><Input value={form.toPayPlan} onChange={(e) => update("toPayPlan", e.target.value)} placeholder="NF" /></div>
                  <div className="space-y-1.5"><Label className="text-xs">Band / grade</Label><Input value={form.toPayBand} onChange={(e) => update("toPayBand", e.target.value)} placeholder="02" /></div>
                </>
              )}
              <div className="space-y-1.5"><Label className="text-xs">Occ. series</Label><Input value={form.toOccSeries} onChange={(e) => update("toOccSeries", e.target.value)} placeholder="4749" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Hourly rate</Label><Input value={form.toHourlyRate} onChange={(e) => update("toHourlyRate", e.target.value)} placeholder="22.50" /></div>
            </div>
            {onScale && (
              <p className="text-xs text-muted-foreground mt-2">
                Rate auto-filled from the {PAY_SCALE_YEAR} Great Lakes NAF wage schedule — override it if needed.
              </p>
            )}
          </Section>
        )}

        {/* Part D — recruitment */}
        {action.extra === "D" && (
          <Section title="Part D — Recruitment details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label># of positions to hire</Label><Input value={form.numRecruitments} onChange={(e) => update("numRecruitments", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Area of consideration</Label><Input value={form.areasOfConsideration} onChange={(e) => update("areasOfConsideration", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Proposed hourly salary</Label><Input value={form.proposedSalaryRange} onChange={(e) => update("proposedSalaryRange", e.target.value)} placeholder="$22.50" /></div>
              <div className="space-y-1.5"><Label>Relocation authorized</Label><Input value={form.relocationAuth} onChange={(e) => update("relocationAuth", e.target.value)} /></div>
            </div>
            <div className="space-y-1.5 mt-3"><Label>Other notes for HR</Label><Textarea rows={3} value={form.otherNotes} onChange={(e) => update("otherNotes", e.target.value)} placeholder="e.g. Open for 14 days. Must be able to work Monday-Friday 0700-1530." /></div>
          </Section>
        )}

        {/* Part E — resignation */}
        {action.extra === "E" && (
          <Section title="Part E — Resignation">
            <div className="space-y-1.5">
              <Label>Reason for resignation</Label>
              <Textarea rows={5} value={form.reasonForResign} onChange={(e) => update("reasonForResign", e.target.value)} />
              <p className="text-xs text-muted-foreground">
                One item per line — notice given, how (verbal/written), status, and the employee&apos;s reason. Keep it factual.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <div className="space-y-1.5">
                <Label>Date signed (optional)</Label>
                <Input type="date" value={form.dateSigned} onChange={(e) => update("dateSigned", e.target.value)} />
                <p className="text-xs text-muted-foreground">Leave blank for the employee to write when they sign.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Conflicting reasons? (optional)</Label>
                <select value={form.conflictingReasons} onChange={(e) => update("conflictingReasons", e.target.value)} className={selectCls}>
                  <option value="">— leave unchecked —</option>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
            </div>
            <div className="space-y-1.5 mt-3"><Label>Forwarding address (for tax forms)</Label><Input value={form.forwardingAddress} onChange={(e) => update("forwardingAddress", e.target.value)} placeholder="Street, City, State, ZIP" /></div>
            <p className="text-xs text-muted-foreground mt-2">
              The resignation effective date is the proposed effective date above (Part B box 4 and Part E box 2 are the same box on the form). The employee&apos;s signature line stays blank.
            </p>
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
          <p>
            The download is the real fillable form — every box stays a live (blue) field you can edit or
            CAC-sign in Adobe. Signature blocks are never pre-filled; SSN and date of birth are never filled.
          </p>
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
  const t = [pd.position_title, pd.position_number].filter(Boolean).join(" ");
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
