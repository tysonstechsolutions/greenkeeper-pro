"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, AlertCircle, ClipboardCheck, Loader2, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  equipmentStatusLabels,
  useEquipment,
} from "@/lib/hooks/useEquipment";
import { directSelectList } from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";
import {
  assessUnit,
  collectionQueue,
  COMPLETENESS_FIELDS,
  summarizeCompleteness,
  type CompletenessField,
  type UnitCompleteness,
} from "@/lib/equipment/completeness";
import type { EquipmentStatus } from "@/types/database";

type RelatedRow = { id: string; equipment_id: string };

const STATUS_OPTIONS: EquipmentStatus[] = [
  "operational",
  "needs_service",
  "in_repair",
  "out_of_service",
];

type FieldDisplay = "recorded" | "not_recorded" | "not_applicable" | "unavailable";

function fieldDisplay(
  assessment: UnitCompleteness,
  field: CompletenessField,
  relatedDataUnavailable: boolean,
): FieldDisplay {
  if (relatedDataUnavailable && (field === "service_history" || field === "parts_info")) {
    return "unavailable";
  }
  if (assessment.notApplicable.includes(field)) return "not_applicable";
  return assessment.present[field] ? "recorded" : "not_recorded";
}

function FieldBadge({ state }: { state: FieldDisplay }) {
  const labels: Record<FieldDisplay, string> = {
    recorded: "Recorded",
    not_recorded: "Not recorded",
    not_applicable: "N/A",
    unavailable: "Unable to calculate",
  };
  const classes: Record<FieldDisplay, string> = {
    recorded: "border-success/30 bg-success/10 text-success",
    not_recorded: "border-border bg-muted text-muted-foreground",
    not_applicable: "border-border bg-muted/50 text-muted-foreground",
    unavailable: "border-warning/30 bg-warning/10 text-warning-foreground",
  };
  return <Badge variant="outline" className={`text-[10px] ${classes[state]}`}>{labels[state]}</Badge>;
}

