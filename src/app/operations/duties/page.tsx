"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Pencil, RefreshCw, Save, UserRoundCog } from "lucide-react";
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
import { useDutyManagement } from "@/lib/operations/use-duty-management";
import type {
  DutyCadence,
  DutyDepartment,
  DutyRoleGroup,
  OperationDuty,
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
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

interface DutyFormState {
  id: string | null;
  title: string;
  department: DutyDepartment;
  roleGroup: DutyRoleGroup;
  cadence: DutyCadence;
  weekdays: string[];
  dayOfMonth: string;
  annualMonth: string;
  season: "in_season" | "year_round";
  estimatedMinutes: string;
  instructions: string;
  equipment: string;
  requiredDocument: string;
  standardReference: string;
  evidence: string;
  verificationRequired: boolean;
  priority: "critical" | "high" | "normal" | "low";
  primaryProfileId: string;
  backupProfileId: string;
  contractorVendorId: string;
  activeFrom: string;
  assignmentDate: string;
  assignmentReason: string;
  sortOrder: number;
}

function emptyForm(sortOrder = 10): DutyFormState {
  return {
    id: null,
    title: "",
    department: "maintenance",
    roleGroup: "maintenance_staff",
    cadence: "weekly",
    weekdays: ["mon"],
    dayOfMonth: "1",
    annualMonth: String(new Date().getMonth() + 1),
    season: "year_round",
    estimatedMinutes: "",
    instructions: "",
    equipment: "",
    requiredDocument: "",
    standardReference: "",
    evidence: "",
    verificationRequired: false,
    priority: "normal",
    primaryProfileId: "",
    backupProfileId: "",
    contractorVendorId: "",
    activeFrom: todayLocal(),
    assignmentDate: todayLocal(),
    assignmentReason: "",
    sortOrder,
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

  const reassignmentPreview = useMemo(
    () => fromProfileId
      ? previewActiveDutyReassignment(
          management.duties,
          management.assignments,
          fromProfileId,
          reassignDate,
        )
      : [],
    [management.duties, management.assignments, fromProfileId, reassignDate],
  );

  const groupedDuties = useMemo(() => {
    const grouped = new Map<DutyRoleGroup, OperationDuty[]>();
    for (const duty of management.duties.filter((item) => item.is_active)) {
      const group = duty.role_group ?? "unassigned";
      grouped.set(group, [...(grouped.get(group) ?? []), duty]);
    }
    return grouped;
  }, [management.duties]);

  const set = <K extends keyof DutyFormState>(key: K, value: DutyFormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const editDuty = (duty: OperationDuty) => {
    const current = assignmentForDate(management.assignments, duty.id, todayLocal());
    const rule = duty.recurrence_rule;
    setForm({
      id: duty.id,
      title: duty.title,
      department: duty.department ?? "maintenance",
      roleGroup: duty.role_group ?? "unassigned",
      cadence: duty.cadence ?? rule?.cadence ?? "weekly",
      weekdays: rule?.weekdays ?? duty.days,
      dayOfMonth: String(rule?.day_of_month ?? 1),
      annualMonth: String(rule?.months?.[0] ?? new Date().getMonth() + 1),
      season: duty.season,
      estimatedMinutes: duty.estimated_minutes == null ? "" : String(duty.estimated_minutes),
      instructions: duty.instructions ?? "",
      equipment: (duty.equipment_needed ?? []).join(", "),
      requiredDocument: duty.required_document ?? "",
      standardReference: duty.standard_reference ?? "",
      evidence: (duty.evidence_requirements ?? []).join(", "),
      verificationRequired: duty.manager_verification_required ?? false,
      priority: duty.priority ?? "normal",
      primaryProfileId: current?.primary_profile_id ?? "",
      backupProfileId: current?.backup_profile_id ?? "",
      contractorVendorId: current?.contractor_vendor_id ?? "",
      activeFrom: duty.active_from ?? todayLocal(),
      assignmentDate: todayLocal(),
      assignmentReason: "",
      sortOrder: duty.sort_order,
    });
    setNotice(null);
    setLocalError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    setLocalError(null);
    setNotice(null);
    if (!form.title.trim()) return setLocalError("A duty title is required.");
    if (!form.activeFrom) return setLocalError("A duty start date is required.");
    if (!form.assignmentDate) return setLocalError("An ownership effective date is required.");
    if (!form.assignmentReason.trim()) return setLocalError("Record why this ownership is being set or changed.");
    if ((form.cadence === "daily" || form.cadence === "weekly") && form.weekdays.length === 0) {
      return setLocalError("Choose at least one weekday.");
    }
    const dayOfMonth = Number(form.dayOfMonth);
    if (!["daily", "weekly"].includes(form.cadence) && !(dayOfMonth === -1 || (dayOfMonth >= 1 && dayOfMonth <= 28))) {
      return setLocalError("Day of month must be 1–28 or -1 for the last day.");
    }

    const minutes = form.estimatedMinutes.trim() ? Number(form.estimatedMinutes) : null;
    if (minutes != null && (!Number.isFinite(minutes) || minutes <= 0)) {
      return setLocalError("Estimated minutes must be a positive number or left blank.");
    }
    const employeeGroup = EMPLOYEE_GROUPS.has(form.roleGroup);
    const rule = {
      cadence: form.cadence,
      interval: 1,
      ...((form.cadence === "daily" || form.cadence === "weekly")
        ? { weekdays: form.weekdays }
        : { day_of_month: dayOfMonth }),
      ...(form.cadence === "annual" ? { months: [Number(form.annualMonth)] } : {}),
    };
    const existingDuty = form.id
      ? management.duties.find((duty) => duty.id === form.id) ?? null
      : null;
    try {
      await management.saveDuty({
        id: form.id ?? undefined,
        duty: {
          title: form.title.trim(),
          area: areaForDepartment(form.department),
          department: form.department,
          role_group: form.roleGroup,
          days: form.weekdays,
          season: form.season,
          cadence: form.cadence,
          recurrence_rule: rule,
          estimated_minutes: minutes,
          instructions: form.instructions.trim() || null,
          equipment_needed: csv(form.equipment),
          required_document: form.requiredDocument.trim() || null,
          standard_reference: form.standardReference.trim() || null,
          evidence_requirements: csv(form.evidence),
          manager_verification_required: form.verificationRequired,
          task_category: form.department === "maintenance" ? "grounds" : form.department === "pro_shop" ? "pro_shop" : "admin",
          priority: form.priority,
          active_from: form.activeFrom,
          active_through: null,
          legacy_source: existingDuty?.legacy_source ?? null,
          legacy_source_id: existingDuty?.legacy_source_id ?? null,
          note: null,
          is_active: true,
          sort_order: form.sortOrder || nextSort,
        },
        primaryProfileId: employeeGroup ? form.primaryProfileId || null : null,
        backupProfileId: employeeGroup ? form.backupProfileId || null : null,
        contractorVendorId: form.roleGroup === "contractor" ? form.contractorVendorId || null : null,
        assignmentEffectiveDate: form.assignmentDate,
        assignmentReason: form.assignmentReason,
      });
      setNotice(form.id ? "Duty updated." : "Duty created.");
      setForm(emptyForm(nextSort + 10));
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "Could not save duty.");
    }
  };

  const reassign = async () => {
    setLocalError(null);
    setNotice(null);
    if (!fromProfileId) return setLocalError("Choose the employee whose duties are changing.");
    if (!reassignReason.trim()) return setLocalError("A reassignment reason is required.");
    if (reassignmentPreview.length === 0) return setLocalError("No active duties match that employee and effective date.");
    try {
      const result = await management.reassignAll({
        fromProfileId,
        replacementProfileId: replacementProfileId || null,
        effectiveDate: reassignDate,
        reason: reassignReason,
        dutyIds: reassignmentPreview.map((item) => item.duty.id),
      });
      setNotice(`${result.length} active duty assignment${result.length === 1 ? "" : "s"} updated.`);
      setFromProfileId("");
      setReplacementProfileId("");
      setReassignReason("");
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : "Could not reassign duties.");
    }
  };

  if (management.loading) {
    return <div className="gk-page mx-auto flex justify-center py-20" role="status" aria-live="polite"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Loading duties</span></div>;
  }

  return (
    <div className="gk-page mx-auto space-y-6">
      <div>
        <Link href="/today" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Today</Link>
        <h1 className="mt-3">Duty ownership</h1>
        <p className="mt-1 text-sm text-muted-foreground">Define recurring work, its instructions and evidence, and who owns it during each period.</p>
      </div>

      {(localError || management.error) && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{localError || management.error}</div>}
      {notice && <div role="status" aria-live="polite" className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{notice}</div>}

      {!management.canManage && (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">You can review duty ownership and history. Only a GM or operations manager can change it.</CardContent></Card>
      )}

      {management.canManage && (
        <>
          <Card>
            <CardHeader><CardTitle>{form.id ? "Edit duty" : "Add recurring duty"}</CardTitle><CardDescription>Missing duration, documents, standards, or evidence remain explicitly unrecorded.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Duty title"><Input value={form.title} onChange={(event) => set("title", event.target.value)} /></Field>
              <Field label="Department"><select className="gk-input" value={form.department} onChange={(event) => set("department", event.target.value as DutyDepartment)}>{Object.entries(DUTY_DEPARTMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Role group"><select className="gk-input" value={form.roleGroup} onChange={(event) => set("roleGroup", event.target.value as DutyRoleGroup)}>{DUTY_ROLE_GROUP_ORDER.map((value) => <option key={value} value={value}>{DUTY_ROLE_GROUP_LABELS[value]}</option>)}</select></Field>
              <Field label="Frequency"><select className="gk-input" value={form.cadence} onChange={(event) => set("cadence", event.target.value as DutyCadence)}>{["daily","weekly","monthly","quarterly","annual"].map((value) => <option key={value} value={value}>{value.slice(0, 1).toUpperCase() + value.slice(1)}</option>)}</select></Field>

              {(form.cadence === "daily" || form.cadence === "weekly") ? (
                <div className="md:col-span-2"><Label>Scheduled weekdays</Label><div className="mt-2 flex flex-wrap gap-2">{WEEKDAYS.map(([value, label]) => <label key={value} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={form.weekdays.includes(value)} onChange={(event) => set("weekdays", event.target.checked ? [...form.weekdays, value] : form.weekdays.filter((day) => day !== value))} />{label}</label>)}</div></div>
              ) : (
                <Field label="Day of month (1–28, or -1 for last day)"><Input type="number" min={-1} max={28} value={form.dayOfMonth} onChange={(event) => set("dayOfMonth", event.target.value)} /></Field>
              )}
              {form.cadence === "annual" && <Field label="Annual month"><select className="gk-input" value={form.annualMonth} onChange={(event) => set("annualMonth", event.target.value)}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{new Date(2026, index, 1).toLocaleDateString("en-US", { month: "long" })}</option>)}</select></Field>}

              <Field label="Season"><select className="gk-input" value={form.season} onChange={(event) => set("season", event.target.value as DutyFormState["season"])}><option value="year_round">Year round</option><option value="in_season">Operating season</option></select></Field>
              <Field label="Duty starts"><Input type="date" value={form.activeFrom} onChange={(event) => set("activeFrom", event.target.value)} /></Field>
              <Field label="Estimated minutes"><Input type="number" min={1} value={form.estimatedMinutes} placeholder="Not recorded" onChange={(event) => set("estimatedMinutes", event.target.value)} /></Field>
              <div className="md:col-span-2"><Field label="Performance instructions"><Textarea value={form.instructions} placeholder="Not recorded" onChange={(event) => set("instructions", event.target.value)} /></Field></div>
              <Field label="Required equipment (comma separated)"><Input value={form.equipment} placeholder="Not recorded" onChange={(event) => set("equipment", event.target.value)} /></Field>
              <Field label="Required document or form"><Input value={form.requiredDocument} placeholder="Not recorded" onChange={(event) => set("requiredDocument", event.target.value)} /></Field>
              <Field label="Standard or policy reference"><Input value={form.standardReference} placeholder="Not recorded" onChange={(event) => set("standardReference", event.target.value)} /></Field>
              <Field label="Completion evidence (comma separated)"><Input value={form.evidence} placeholder="Not recorded" onChange={(event) => set("evidence", event.target.value)} /></Field>
              <Field label="Priority"><select className="gk-input" value={form.priority} onChange={(event) => set("priority", event.target.value as DutyFormState["priority"])}>{["critical","high","normal","low"].map((value) => <option key={value} value={value}>{value.slice(0, 1).toUpperCase() + value.slice(1)}</option>)}</select></Field>
              <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" checked={form.verificationRequired} onChange={(event) => set("verificationRequired", event.target.checked)} />Manager verification required</label>

              {EMPLOYEE_GROUPS.has(form.roleGroup) && <><Field label="Primary employee"><select className="gk-input" value={form.primaryProfileId} onChange={(event) => set("primaryProfileId", event.target.value)}><option value="">Unassigned</option>{management.people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></Field><Field label="Backup employee"><select className="gk-input" value={form.backupProfileId} onChange={(event) => set("backupProfileId", event.target.value)}><option value="">Not recorded</option>{management.people.filter((person) => person.id !== form.primaryProfileId).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></Field></>}
              {form.roleGroup === "contractor" && <Field label="Contractor"><select className="gk-input" value={form.contractorVendorId} onChange={(event) => set("contractorVendorId", event.target.value)}><option value="">Unassigned</option>{management.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></Field>}
              <Field label="Ownership effective date"><Input type="date" value={form.assignmentDate} onChange={(event) => set("assignmentDate", event.target.value)} /></Field>
              <Field label="Assignment or change reason"><Input value={form.assignmentReason} placeholder="Required for history" onChange={(event) => set("assignmentReason", event.target.value)} /></Field>
              <div className="md:col-span-2 flex gap-2"><Button onClick={() => void save()} disabled={management.saving}>{management.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{form.id ? "Save changes" : "Create duty"}</Button>{form.id && <Button variant="outline" onClick={() => setForm(emptyForm(nextSort))}>Cancel</Button>}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><UserRoundCog className="h-5 w-5" />Reassign all active duties</CardTitle><CardDescription>Preview primary and backup ownership before changing future pending occurrences. Completed history is preserved.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2"><Field label="Employee leaving or changing roles"><select className="gk-input" value={fromProfileId} onChange={(event) => setFromProfileId(event.target.value)}><option value="">Choose employee</option>{management.people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></Field><Field label="Replacement"><select className="gk-input" value={replacementProfileId} onChange={(event) => setReplacementProfileId(event.target.value)}><option value="">Leave affected ownership unassigned</option>{management.people.filter((person) => person.id !== fromProfileId).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></Field><Field label="Effective date"><Input type="date" value={reassignDate} onChange={(event) => setReassignDate(event.target.value)} /></Field><Field label="Reason"><Input value={reassignReason} placeholder="Transfer, leave, departure…" onChange={(event) => setReassignReason(event.target.value)} /></Field></div>
              {fromProfileId && <div className="rounded-xl border bg-muted/30 p-3"><p className="text-sm font-medium">{reassignmentPreview.length} affected assignment{reassignmentPreview.length === 1 ? "" : "s"}</p>{reassignmentPreview.length > 0 ? <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{reassignmentPreview.map((item) => <li key={item.assignment.id}>{item.duty.title} · {item.role}</li>)}</ul> : <p className="mt-1 text-sm text-muted-foreground">No active ownership matches this employee and date.</p>}</div>}
              <Button onClick={() => void reassign()} disabled={management.saving || reassignmentPreview.length === 0}>{management.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Confirm reassignment</Button>
            </CardContent>
          </Card>
        </>
      )}

      <section>
        <h2>Active recurring duties</h2>
        <div className="mt-3 space-y-5">
          {DUTY_ROLE_GROUP_ORDER.map((group) => {
            const duties = groupedDuties.get(group);
            if (!duties?.length) return null;
            return <div key={group}><h3 className="text-sm font-semibold">{DUTY_ROLE_GROUP_LABELS[group]}</h3><div className="mt-2 grid gap-3 lg:grid-cols-2">{duties.map((duty) => <DutyCard key={duty.id} duty={duty} assignments={management.assignments} canManage={management.canManage} onEdit={() => editDuty(duty)} />)}</div></div>;
          })}
          {management.duties.filter((duty) => duty.is_active).length === 0 && <Card><CardContent className="pt-6 text-sm text-muted-foreground">No recurring duties are recorded.</CardContent></Card>}
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5"><span className="block text-sm font-medium">{label}</span>{children}</label>;
}

function DutyCard({ duty, assignments, canManage, onEdit }: { duty: OperationDuty; assignments: ReturnType<typeof useDutyManagement>["assignments"]; canManage: boolean; onEdit: () => void }) {
  const current = assignmentForDate(assignments, duty.id, todayLocal());
  const history = assignments.filter((assignment) => assignment.duty_id === duty.id);
  const owner = current?.primary?.full_name ?? current?.contractor?.name ?? "Unassigned";
  return <Card><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base">{duty.title}</CardTitle><CardDescription>{duty.department ? DUTY_DEPARTMENT_LABELS[duty.department] : "Department not recorded"} · {dutyScheduleLabel(duty)}</CardDescription></div>{canManage && <Button variant="ghost" size="icon" aria-label={`Edit ${duty.title}`} onClick={onEdit}><Pencil className="h-4 w-4" /></Button>}</div></CardHeader><CardContent className="space-y-2 text-sm"><p><span className="font-medium">Primary:</span> {owner}</p><p><span className="font-medium">Backup:</span> {current?.backup?.full_name ?? "Not recorded"}</p><p><span className="font-medium">Duration:</span> {duty.estimated_minutes == null ? "Not recorded" : `${duty.estimated_minutes} minutes`}</p><p><span className="font-medium">Instructions:</span> {duty.instructions || "Not recorded"}</p><p><span className="font-medium">Document/form:</span> {duty.required_document || "Not recorded"}</p><p><span className="font-medium">Standard/policy:</span> {duty.standard_reference || "Not recorded"}</p><p><span className="font-medium">Evidence:</span> {duty.evidence_requirements?.length ? duty.evidence_requirements.join(", ") : "Not recorded"}</p><details><summary className="cursor-pointer font-medium">Assignment history ({history.length})</summary><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{history.map((item) => <li key={item.id}>{item.effective_from}–{item.effective_through ?? "present"}: {item.primary?.full_name ?? item.contractor?.name ?? "Unassigned"} · {item.change_reason}</li>)}</ul></details></CardContent></Card>;
}
