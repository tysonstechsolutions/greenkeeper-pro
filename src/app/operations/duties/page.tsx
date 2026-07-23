"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Link2, Loader2, Pencil, Printer, RefreshCw, Save, ShieldCheck, UserRoundCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DUTY_DEPARTMENT_LABELS,
  DUTY_ROLE_GROUP_LABELS,
  DUTY_ROLE_GROUP_ORDER,
  assignmentForDate,
  dutyScheduleLabel,
  previewActiveDutyReassignment,
} from "@/lib/operations/duties";
import { buildRoleDutySheetsHtml } from "@/lib/operations/print-role-sheets";
import { useDutyManagement, type CoveragePreviewRow, type RecurrencePreviewRow } from "@/lib/operations/use-duty-management";
import type {
  DutyCadence,
  DutyDepartment,
  DutyEvidenceRequirement,
  DutyRecurrenceRule,
  DutyRoleGroup,
  OperationDuty,
  RequirementState,
} from "@/lib/operations/types";

const WEEKDAYS = [
  ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"],
  ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"],
] as const;

const EMPLOYEE_GROUPS = new Set<DutyRoleGroup>([
  "recreation_aide", "golf_operations_assistant", "maintenance_staff",
  "restaurant_staff", "pro_shop_staff", "general_manager",
]);

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

interface DutyFormState {
  id: string | null;
  title: string;
  department: DutyDepartment;
  roleGroup: DutyRoleGroup;
  cadence: DutyCadence;
  interval: string;
  weekdays: string[];
  dayOfMonth: string;
  annualMonth: string;
  season: "in_season" | "year_round";
  seasonalStart: string;
  seasonalEnd: string;
  estimatedMinutes: string;
  instructions: string;
  equipment: string;
  equipmentState: RequirementState;
  requiredDocument: string;
  standardReference: string;
  evidence: string;
  evidenceState: RequirementState;
  verificationState: RequirementState;
  priority: "critical" | "high" | "normal" | "low";
  primaryProfileId: string;
  backupProfileId: string;
  contractorVendorId: string;
  activeFrom: string;
  activeThrough: string;
  isActive: boolean;
  inactiveReason: string;
  assignmentDate: string;
  assignmentReason: string;
  recurrenceEffectiveDate: string;
  recurrenceReason: string;
  sortOrder: number;
}

function emptyForm(sortOrder = 10): DutyFormState {
  const today = todayLocal();
  return {
    id: null, title: "", department: "maintenance", roleGroup: "maintenance_staff",
    cadence: "weekly", interval: "1", weekdays: ["mon"], dayOfMonth: "1",
    annualMonth: String(new Date().getMonth() + 1), season: "year_round",
    seasonalStart: "", seasonalEnd: "", estimatedMinutes: "", instructions: "",
    equipment: "", equipmentState: "not_recorded", requiredDocument: "",
    standardReference: "", evidence: "", evidenceState: "not_recorded",
    verificationState: "not_recorded", priority: "normal", primaryProfileId: "",
    backupProfileId: "", contractorVendorId: "", activeFrom: today,
    activeThrough: "", isActive: true, inactiveReason: "", assignmentDate: today,
    assignmentReason: "", recurrenceEffectiveDate: today, recurrenceReason: "", sortOrder,
  };
}

function areaForDepartment(department: DutyDepartment): OperationDuty["area"] {
  if (department === "maintenance") return "course";
  if (department === "food_and_beverage") return "restaurant";
  if (department === "pro_shop") return "pro_shop";
  if (department === "golf_operations") return "golf_operations";
  if (department === "external") return "external";
  return "administration";
}

