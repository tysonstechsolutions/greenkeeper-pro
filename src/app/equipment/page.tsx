"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PackageCheck,
  Search,
  Wrench,
  XCircle,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  equipmentStatusColors,
  equipmentStatusLabels,
  equipmentTypeLabels,
  useEquipment,
} from "@/lib/hooks/useEquipment";
import { directSelectList } from "@/lib/supabase/rest";
import { formatAppDate } from "@/lib/utils/date-format";
import {
  formatEquipmentIdentity,
  needsAttention,
  sortEquipmentForAttention,
  summarizeEquipmentReadiness,
} from "@/lib/equipment/readiness";
import type {
  Equipment,
  EquipmentServiceRecord,
  EquipmentStatus,
  EquipmentType,
} from "@/types/database";

type ServiceHistoryRecord = Pick<
  EquipmentServiceRecord,
  "id" | "equipment_id" | "service_date" | "cost"
>;

interface ServiceHistory {
  count: number;
  latestDate: string | null;
  hasCost: boolean;
}

const STATUS_OPTIONS: EquipmentStatus[] = [
  "operational",
  "needs_service",
  "in_repair",
  "out_of_service",
];

function StatusChip({ status }: { status: EquipmentStatus }) {
  const color = equipmentStatusColors[status];
  return (
    <Badge
      variant="outline"
      className="text-xs"
      style={{
        backgroundColor: `${color}15`,
        borderColor: color,
        color,
      }}
    >
      {equipmentStatusLabels[status]}
    </Badge>
  );
}