export default function EquipmentCompletenessPage() {
  const { equipment, loading, error } = useEquipment();
  const [serviceRows, setServiceRows] = useState<RelatedRow[] | null>(null);
  const [partRows, setPartRows] = useState<RelatedRow[] | null>(null);
  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | "all">("all");
  const [missingFieldFilter, setMissingFieldFilter] = useState<CompletenessField | "all">("all");

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      directSelectList<RelatedRow>("equipment_service_records", {
        columns: "id,equipment_id",
        limit: 2000,
        label: "equipmentCompleteness.serviceRecords",
      }),
      directSelectList<RelatedRow>("equipment_parts", {
        columns: "id,equipment_id",
        limit: 2000,
        label: "equipmentCompleteness.parts",
      }),
    ]).then(([services, parts]) => {
      if (!active) return;
      const failed = services.status === "rejected" || parts.status === "rejected";
      setServiceRows(services.status === "fulfilled" ? services.value : []);
      setPartRows(parts.status === "fulfilled" ? parts.value : []);
      if (failed) setRelatedError("Service history or parts information could not be verified.");
    });
    return () => {
      active = false;
    };
  }, []);

  const relatedLoading = serviceRows === null || partRows === null;
  const serviceCounts = useMemo(() => countByEquipment(serviceRows ?? []), [serviceRows]);
  const partCounts = useMemo(() => countByEquipment(partRows ?? []), [partRows]);
  const assessments = useMemo(
    () => equipment.map((unit) => assessUnit(unit, {
      serviceRecordCount: serviceCounts.get(unit.id) ?? 0,
      partsCount: partCounts.get(unit.id) ?? 0,
    }, todayLocal())),
    [equipment, partCounts, serviceCounts],
  );
  const assessmentById = useMemo(
    () => new Map(assessments.map((assessment) => [assessment.id, assessment])),
    [assessments],
  );
  const summary = useMemo(() => summarizeCompleteness(assessments), [assessments]);
  const queue = useMemo(() => collectionQueue(equipment, assessments), [assessments, equipment]);

  const filteredUnits = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return equipment.filter((unit) => {
      const assessment = assessmentById.get(unit.id);
      if (!assessment) return false;
      if (statusFilter !== "all" && unit.status !== statusFilter) return false;
      if (missingFieldFilter !== "all" && !assessment.missing.includes(missingFieldFilter)) return false;
      if (!normalizedSearch) return true;
      return [unit.name, unit.make, unit.model]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [assessmentById, equipment, missingFieldFilter, search, statusFilter]);

  return (
    <div className="p-4 pb-24 md:p-6">
      <Link href="/equipment" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Equipment readiness
      </Link>
      <PageHeader
        title="Equipment data completeness"
        description="A recorded-data inventory and collection queue. Missing information is not a zero value."
        icon={ClipboardCheck}
      />

      {(error || relatedError) && (
        <Card className="mb-6 border-warning/40">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-warning-foreground">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {error ? `Equipment data is unavailable: ${error}` : relatedError}
          </CardContent>
        </Card>
      )}

      {(loading || relatedLoading) ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Loading recorded equipment information…
          </CardContent>
        </Card>
      ) : (
        <>
          <section aria-labelledby="completeness-totals" className="mb-6">
            <h2 id="completeness-totals" className="mb-3 text-lg font-semibold">Completeness totals</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {COMPLETENESS_FIELDS.map(({ field, label }) => {
                const unavailable = relatedError && (field === "service_history" || field === "parts_info");
                return (
                  <Card key={field}>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="mt-1 text-2xl font-bold">
                        {unavailable ? "Unable to calculate" : `${summary.missingByField[field]} of ${summary.totalUnits}`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {unavailable ? "Related records unavailable" : `not recorded${field === "repair_diagnosis" || field === "parts_info" ? " where applicable" : ""}`}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="collection-queue-heading" className="mb-6">
            <Card>
              <CardHeader>
                <CardTitle id="collection-queue-heading" className="text-base">Manual & PM-data collection queue</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {queue.length === 0
                    ? "No units currently need meter readings, PM schedules, or identity information."
                    : `${queue.length} units still need meter readings, schedules, or identity information. This is a collection opportunity, not a blocker.`}
                </p>
              </CardHeader>
              <CardContent>
                {queue.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing is waiting in the collection queue.</p>
                ) : (
                  <div className="space-y-2">
                    {queue.slice(0, 12).map((entry) => (
                      <Link
                        key={entry.id}
                        href={`/equipment/view?id=${encodeURIComponent(entry.id)}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted/50"
                      >
                        <span className="min-w-0 truncate text-sm font-medium">{entry.name}</span>
                        <span className="text-right text-xs text-muted-foreground">
                          Needs {entry.needs.map((field) => COMPLETENESS_FIELDS.find((item) => item.field === field)?.label).join(", ")}
                        </span>
                      </Link>
                    ))}
                    {queue.length > 12 && <p className="text-xs text-muted-foreground">{queue.length - 12} more units are in the queue.</p>}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="unit-completeness-heading">
            <Card>
              <CardHeader className="gap-4">
                <div>
                  <CardTitle id="unit-completeness-heading" className="text-base">Unit completeness ({filteredUnits.length} of {summary.totalUnits})</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Recorded, not recorded, and not-applicable values are shown separately.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_220px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, make, or model" className="pl-9" aria-label="Search equipment completeness" />
                  </div>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as EquipmentStatus | "all")}>
                    <SelectTrigger aria-label="Filter completeness by status"><SelectValue placeholder="All statuses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {STATUS_OPTIONS.map((status) => <SelectItem key={status} value={status}>{equipmentStatusLabels[status]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={missingFieldFilter} onValueChange={(value) => setMissingFieldFilter(value as CompletenessField | "all")}>
                    <SelectTrigger aria-label="Filter by missing field"><SelectValue placeholder="All completeness fields" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All completeness fields</SelectItem>
                      {COMPLETENESS_FIELDS.map(({ field, label }) => <SelectItem key={field} value={field}>{label} not recorded</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {filteredUnits.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No equipment matches these filters.</p>
                ) : (
                  <div className="space-y-3">
                    {filteredUnits.map((unit) => {
                      const assessment = assessmentById.get(unit.id);
                      if (!assessment) return null;
                      return (
                        <Link key={unit.id} href={`/equipment/view?id=${encodeURIComponent(unit.id)}`} className="block rounded-lg border border-border p-3 hover:bg-muted/50">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-medium">{unit.name}</h3>
                              <p className="text-xs text-muted-foreground">{equipmentStatusLabels[unit.status]}</p>
                            </div>
                            <span className="text-xs text-muted-foreground">Open unit details</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {COMPLETENESS_FIELDS.map(({ field, label }) => (
                              <span key={field} className="inline-flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">{label}</span>
                                <FieldBadge state={fieldDisplay(assessment, field, Boolean(relatedError))} />
                              </span>
                            ))}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function countByEquipment(rows: readonly RelatedRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.equipment_id, (counts.get(row.equipment_id) ?? 0) + 1);
  return counts;
}