function csv(value: string): string[] {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function evidenceItems(value: string): DutyEvidenceRequirement[] {
  return csv(value).map((label, index) => {
    const normalized = label.toLowerCase();
    const type = normalized.includes("before") && normalized.includes("photo")
      ? "photo_before"
      : normalized.includes("photo")
        ? "photo_after"
        : "record";
    return { key: `requirement-${index + 1}`, type, label };
  });
}

function buildRule(form: DutyFormState): DutyRecurrenceRule {
  const base = { cadence: form.cadence, interval: Math.max(1, Number(form.interval) || 1) };
  if (form.cadence === "daily" || form.cadence === "weekly") return { ...base, weekdays: form.weekdays };
  if (form.cadence === "annual") return { ...base, day_of_month: Number(form.dayOfMonth), months: [Number(form.annualMonth)] };
  return { ...base, day_of_month: Number(form.dayOfMonth) };
}

function rulesEqual(a: DutyRecurrenceRule | undefined, b: DutyRecurrenceRule): boolean {
  if (!a) return false;
  return a.cadence === b.cadence
    && a.interval === b.interval
    && a.day_of_month === b.day_of_month
    && (a.months ?? []).join(",") === (b.months ?? []).join(",")
    && (a.weekdays ?? []).join(",") === (b.weekdays ?? []).join(",");
}

export default function DutiesPage() {
  const management = useDutyManagement();
  const nextSort = management.duties.reduce((max, duty) => Math.max(max, duty.sort_order), 0) + 10;
  const [form, setForm] = useState<DutyFormState>(() => emptyForm());
  const [notice, setNotice] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const [fromProfileId, setFromProfileId] = useState("");
  const [replacementProfileId, setReplacementProfileId] = useState("");
  const [reassignDate, setReassignDate] = useState(todayLocal());
  const [reassignReason, setReassignReason] = useState("");

  const [coverageDutyId, setCoverageDutyId] = useState("");
  const [coverageOwnerType, setCoverageOwnerType] = useState<"employee" | "contractor" | "unassigned">("employee");
  const [coveragePrimary, setCoveragePrimary] = useState("");
  const [coverageBackup, setCoverageBackup] = useState("");
  const [coverageContractor, setCoverageContractor] = useState("");
  const [coverageStart, setCoverageStart] = useState(todayLocal());
  const [coverageEnd, setCoverageEnd] = useState(todayLocal());
  const [coverageReason, setCoverageReason] = useState("");
  const [coveragePreview, setCoveragePreview] = useState<CoveragePreviewRow[] | null>(null);

  const [recurrencePreview, setRecurrencePreview] = useState<RecurrencePreviewRow[] | null>(null);
  const [rosterStaffId, setRosterStaffId] = useState("");
  const [rosterProfileId, setRosterProfileId] = useState("");
  const [rosterReason, setRosterReason] = useState("");

  const reassignmentPreview = useMemo(() => fromProfileId
    ? previewActiveDutyReassignment(management.duties, management.assignments, fromProfileId, reassignDate)
    : [], [management.duties, management.assignments, fromProfileId, reassignDate]);

  const groupedDuties = useMemo(() => {
    const grouped = new Map<DutyRoleGroup, OperationDuty[]>();
    for (const duty of management.duties.filter((item) => item.is_active)) {
      const group = duty.role_group ?? "unassigned";
      grouped.set(group, [...(grouped.get(group) ?? []), duty]);
    }
    return grouped;
  }, [management.duties]);

  const set = <K extends keyof DutyFormState>(key: K, value: DutyFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (["cadence", "interval", "weekdays", "dayOfMonth", "annualMonth"].includes(key)) setRecurrencePreview(null);
  };

  const editDuty = (duty: OperationDuty) => {
    const current = assignmentForDate(management.assignments, duty.id, todayLocal());
    const rule = duty.recurrence_rule;
    setForm({
      id: duty.id, title: duty.title, department: duty.department ?? "maintenance",
      roleGroup: duty.role_group ?? "unassigned", cadence: duty.cadence ?? rule?.cadence ?? "weekly",
      interval: String(rule?.interval ?? 1), weekdays: rule?.weekdays ?? duty.days,
      dayOfMonth: String(rule?.day_of_month ?? 1), annualMonth: String(rule?.months?.[0] ?? new Date().getMonth() + 1),
      season: duty.season, seasonalStart: duty.seasonal_start_mmdd ?? "", seasonalEnd: duty.seasonal_end_mmdd ?? "",
      estimatedMinutes: duty.estimated_minutes == null ? "" : String(duty.estimated_minutes),
      instructions: duty.instructions ?? "", equipment: (duty.equipment_needed ?? []).join(", "),
      equipmentState: duty.equipment_requirement_state ?? "not_recorded",
      requiredDocument: duty.required_document ?? "", standardReference: duty.standard_reference ?? "",
      evidence: (duty.evidence_requirements ?? []).map((item) => item.label).join(", "),
      evidenceState: duty.evidence_requirement_state ?? "not_recorded",
      verificationState: duty.verification_requirement_state ?? "not_recorded",
      priority: duty.priority ?? "normal", primaryProfileId: current?.primary_profile_id ?? "",
      backupProfileId: current?.backup_profile_id ?? "", contractorVendorId: current?.contractor_vendor_id ?? "",
      activeFrom: duty.active_from ?? todayLocal(), activeThrough: duty.active_through ?? "",
      isActive: duty.is_active, inactiveReason: duty.inactive_reason ?? "", assignmentDate: todayLocal(),
      assignmentReason: "", recurrenceEffectiveDate: todayLocal(), recurrenceReason: "", sortOrder: duty.sort_order,
    });
    setNotice(null); setLocalError(null); setRecurrencePreview(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const validateForm = (): string | null => {
    if (!form.title.trim()) return "A duty title is required.";
    if (!form.activeFrom) return "A duty start date is required.";
    if (form.activeThrough && form.activeThrough < form.activeFrom) return "Duty end date cannot precede its start date.";
    if (!form.isActive && !form.inactiveReason.trim()) return "Record why this duty is inactive.";
    if ((form.seasonalStart && !form.seasonalEnd) || (!form.seasonalStart && form.seasonalEnd)) return "Record both seasonal dates or leave both blank.";
    if (form.season === "year_round" && (form.seasonalStart || form.seasonalEnd)) return "Year-round duties cannot have seasonal boundaries.";
    if ((form.cadence === "daily" || form.cadence === "weekly") && form.weekdays.length === 0) return "Choose at least one weekday.";
    const day = Number(form.dayOfMonth);
    if (!["daily", "weekly"].includes(form.cadence) && !(day === -1 || (day >= 1 && day <= 28))) return "Day of month must be 1-28 or -1 for the last day.";
    if (form.evidenceState === "required" && evidenceItems(form.evidence).length === 0) return "Record at least one evidence requirement.";
    if (form.equipmentState === "required" && csv(form.equipment).length === 0) return "Record the required equipment.";
    return null;
  };

  const save = async () => {
    setLocalError(null); setNotice(null);
    const validation = validateForm();
    if (validation) return setLocalError(validation);
    const existingDuty = form.id ? management.duties.find((duty) => duty.id === form.id) ?? null : null;
    const requestedRule = buildRule(form);
    if (existingDuty && (!rulesEqual(existingDuty.recurrence_rule, requestedRule) || existingDuty.cadence !== form.cadence)) {
      return setLocalError("Recurrence changed. Preview and confirm Change future occurrences before saving definition details.");
    }
    const minutes = form.estimatedMinutes.trim() ? Number(form.estimatedMinutes) : null;
    if (minutes != null && (!Number.isFinite(minutes) || minutes <= 0)) return setLocalError("Estimated minutes must be positive or not recorded.");
    const employeeGroup = EMPLOYEE_GROUPS.has(form.roleGroup);
    try {
      await management.saveDuty({
        id: form.id ?? undefined,
        duty: {
          title: form.title.trim(), area: areaForDepartment(form.department), department: form.department,
          role_group: form.roleGroup, days: form.weekdays, season: form.season, cadence: form.cadence,
          recurrence_rule: requestedRule, estimated_minutes: minutes, instructions: form.instructions.trim() || null,
          equipment_needed: form.equipmentState === "required" ? csv(form.equipment) : [],
          equipment_requirement_state: form.equipmentState, required_document: form.requiredDocument.trim() || null,
          standard_reference: form.standardReference.trim() || null,
          evidence_requirements: form.evidenceState === "required" ? evidenceItems(form.evidence) : [],
          evidence_requirement_state: form.evidenceState,
          manager_verification_required: form.verificationState === "required",
          verification_requirement_state: form.verificationState,
          task_category: form.department === "maintenance" ? "grounds" : form.department === "pro_shop" ? "pro_shop" : "admin",
          priority: form.priority, active_from: form.activeFrom, active_through: form.activeThrough || null,
          inactive_reason: form.isActive ? null : form.inactiveReason.trim(),
          seasonal_start_mmdd: form.seasonalStart || null, seasonal_end_mmdd: form.seasonalEnd || null,
          legacy_source: existingDuty?.legacy_source ?? null, legacy_source_id: existingDuty?.legacy_source_id ?? null,
          note: null, is_active: form.isActive, sort_order: form.sortOrder || nextSort,
        },
        primaryProfileId: employeeGroup ? form.primaryProfileId || null : null,
        backupProfileId: employeeGroup ? form.backupProfileId || null : null,
        contractorVendorId: form.roleGroup === "contractor" ? form.contractorVendorId || null : null,
        assignmentEffectiveDate: form.assignmentDate, assignmentReason: form.assignmentReason,
      });
      setNotice(form.id ? "Duty definition saved atomically." : "Duty and initial ownership created atomically.");
      setForm(emptyForm(nextSort + 10));
    } catch (caught) { setLocalError(caught instanceof Error ? caught.message : "Could not save duty."); }
  };

  const previewFutureRecurrence = async () => {
    if (!form.id) return;
    if (!form.recurrenceEffectiveDate || !form.recurrenceReason.trim()) return setLocalError("Effective date and reason are required for future recurrence changes.");
    try {
      setLocalError(null);
      setRecurrencePreview(await management.previewRecurrence({
        dutyId: form.id, effectiveDate: form.recurrenceEffectiveDate, cadence: form.cadence,
        recurrenceRule: buildRule(form), reason: form.recurrenceReason,
      }));
    } catch (error) { setLocalError(error instanceof Error ? error.message : "Could not preview recurrence change."); }
  };

  const confirmFutureRecurrence = async () => {
    if (!form.id || recurrencePreview === null) return;
    try {
      await management.changeFutureRecurrence({ dutyId: form.id, effectiveDate: form.recurrenceEffectiveDate,
        cadence: form.cadence, recurrenceRule: buildRule(form), reason: form.recurrenceReason });
      setNotice("Future recurrence revised. Protected history was preserved.");
      setForm(emptyForm(nextSort)); setRecurrencePreview(null);
    } catch (error) { setLocalError(error instanceof Error ? error.message : "Could not change recurrence."); }
  };

  const reassign = async () => {
    if (!fromProfileId || !reassignReason.trim()) return setLocalError("Choose an employee and record a reassignment reason.");
    try {
      const result = await management.reassignAll({ fromProfileId, replacementProfileId: replacementProfileId || null,
        effectiveDate: reassignDate, reason: reassignReason, dutyIds: reassignmentPreview.map((item) => item.duty.id) });
      setNotice(`${result.length} active duty assignment${result.length === 1 ? "" : "s"} updated.`);
      setFromProfileId(""); setReplacementProfileId(""); setReassignReason("");
    } catch (error) { setLocalError(error instanceof Error ? error.message : "Could not reassign duties."); }
  };

  const previewTemporaryCoverage = async () => {
    if (!coverageDutyId || !coverageReason.trim()) return setLocalError("Choose a duty and record a coverage reason.");
    try { setCoveragePreview(await management.previewCoverage(coverageDutyId, coverageStart, coverageEnd)); }
    catch (error) { setLocalError(error instanceof Error ? error.message : "Could not preview coverage."); }
  };

  const confirmTemporaryCoverage = async () => {
    if (coveragePreview === null) return;
    try {
      await management.setTemporaryCoverage({ dutyId: coverageDutyId,
        primaryProfileId: coverageOwnerType === "employee" ? coveragePrimary || null : null,
        backupProfileId: coverageOwnerType === "employee" ? coverageBackup || null : null,
        contractorVendorId: coverageOwnerType === "contractor" ? coverageContractor || null : null,
        startsOn: coverageStart, endsOn: coverageEnd, reason: coverageReason });
      setNotice("Temporary coverage saved. Later occurrences remain with the permanent owner.");
      setCoveragePreview(null); setCoverageReason("");
    } catch (error) { setLocalError(error instanceof Error ? error.message : "Could not save coverage."); }
  };

  // The wall posters: one printable page per role listing its standing duties
  // by day. Staff have no logins — the GM posts these in each work area.
  const printRoleSheets = () => {
    const html = buildRoleDutySheetsHtml(management.duties, new Date());
    const win = window.open("", "_blank");
    if (!win) return setLocalError("Allow pop-ups to print the role duty sheets.");
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  const linkRoster = async () => {
    if (!rosterStaffId || !rosterProfileId || !rosterReason.trim()) return setLocalError("Choose both records and confirm why they are the same person.");
    try {
      await management.linkLegacyRoster(rosterStaffId, rosterProfileId, rosterReason);
      setNotice("Legacy roster record linked to the authenticated profile.");
      setRosterStaffId(""); setRosterProfileId(""); setRosterReason("");
    } catch (error) { setLocalError(error instanceof Error ? error.message : "Could not link roster record."); }
  };

  if (management.loading) return <div className="gk-page mx-auto flex justify-center py-20" role="status" aria-live="polite"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Loading duties</span></div>;

  return (
    <div className="gk-page mx-auto space-y-6">
      <div><Link href="/operations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Operations</Link><h1 className="mt-3">Duty ownership</h1><p className="mt-1 text-sm text-muted-foreground">One canonical, audited system for standing work, ownership, coverage, and recurrence.</p><Button variant="outline" className="mt-3" onClick={printRoleSheets}><Printer className="h-4 w-4" />Print role duty sheets</Button></div>
      {(localError || management.error) && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{localError || management.error}</div>}
      {notice && <div role="status" aria-live="polite" className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{notice}</div>}
      {!management.canManage && <Card><CardContent className="pt-6 text-sm text-muted-foreground">You can review duties and history. Only a GM or operations manager can change them.</CardContent></Card>}

      {management.canManage && <>
        <Card>
          <CardHeader><CardTitle>{form.id ? "Edit duty definition" : "Add recurring duty"}</CardTitle><CardDescription>Definition and ownership are saved in one transaction. Recurrence changes use the separate preview below.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Duty title"><Input value={form.title} onChange={(e) => set("title", e.target.value)} /></Field>
            <Field label="Department"><select className="gk-input" value={form.department} onChange={(e) => set("department", e.target.value as DutyDepartment)}>{Object.entries(DUTY_DEPARTMENT_LABELS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Role group"><select className="gk-input" value={form.roleGroup} onChange={(e) => set("roleGroup", e.target.value as DutyRoleGroup)}>{DUTY_ROLE_GROUP_ORDER.map((value) => <option key={value} value={value}>{DUTY_ROLE_GROUP_LABELS[value]}</option>)}</select></Field>
            <Field label="Frequency"><select className="gk-input" value={form.cadence} onChange={(e) => set("cadence", e.target.value as DutyCadence)}>{["daily","weekly","monthly","quarterly","annual"].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Repeat interval"><Input type="number" min={1} value={form.interval} onChange={(e) => set("interval", e.target.value)} /></Field>
            {(form.cadence === "daily" || form.cadence === "weekly") ? <div className="md:col-span-2"><Label>Scheduled weekdays</Label><div className="mt-2 flex flex-wrap gap-2">{WEEKDAYS.map(([value,label]) => <label key={value} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={form.weekdays.includes(value)} onChange={(e) => set("weekdays", e.target.checked ? [...form.weekdays,value] : form.weekdays.filter((day) => day !== value))} />{label}</label>)}</div></div> : <Field label="Day of month (1-28, or -1 for last)"><Input type="number" min={-1} max={28} value={form.dayOfMonth} onChange={(e) => set("dayOfMonth", e.target.value)} /></Field>}
            {form.cadence === "annual" && <Field label="Annual month"><select className="gk-input" value={form.annualMonth} onChange={(e) => set("annualMonth", e.target.value)}>{Array.from({length:12},(_,i) => <option key={i+1} value={i+1}>{new Date(2026,i,1).toLocaleDateString("en-US",{month:"long"})}</option>)}</select></Field>}
            <Field label="Season"><select className="gk-input" value={form.season} onChange={(e) => { const season = e.target.value as DutyFormState["season"]; set("season", season); if (season === "year_round") setForm((current) => ({ ...current, seasonalStart: "", seasonalEnd: "" })); }}><option value="year_round">Year round</option><option value="in_season">Operating season</option></select></Field>
            {form.season === "in_season" && <><Field label="Seasonal start (MM-DD)"><Input placeholder="Not recorded" value={form.seasonalStart} onChange={(e) => set("seasonalStart", e.target.value)} /></Field><Field label="Seasonal end (MM-DD)"><Input placeholder="Not recorded" value={form.seasonalEnd} onChange={(e) => set("seasonalEnd", e.target.value)} /></Field><p className="text-xs text-muted-foreground md:col-span-2">If the operating-season dates are not recorded, no seasonal occurrences are generated. The system does not assume calendar boundaries.</p></>}
            <Field label="Duty starts"><Input type="date" value={form.activeFrom} onChange={(e) => set("activeFrom", e.target.value)} /></Field>
            <Field label="Effective end date"><Input type="date" value={form.activeThrough} onChange={(e) => set("activeThrough", e.target.value)} /></Field>
            <Field label="Estimated minutes"><Input type="number" min={1} value={form.estimatedMinutes} placeholder="Not recorded" onChange={(e) => set("estimatedMinutes", e.target.value)} /></Field>
            <div className="md:col-span-2"><Field label="Performance instructions"><Textarea value={form.instructions} placeholder="Not recorded" onChange={(e) => set("instructions", e.target.value)} /></Field></div>
            <RequirementField label="Equipment requirement" state={form.equipmentState} setState={(value) => set("equipmentState", value)} value={form.equipment} setValue={(value) => set("equipment", value)} placeholder="Comma-separated equipment" />
            <Field label="Required document or form"><Input value={form.requiredDocument} placeholder="Not recorded" onChange={(e) => set("requiredDocument", e.target.value)} /></Field>
            <Field label="Standard or policy reference"><Input value={form.standardReference} placeholder="Not recorded" onChange={(e) => set("standardReference", e.target.value)} /></Field>
            <RequirementField label="Evidence requirement" state={form.evidenceState} setState={(value) => set("evidenceState", value)} value={form.evidence} setValue={(value) => set("evidence", value)} placeholder="Comma-separated evidence" />
            <Field label="Manager verification"><select className="gk-input" value={form.verificationState} onChange={(e) => set("verificationState", e.target.value as RequirementState)}><RequirementOptions /></select></Field>
            <Field label="Priority"><select className="gk-input" value={form.priority} onChange={(e) => set("priority", e.target.value as DutyFormState["priority"])}>{["critical","high","normal","low"].map((value) => <option key={value}>{value}</option>)}</select></Field>
            {EMPLOYEE_GROUPS.has(form.roleGroup) && <><Field label="Primary employee"><select className="gk-input" value={form.primaryProfileId} onChange={(e) => set("primaryProfileId", e.target.value)}><option value="">Unassigned</option>{management.people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field><Field label="Backup employee"><select className="gk-input" value={form.backupProfileId} onChange={(e) => set("backupProfileId", e.target.value)}><option value="">Not recorded</option>{management.people.filter((p) => p.id !== form.primaryProfileId).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field></>}
            {form.roleGroup === "contractor" && <Field label="Contractor"><select className="gk-input" value={form.contractorVendorId} onChange={(e) => set("contractorVendorId", e.target.value)}><option value="">Unassigned</option>{management.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>}
            <Field label="Ownership effective date"><Input type="date" value={form.assignmentDate} onChange={(e) => set("assignmentDate", e.target.value)} /></Field>
            <Field label="Ownership reason (required only when ownership changes)"><Input value={form.assignmentReason} onChange={(e) => set("assignmentReason", e.target.value)} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />Duty is active</label>
            {!form.isActive && <Field label="Inactive reason"><Input value={form.inactiveReason} onChange={(e) => set("inactiveReason", e.target.value)} /></Field>}
            <div className="md:col-span-2 flex gap-2"><Button onClick={() => void save()} disabled={management.saving}>{management.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{form.id ? "Save definition" : "Create duty"}</Button>{form.id && <Button variant="outline" onClick={() => setForm(emptyForm(nextSort))}>Cancel</Button>}</div>
          </CardContent>
        </Card>

        {form.id && <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5" />Change future occurrences</CardTitle><CardDescription>This changes the dated recurrence version. In-progress, completed, verified, and moved history is preserved.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><Field label="Effective date"><Input type="date" value={form.recurrenceEffectiveDate} onChange={(e) => { set("recurrenceEffectiveDate",e.target.value); setRecurrencePreview(null); }} /></Field><Field label="Reason"><Input value={form.recurrenceReason} onChange={(e) => { set("recurrenceReason",e.target.value); setRecurrencePreview(null); }} /></Field></div><Button variant="outline" onClick={() => void previewFutureRecurrence()}>Preview recurrence impact</Button>{recurrencePreview && <PreviewSummary rows={recurrencePreview} />}{recurrencePreview && <Button onClick={() => void confirmFutureRecurrence()}>Confirm future recurrence</Button>}</CardContent></Card>}

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserRoundCog className="h-5 w-5" />Reassign active duties</CardTitle><CardDescription>Permanent ownership history is dated; protected occurrences are not rewritten.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><PersonSelect label="Employee changing roles" value={fromProfileId} onChange={setFromProfileId} people={management.people} /><PersonSelect label="Replacement" value={replacementProfileId} onChange={setReplacementProfileId} people={management.people.filter((p) => p.id !== fromProfileId)} empty="Leave unassigned" /><Field label="Effective date"><Input type="date" value={reassignDate} onChange={(e) => setReassignDate(e.target.value)} /></Field><Field label="Reason"><Input value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} /></Field></div>{fromProfileId && <p className="text-sm">{reassignmentPreview.length} assignment(s) affected.</p>}<Button onClick={() => void reassign()} disabled={!reassignmentPreview.length || management.saving}><RefreshCw className="h-4 w-4" />Confirm reassignment</Button></CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Temporary coverage</CardTitle><CardDescription>The permanent assignment stays intact and automatically resumes after the end date.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><Field label="Duty"><select className="gk-input" value={coverageDutyId} onChange={(e) => { setCoverageDutyId(e.target.value); setCoveragePreview(null); }}><option value="">Choose duty</option>{management.duties.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field><Field label="Temporary owner type"><select className="gk-input" value={coverageOwnerType} onChange={(e) => { setCoverageOwnerType(e.target.value as typeof coverageOwnerType); setCoveragePreview(null); }}><option value="employee">Employee</option><option value="contractor">Contractor</option><option value="unassigned">Unassigned</option></select></Field>{coverageOwnerType === "employee" && <><PersonSelect label="Temporary primary" value={coveragePrimary} onChange={(value) => { setCoveragePrimary(value); setCoveragePreview(null); }} people={management.people} /><PersonSelect label="Temporary backup" value={coverageBackup} onChange={(value) => { setCoverageBackup(value); setCoveragePreview(null); }} people={management.people.filter((p) => p.id !== coveragePrimary)} empty="Not recorded" /></>}{coverageOwnerType === "contractor" && <Field label="Temporary contractor"><select className="gk-input" value={coverageContractor} onChange={(e) => { setCoverageContractor(e.target.value); setCoveragePreview(null); }}><option value="">Choose contractor</option>{management.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>}<Field label="Starts"><Input type="date" value={coverageStart} onChange={(e) => { setCoverageStart(e.target.value); setCoveragePreview(null); }} /></Field><Field label="Ends"><Input type="date" value={coverageEnd} onChange={(e) => { setCoverageEnd(e.target.value); setCoveragePreview(null); }} /></Field><Field label="Reason"><Input value={coverageReason} onChange={(e) => { setCoverageReason(e.target.value); setCoveragePreview(null); }} /></Field></div><Button variant="outline" onClick={() => void previewTemporaryCoverage()}>Preview temporary coverage</Button>{coveragePreview && <p className="text-sm">{coveragePreview.filter((r) => r.will_move).length} pending occurrence(s) move; {coveragePreview.filter((r) => !r.will_move).length} protected occurrence(s) stay unchanged.</p>}{coveragePreview && <Button onClick={() => void confirmTemporaryCoverage()}>Confirm temporary coverage</Button>}</CardContent></Card>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" />Link legacy roster</CardTitle><CardDescription>GM-confirmed links only. Names are never matched automatically.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><Field label="Legacy roster record"><select className="gk-input" value={rosterStaffId} onChange={(e) => setRosterStaffId(e.target.value)}><option value="">Choose unlinked record</option>{management.legacyRoster.filter((r) => !r.profile_id).map((r) => <option key={r.id} value={r.id}>{r.full_name} - {r.position}</option>)}</select></Field><PersonSelect label="Authenticated profile" value={rosterProfileId} onChange={setRosterProfileId} people={management.people} /><Field label="Confirmation reason"><Input value={rosterReason} onChange={(e) => setRosterReason(e.target.value)} /></Field></div><Button onClick={() => void linkRoster()}>Confirm link</Button><p className="text-xs text-muted-foreground">{management.legacyRoster.filter((r) => r.profile_id).length} linked; {management.legacyRoster.filter((r) => !r.profile_id).length} awaiting review.</p></CardContent></Card>
      </>}

      <section><h2>Active recurring duties</h2><div className="mt-3 space-y-5">{DUTY_ROLE_GROUP_ORDER.map((group) => { const duties = groupedDuties.get(group); if (!duties?.length) return null; return <div key={group}><h3 className="text-sm font-semibold">{DUTY_ROLE_GROUP_LABELS[group]}</h3><div className="mt-2 grid gap-3 lg:grid-cols-2">{duties.map((duty) => <DutyCard key={duty.id} duty={duty} management={management} onEdit={() => editDuty(duty)} />)}</div></div>; })}{management.duties.filter((d) => d.is_active).length === 0 && <Card><CardContent className="pt-6 text-sm text-muted-foreground">No active recurring duties are recorded.</CardContent></Card>}</div></section>
      {management.duties.some((d) => !d.is_active) && <section><h2>Inactive duties</h2><div className="mt-3 grid gap-3 lg:grid-cols-2">{management.duties.filter((d) => !d.is_active).map((duty) => <DutyCard key={duty.id} duty={duty} management={management} onEdit={() => editDuty(duty)} />)}</div></section>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="block text-sm font-medium">{label}</span>{children}</label>; }
function RequirementOptions() { return <><option value="not_recorded">Not recorded</option><option value="not_required">Explicitly not required</option><option value="required">Required</option></>; }
function RequirementField({ label, state, setState, value, setValue, placeholder }: { label: string; state: RequirementState; setState: (value: RequirementState) => void; value: string; setValue: (value: string) => void; placeholder: string }) { return <div className="space-y-2"><Field label={label}><select className="gk-input" value={state} onChange={(e) => setState(e.target.value as RequirementState)}><RequirementOptions /></select></Field>{state === "required" && <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />}</div>; }
function PersonSelect({ label, value, onChange, people, empty = "Choose employee" }: { label: string; value: string; onChange: (value: string) => void; people: {id:string;full_name:string}[]; empty?: string }) { return <Field label={label}><select className="gk-input" value={value} onChange={(e) => onChange(e.target.value)}><option value="">{empty}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>; }
function PreviewSummary({ rows }: { rows: RecurrencePreviewRow[] }) { return <div className="rounded-xl border bg-muted/30 p-3 text-sm"><p>{rows.filter((r) => r.action === "cancel_pending").length} obsolete pending occurrence(s) will be cancelled.</p><p>{rows.filter((r) => r.action === "preserve").length} occurrence(s) will be preserved.</p></div>; }

function DutyCard({ duty, management, onEdit }: { duty: OperationDuty; management: ReturnType<typeof useDutyManagement>; onEdit: () => void }) {
  const current = assignmentForDate(management.assignments, duty.id, todayLocal());
  const assignments = management.assignments.filter((a) => a.duty_id === duty.id);
  const coverages = management.coverages.filter((c) => c.duty_id === duty.id);
  const versions = management.recurrenceVersions.filter((v) => v.duty_id === duty.id);
  const owner = current?.primary?.full_name ?? current?.contractor?.name ?? "Unassigned";
  const requirement = (state: RequirementState | undefined, values?: string[]) => state === "required" ? (values?.length ? values.join(", ") : "Required - details missing") : state === "not_required" ? "Explicitly not required" : "Not recorded";
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{duty.title}</CardTitle>
            <CardDescription>{duty.department ? DUTY_DEPARTMENT_LABELS[duty.department] : "Department not recorded"} - {dutyScheduleLabel(duty)}</CardDescription>
          </div>
          {management.canManage && <Button variant="ghost" size="icon" aria-label={`Edit ${duty.title}`} onClick={onEdit}><Pencil className="h-4 w-4" /></Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p><span className="font-medium">Status:</span> {duty.is_active ? "Active" : `Inactive - ${duty.inactive_reason || "reason not recorded"}`}</p>
        <p><span className="font-medium">Primary:</span> {owner}</p>
        <p><span className="font-medium">Backup:</span> {current?.backup?.full_name ?? "Not recorded"}</p>
        <p><span className="font-medium">Duration:</span> {duty.estimated_minutes == null ? "Not recorded" : `${duty.estimated_minutes} minutes`}</p>
        <p><span className="font-medium">Instructions:</span> {duty.instructions || "Not recorded"}</p>
        <p><span className="font-medium">Equipment:</span> {requirement(duty.equipment_requirement_state, duty.equipment_needed)}</p>
        <p><span className="font-medium">Evidence:</span> {requirement(duty.evidence_requirement_state, duty.evidence_requirements?.map((item) => item.label))}</p>
        <p><span className="font-medium">Verification:</span> {requirement(duty.verification_requirement_state)}</p>
        <details>
          <summary className="cursor-pointer font-medium">Assignment history ({assignments.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{assignments.map((item) => <li key={item.id}>{item.effective_from}-{item.effective_through ?? "present"}: {item.primary?.full_name ?? item.contractor?.name ?? "Unassigned"} - {item.change_reason}</li>)}</ul>
        </details>
        <details>
          <summary className="cursor-pointer font-medium">Temporary coverage ({coverages.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{coverages.map((item) => <li key={item.id}>{item.starts_on}-{item.ends_on}: {item.primary?.full_name ?? item.contractor?.name ?? "Unassigned"} - {item.reason}</li>)}</ul>
        </details>
        <details>
          <summary className="cursor-pointer font-medium">Recurrence history ({versions.length})</summary>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{versions.map((item) => <li key={item.id}>{item.effective_from}-{item.effective_through ?? "present"}: {item.cadence} - {item.change_reason}</li>)}</ul>
        </details>
      </CardContent>
    </Card>
  );
}