function ReadinessTile({
  label,
  value,
  detail,
  color,
  icon: Icon,
}: {
  label: string;
  value: number;
  detail: string;
  color: string;
  icon: typeof Wrench;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" style={{ color }} aria-hidden="true" />
          <span className="text-sm font-medium">{label}</span>
        </div>
        <p className="text-3xl font-bold" style={{ color }}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function serviceHistoryText(history: ServiceHistory | undefined): string {
  if (!history) return "No service history yet.";
  const suffix = history.count === 1 ? "service" : "services";
  const latest = formatAppDate(history.latestDate, { month: "short", year: "numeric" });
  return `${history.count} ${suffix} · last ${latest}`;
}

export default function EquipmentReadinessPage() {
  const { equipment, loading, error } = useEquipment();
  const [serviceRecords, setServiceRecords] = useState<ServiceHistoryRecord[]>([]);
  const [serviceLoading, setServiceLoading] = useState(true);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<EquipmentType | "all">("all");
  const [attentionOnly, setAttentionOnly] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadServiceHistory() {
      setServiceLoading(true);
      setServiceError(null);
      try {
        const records = await directSelectList<ServiceHistoryRecord>(
          "equipment_service_records",
          {
            columns: "id,equipment_id,service_date,cost",
            orderBy: [{ column: "service_date", ascending: false }],
            label: "equipmentReadiness.fetchServiceHistory",
          },
        );
        if (active) setServiceRecords(records);
      } catch (err) {
        if (active) {
          setServiceError(err instanceof Error ? err.message : "Service history is unavailable.");
        }
      } finally {
        if (active) setServiceLoading(false);
      }
    }

    loadServiceHistory();
    return () => {
      active = false;
    };
  }, []);

  const summary = useMemo(() => summarizeEquipmentReadiness(equipment), [equipment]);

  const serviceHistory = useMemo(() => {
    const byEquipment = new Map<string, ServiceHistory>();
    for (const record of serviceRecords) {
      const existing = byEquipment.get(record.equipment_id) ?? {
        count: 0,
        latestDate: null,
        hasCost: false,
      };
      existing.count += 1;
      existing.hasCost ||= record.cost !== null;
      if (!existing.latestDate || record.service_date > existing.latestDate) {
        existing.latestDate = record.service_date;
      }
      byEquipment.set(record.equipment_id, existing);
    }
    return byEquipment;
  }, [serviceRecords]);

  // Type remains available for discovery, although most current records use "other".
  const typeOptions = useMemo(
    () => Array.from(new Set(equipment.map((unit) => unit.equipment_type))).sort(),
    [equipment],
  );

  const attentionList = useMemo(
    () => sortEquipmentForAttention(equipment),
    [equipment],
  );

  const visibleEquipment = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return equipment.filter((unit) => {
      if (statusFilter !== "all" && unit.status !== statusFilter) return false;
      if (typeFilter !== "all" && unit.equipment_type !== typeFilter) return false;
      if (attentionOnly && !needsAttention(unit)) return false;
      if (!normalizedSearch) return true;
      return [unit.name, unit.make, unit.model]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [attentionOnly, equipment, search, statusFilter, typeFilter]);

  const attentionPreview = attentionList.slice(0, 8);

  return (
    <div className="p-4 pb-24 md:p-6">
      <PageHeader
        title="Equipment Readiness"
        description="Read-only fleet status from tracked equipment and service records."
        icon={Wrench}
      >
        <Link
          href="/equipment/completeness"
          className="text-sm font-medium text-primary hover:underline"
        >
          Data completeness & collection queue
        </Link>
      </PageHeader>

      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Unable to load equipment: {error}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Loading equipment…
          </CardContent>
        </Card>
      ) : (
        <>
          <section aria-labelledby="fleet-summary-heading" className="mb-6">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 id="fleet-summary-heading" className="text-lg font-semibold">Fleet summary</h2>
                <p className="text-sm text-muted-foreground">
                  Status is reported from existing equipment records only.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {summary.operational + summary.down} currently operational or down
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <ReadinessTile
                label="Total owned"
                value={summary.totalOwned}
                detail={summary.totalOwned === 0 ? "No equipment on file" : "Non-retired units"}
                color={equipmentStatusColors.operational}
                icon={Wrench}
              />
              <ReadinessTile
                label="Operational"
                value={summary.operational}
                detail="Marked operational"
                color={equipmentStatusColors.operational}
                icon={CheckCircle2}
              />
              <ReadinessTile
                label="Down"
                value={summary.down}
                detail="In repair or out of service"
                color={equipmentStatusColors.out_of_service}
                icon={XCircle}
              />
              <ReadinessTile
                label="Needs service"
                value={summary.needsService}
                detail={summary.needsService === 0 ? "No units marked for service" : "Marked needs service"}
                color={equipmentStatusColors.needs_service}
                icon={ClipboardList}
              />
              <ReadinessTile
                label="Waiting on parts"
                value={summary.waitingOnParts}
                detail={summary.waitingOnParts === 0 ? "No parts on order" : "Parts order tracked"}
                color={equipmentStatusColors.in_repair}
                icon={PackageCheck}
              />
            </div>
          </section>

          <section aria-labelledby="attention-heading" className="mb-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle id="attention-heading" className="text-base">
                  Needs attention today{attentionList.length > 0 ? ` (${attentionList.length})` : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {summary.totalOwned === 0 ? (
                  <p className="text-sm text-muted-foreground">No equipment on file.</p>
                ) : attentionPreview.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Nothing needs attention — all tracked equipment is operational.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {attentionPreview.map((unit) => (
                      <Link
                        key={unit.id}
                        href={`/equipment/view?id=${encodeURIComponent(unit.id)}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{unit.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatEquipmentIdentity(unit)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                          <StatusChip status={unit.status} />
                          {unit.needs_parts_ordered && <Badge variant="secondary">Waiting on parts</Badge>}
                        </div>
                      </Link>
                    ))}
                    {attentionList.length > attentionPreview.length && (
                      <p className="pt-1 text-xs text-muted-foreground">
                        {attentionList.length - attentionPreview.length} more units appear in the fleet list below.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section aria-labelledby="fleet-list-heading">
            <Card>
              <CardHeader className="gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle id="fleet-list-heading" className="text-base">
                      Fleet units ({visibleEquipment.length} of {summary.totalOwned})
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Open a unit to use the existing detail and service-record workflows.
                    </p>
                  </div>
                  <label htmlFor="needs-attention-only" className="flex items-center gap-2 text-sm font-medium">
                    Needs attention only
                    <Switch
                      id="needs-attention-only"
                      checked={attentionOnly}
                      onCheckedChange={setAttentionOnly}
                    />
                  </label>
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_180px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search name, make, or model"
                      className="pl-9"
                      aria-label="Search equipment"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as EquipmentStatus | "all")}>
                    <SelectTrigger aria-label="Filter by status">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>{equipmentStatusLabels[status]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as EquipmentType | "all")}>
                    <SelectTrigger aria-label="Filter by type">
                      <SelectValue placeholder="Type (limited data)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {typeOptions.map((type) => (
                        <SelectItem key={type} value={type}>{equipmentTypeLabels[type]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {visibleEquipment.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {summary.totalOwned === 0 ? "No equipment on file." : "No equipment matches these filters."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {visibleEquipment.map((unit: Equipment) => (
                      <Link
                        key={unit.id}
                        href={`/equipment/view?id=${encodeURIComponent(unit.id)}`}
                        className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-medium">{unit.name}</h3>
                              <StatusChip status={unit.status} />
                              {unit.needs_parts_ordered && <Badge variant="secondary">Waiting on parts</Badge>}
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {unit.equipment_type !== "other" && `${equipmentTypeLabels[unit.equipment_type]} · `}
                              {formatEquipmentIdentity(unit)}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {serviceLoading
                              ? "Loading service history…"
                              : serviceError
                                ? "Service history unavailable."
                                : serviceHistoryText(serviceHistory.get(unit.id))}
                          </p>
                        </div>
                      </Link>
                    ))}
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
