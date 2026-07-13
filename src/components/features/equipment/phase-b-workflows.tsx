"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ClipboardCheck, Loader2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  emptyTriageChecklist,
  summarizeTriageChecklist,
  TRIAGE_CHECK_ITEMS,
  type TriageChecklistEntry,
  type TriageCheckValue,
} from "@/lib/equipment/inspection-checklist";
import { evaluatePmSafe, pmIsComputable } from "@/lib/equipment/pm-status";
import { getReadinessBuckets } from "@/lib/equipment/readiness";
import {
  downtimeDays,
  SUGGESTED_INITIAL_TRIAGE,
  triageLabel,
  triageMeta,
  TRIAGE_STATES,
} from "@/lib/equipment/triage";
import { directInsertRow, directPatchRow } from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";
import type {
  Equipment,
  EquipmentLog,
  EquipmentPart,
  EquipmentServiceRecord,
  EquipmentTriageStatus,
  InspectionStatus,
} from "@/types/database";

type TriageInspectionRecord = {
  id: string;
  created_at: string;
};

type InspectionOverride = "auto" | "fail";

export interface EquipmentPhaseBWorkflowsProps {
  equipment: Equipment;
  parts: readonly EquipmentPart[];
  serviceRecords: readonly EquipmentServiceRecord[];
  logs: readonly EquipmentLog[];
  canEdit: boolean;
  userId: string | null | undefined;
  onEquipmentPatched: (patch: Partial<Equipment>) => void;
  onLogCreated: (log: EquipmentLog) => void;
  /** Reuses the unit's established upload workflow; a selected inspection or repair photo also remains in the gallery. */
  onUploadPhoto: (file: File) => Promise<string | null>;
}

const TRIAGE_VALUE_OPTIONS: Array<{ value: TriageCheckValue; label: string }> = [
  { value: "ok", label: "OK" },
  { value: "issue", label: "Issue" },
  { value: "unknown", label: "Unknown" },
  { value: "na", label: "N/A" },
];

/**
 * Phase B repair, triage, and observation UI. It deliberately uses the
 * foundation helpers rather than deriving any repair state, PM interval, or
 * condition from the operational status or photographs.
 */
export function EquipmentPhaseBWorkflows({
  equipment,
  parts,
  serviceRecords,
  logs,
  canEdit,
  userId,
  onEquipmentPatched,
  onLogCreated,
  onUploadPhoto,
}: EquipmentPhaseBWorkflowsProps) {
  const today = todayLocal();
  const [selectedTriage, setSelectedTriage] = useState<EquipmentTriageStatus | "not_triaged">(
    equipment.triage_status ?? "not_triaged",
  );
  const [triageSaving, setTriageSaving] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairSaving, setRepairSaving] = useState(false);
  const [repairDescription, setRepairDescription] = useState("");
  const [repairVendor, setRepairVendor] = useState("");
  const [repairCost, setRepairCost] = useState("");
  const [repairDowntimeHours, setRepairDowntimeHours] = useState("");
  const [repairPhotos, setRepairPhotos] = useState<string[]>([]);

  useEffect(() => {
    setSelectedTriage(equipment.triage_status ?? "not_triaged");
  }, [equipment.triage_status]);

  const pm = evaluatePmSafe(equipment);
  const isDown = getReadinessBuckets(equipment).includes("down");
  const canSetTriage = canEdit && isDown;
  const triage = triageMeta(equipment.triage_status);
  const downDays = downtimeDays(equipment.down_since, null, today);
  const repairLogs = logs.filter((log) => log.log_type === "repair" || log.log_type === "incident");
  const actualCostEntries = [
    ...repairLogs.map((log) => log.cost),
    ...serviceRecords.map((record) => record.cost),
  ].filter((cost): cost is number => typeof cost === "number" && Number.isFinite(cost));
  const vendors = Array.from(new Set(repairLogs.map((log) => log.vendor).filter((vendor): vendor is string => Boolean(vendor))));
  const recordedParts = parts.length > 0 || equipment.needs_parts_ordered || Boolean(equipment.parts_needed);

  const saveTriage = async () => {
    if (!canSetTriage || selectedTriage === "not_triaged") return;
    setTriageSaving(true);
    setWorkflowError(null);
    const patch: Partial<Equipment> = {
      triage_status: selectedTriage,
    };
    // A date is a human-started down episode, never an inference. Only add it
    // when the user takes the triage action for a currently-down unit.
    if (isDown && !equipment.down_since) {
      patch.down_since = today;
    }
    try {
      await directPatchRow("equipment", "id", equipment.id, patch, "equipment.phaseB.saveTriage");
      onEquipmentPatched(patch);
    } catch (error) {
      setWorkflowError(messageFor(error, "Could not save triage status."));
    } finally {
      setTriageSaving(false);
    }
  };

  const returnToService = async () => {
    if (!canEdit) return;
    setTriageSaving(true);
    setWorkflowError(null);
    try {
      // This is a deliberate separate operational-status action. Saving a
      // triage annotation never changes `equipment.status`.
      await directPatchRow(
        "equipment",
        "id",
        equipment.id,
        { status: "operational", down_since: null },
        "equipment.phaseB.returnToService",
      );
      const log = await directInsertRow<EquipmentLog>(
        "equipment_logs",
        {
          equipment_id: equipment.id,
          log_type: "repair",
          description: "Returned to service",
          cost: null,
          vendor: null,
          downtime_hours: null,
          photos: [],
          parts_used: [],
        },
        "equipment.phaseB.returnToServiceLog",
      );
      onEquipmentPatched({ status: "operational", down_since: null });
      onLogCreated(log);
    } catch (error) {
      setWorkflowError(messageFor(error, "Could not return this unit to service."));
    } finally {
      setTriageSaving(false);
    }
  };

  const saveRepair = async () => {
    if (!canEdit || !repairDescription.trim()) return;
    setRepairSaving(true);
    setWorkflowError(null);
    try {
      const log = await directInsertRow<EquipmentLog>(
        "equipment_logs",
        {
          equipment_id: equipment.id,
          log_type: "repair",
          description: repairDescription.trim(),
          vendor: repairVendor.trim() || null,
          // Blank means no amount was recorded. It must never become $0.00.
          cost: numericOrNull(repairCost),
          downtime_hours: numericOrNull(repairDowntimeHours),
          photos: repairPhotos,
          parts_used: [],
        },
        "equipment.phaseB.createRepairLog",
      );
      onLogCreated(log);
      setRepairDescription("");
      setRepairVendor("");
      setRepairCost("");
      setRepairDowntimeHours("");
      setRepairPhotos([]);
      setRepairOpen(false);
    } catch (error) {
      setWorkflowError(messageFor(error, "Could not save the repair entry."));
    } finally {
      setRepairSaving(false);
    }
  };

  const addRepairPhoto = async (file: File) => {
    setWorkflowError(null);
    try {
      const url = await onUploadPhoto(file);
      if (url) setRepairPhotos((current) => [...current, url]);
    } catch (error) {
      setWorkflowError(messageFor(error, "Could not add the repair photo."));
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" aria-hidden="true" />
            Repair workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {workflowError && (
            <div role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {workflowError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-sm font-medium">Operational status</Label>
              <p className="mt-1 text-sm text-muted-foreground">{equipment.status.replaceAll("_", " ")}</p>
              <p className="mt-1 text-xs text-muted-foreground">This remains the operational source of truth.</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Safe PM status</Label>
              <p className={pmIsComputable(pm.state) && pm.state === "overdue" ? "mt-1 text-sm font-medium text-destructive" : "mt-1 text-sm text-muted-foreground"}>
                {pm.label}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{pm.basis}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <Label htmlFor="triage-status" className="text-sm font-medium">Diagnosis status</Label>
                <p className="mt-1 text-xs text-muted-foreground">Human-set repair workflow classification; it does not change operational status.</p>
              </div>
              {triage && <Badge variant="outline">{triageLabel(equipment.triage_status)}</Badge>}
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Select value={selectedTriage} onValueChange={(value) => setSelectedTriage(value as EquipmentTriageStatus | "not_triaged")} disabled={!canSetTriage}>
                <SelectTrigger id="triage-status" aria-label="Diagnosis status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_triaged">Not triaged</SelectItem>
                  {TRIAGE_STATES.map((state) => <SelectItem key={state.status} value={state.status}>{state.label} — {state.description}</SelectItem>)}
                </SelectContent>
              </Select>
              {canSetTriage && selectedTriage === "not_triaged" && (
                <Button type="button" variant="outline" onClick={() => setSelectedTriage(SUGGESTED_INITIAL_TRIAGE)}>Start triage</Button>
              )}
              {canSetTriage && <Button type="button" onClick={saveTriage} disabled={triageSaving || selectedTriage === "not_triaged"}>{triageSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save triage</Button>}
            </div>
            {selectedTriage !== "not_triaged" && (
              <p className="mt-2 text-xs text-muted-foreground">{triageMeta(selectedTriage)?.description}</p>
            )}
            {downDays !== null && <p className="mt-3 text-sm font-medium">Down {downDays} day{downDays === 1 ? "" : "s"}</p>}
            {equipment.triage_status === "returned_to_service" && equipment.status !== "operational" && (
              <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                <p>This annotation does not change the operational record. Confirm the unit is operational before returning it to service.</p>
                {canEdit && <Button type="button" size="sm" className="mt-2" onClick={returnToService} disabled={triageSaving}>Mark status operational</Button>}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <RecordedValue label="Date first reported down" value={equipment.down_since ?? "Not recorded"} />
            <RecordedValue label="Parts required / ordered" value={recordedParts ? partSummary(parts, equipment) : "Not recorded"} />
            <RecordedValue label="Vendor involved" value={vendors.length ? vendors.join(", ") : "Not recorded"} />
            <RecordedValue
              label="Returned-to-service date"
              value={returnDateFrom(logs) ?? "Not recorded"}
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-medium">Work performed</Label>
              {canEdit && <Button type="button" variant="outline" size="sm" onClick={() => setRepairOpen((open) => !open)}>{repairOpen ? "Cancel" : "Add repair entry"}</Button>}
            </div>
            {repairLogs.length ? (
              <div className="mt-2 space-y-2">
                {repairLogs.map((log) => <div key={log.id} className="rounded-md border border-border p-3 text-sm"><p>{log.description}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(log.created_at).toLocaleDateString()}{log.vendor ? ` · ${log.vendor}` : ""}{log.cost !== null ? ` · $${log.cost.toFixed(2)}` : ""}</p></div>)}
              </div>
            ) : <p className="mt-2 text-sm text-muted-foreground">No repair work recorded.</p>}
          </div>

          <div>
            <Label className="text-sm font-medium">Repair cost</Label>
            <p className="mt-1 text-sm text-muted-foreground">
              {actualCostEntries.length ? `$${actualCostEntries.reduce((total, cost) => total + cost, 0).toFixed(2)} recorded` : "No cost recorded"}
            </p>
          </div>

          {repairOpen && (
            <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
              <div>
                <Label htmlFor="repair-work">Work performed *</Label>
                <Textarea id="repair-work" value={repairDescription} onChange={(event) => setRepairDescription(event.target.value)} placeholder="Record work actually performed" />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div><Label htmlFor="repair-vendor">Vendor involved</Label><Input id="repair-vendor" value={repairVendor} onChange={(event) => setRepairVendor(event.target.value)} placeholder="Not recorded" /></div>
                <div><Label htmlFor="repair-cost">Actual repair cost</Label><Input id="repair-cost" type="number" min="0" step="0.01" value={repairCost} onChange={(event) => setRepairCost(event.target.value)} placeholder="Not recorded" /></div>
                <div><Label htmlFor="repair-downtime">Downtime hours</Label><Input id="repair-downtime" type="number" min="0" step="0.1" value={repairDowntimeHours} onChange={(event) => setRepairDowntimeHours(event.target.value)} placeholder="Not recorded" /></div>
              </div>
              <div>
                <Label htmlFor="repair-photo">Optional repair photo</Label>
                <Input id="repair-photo" type="file" accept="image/*" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void addRepairPhoto(file); }} />
              </div>
              <Button type="button" onClick={saveRepair} disabled={!repairDescription.trim() || repairSaving}>{repairSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save repair entry</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <TriageInspectionCard
        equipment={equipment}
        canEdit={canEdit}
        userId={userId}
        open={inspectionOpen}
        onOpenChange={setInspectionOpen}
        onEquipmentPatched={onEquipmentPatched}
        onUploadPhoto={onUploadPhoto}
        onError={setWorkflowError}
      />
    </>
  );
}

interface TriageInspectionCardProps {
  equipment: Equipment;
  canEdit: boolean;
  userId: string | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEquipmentPatched: (patch: Partial<Equipment>) => void;
  onUploadPhoto: (file: File) => Promise<string | null>;
  onError: (message: string | null) => void;
}

export function TriageInspectionCard({
  equipment,
  canEdit,
  userId,
  open,
  onOpenChange,
  onEquipmentPatched,
  onUploadPhoto,
  onError,
}: TriageInspectionCardProps) {
  const [entries, setEntries] = useState<TriageChecklistEntry[]>(() => emptyTriageChecklist());
  const [notes, setNotes] = useState("");
  const [hourMeter, setHourMeter] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [override, setOverride] = useState<InspectionOverride>("auto");
  const [saving, setSaving] = useState(false);
  const summary = useMemo(() => summarizeTriageChecklist(entries), [entries]);

  const reset = () => {
    setEntries(emptyTriageChecklist());
    setNotes("");
    setHourMeter("");
    setPhotos([]);
    setOverride("auto");
  };

  const save = async () => {
    if (!canEdit || !userId) return;
    setSaving(true);
    onError(null);
    const overallStatus: InspectionStatus = override === "fail" ? "fail" : summary.overall;
    try {
      await directInsertRow<TriageInspectionRecord>(
        "equipment_inspections",
        {
          equipment_id: equipment.id,
          inspection_type: "triage",
          inspected_by: userId,
          checklist_items: entries,
          overall_status: overallStatus,
          notes: notes.trim() || null,
          photos,
          engine_hours: numericOrNull(hourMeter),
          fuel_level: null,
          oil_level: null,
        },
        "equipment.phaseB.createTriageInspection",
      );
      const inspectionDate = todayLocal();
      await directPatchRow(
        "equipment",
        "id",
        equipment.id,
        { last_inspection_date: inspectionDate },
        "equipment.phaseB.updateLastInspectionDate",
      );
      onEquipmentPatched({ last_inspection_date: inspectionDate });
      reset();
      onOpenChange(false);
    } catch (error) {
      onError(messageFor(error, "Could not save triage inspection."));
    } finally {
      setSaving(false);
    }
  };

  const uploadInspectionPhoto = async (file: File) => {
    onError(null);
    try {
      const url = await onUploadPhoto(file);
      if (url) setPhotos((current) => [...current, url]);
    } catch (error) {
      onError(messageFor(error, "Could not add the inspection photo."));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5" aria-hidden="true" /> Triage inspection</span>
          {canEdit && <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(!open)}>{open ? "Cancel" : "Start inspection"}</Button>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!open ? <p className="text-sm text-muted-foreground">Record current observations only. Unknown is a valid result and does not indicate a failure.</p> : (
          <div className="space-y-4">
            {TRIAGE_CHECK_ITEMS.map((item) => {
              const entry = entries.find((candidate) => candidate.id === item.id);
              if (!entry) return null;
              return (
                <div key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-col justify-between gap-2 sm:flex-row">
                    <div><Label htmlFor={`triage-${item.id}`}>{item.label}</Label><p className="text-xs text-muted-foreground">{item.hint}</p></div>
                    <select
                      id={`triage-${item.id}`}
                      aria-label={`${item.label} result`}
                      value={entry.value}
                      onChange={(event) => setEntries((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, value: event.target.value as TriageCheckValue } : candidate))}
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      disabled={!canEdit}
                    >
                      {TRIAGE_VALUE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                  <Input aria-label={`${item.label} note`} className="mt-2" placeholder="Optional observation note" value={entry.note ?? ""} onChange={(event) => setEntries((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, note: event.target.value || undefined } : candidate))} disabled={!canEdit} />
                </div>
              );
            })}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><Label htmlFor="triage-hour-meter">Hour meter reading if visible</Label><Input id="triage-hour-meter" type="number" min="0" step="0.1" value={hourMeter} onChange={(event) => setHourMeter(event.target.value)} placeholder="Not recorded" disabled={!canEdit} /></div>
              <div><Label htmlFor="triage-photo">Optional inspection photo</Label><Input id="triage-photo" type="file" accept="image/*" disabled={!canEdit} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void uploadInspectionPhoto(file); }} /></div>
            </div>
            <div><Label htmlFor="triage-notes">Overall notes</Label><Textarea id="triage-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional observations" disabled={!canEdit} /></div>
            <div><Label htmlFor="triage-overall">Overall result</Label><select id="triage-overall" value={override} onChange={(event) => setOverride(event.target.value as InspectionOverride)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm" disabled={!canEdit}><option value="auto">Use checklist result: {summary.overall.replaceAll("_", " ")}</option><option value="fail">Fail (manual override)</option></select></div>
            <p className="text-xs text-muted-foreground">{summary.checkedCount} of {summary.totalCount} observations recorded. This form does not prescribe maintenance actions.</p>
            <Button type="button" onClick={save} disabled={!canEdit || !userId || saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save triage inspection</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecordedValue({ label, value }: { label: string; value: string }) {
  return <div><Label className="text-sm font-medium">{label}</Label><p className="mt-1 text-sm text-muted-foreground">{value}</p></div>;
}

function partSummary(parts: readonly EquipmentPart[], equipment: Equipment): string {
  const listed = parts.map((part) => `${part.name} (${part.status})`);
  if (equipment.parts_needed) listed.push(equipment.parts_needed);
  if (equipment.needs_parts_ordered && listed.length === 0) listed.push("Parts required; details not recorded");
  return listed.join(", ");
}

function returnDateFrom(logs: readonly EquipmentLog[]): string | null {
  const returnLog = logs.find((log) => log.description === "Returned to service");
  if (!returnLog) return null;
  return new Date(returnLog.created_at).toLocaleDateString();
}

function numericOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
