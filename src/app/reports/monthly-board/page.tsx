"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  FileBarChart,
  Loader2,
  Calendar,
  BarChart3,
  Users,
  Beaker,
  Wrench,
  Cloud,
  ClipboardList,
} from "lucide-react";
import { RoleGuard, ADMIN_ROLES } from "@/components/auth/role-guard";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import {
  fetchMonthlyBoardData,
  type MonthlyBoardData,
} from "@/lib/utils/monthly-board-data";

const MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function MonthlyBoardReportContent() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [preview, setPreview] = useState<MonthlyBoardData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const data = await fetchMonthlyBoardData(supabase, {
        month: parseInt(month, 10),
        year: parseInt(year, 10),
      });
      setPreview(data);
    } catch (err) {
      console.error("Failed to load preview:", err);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  const handleGenerate = () => {
    const url = `/api/reports/monthly-board?month=${month}&year=${year}`;
    window.open(url, "_blank");
  };

  const monthLabel =
    MONTH_OPTIONS.find((m) => m.value === month)?.label ?? month;

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Link
          href="/reports"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Reports
        </Link>
      </div>
      <PageHeader
        title="Monthly Board Report"
        description="Generate a board-ready PDF report for your GM — tasks, observations, equipment, chemical applications, weather, and labor at a glance."
        icon={FileBarChart}
      />

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5" />
            Select Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="month-select">Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger id="month-select" className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="year-input">Year</Label>
              <Input
                id="year-input"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-[100px]"
              />
            </div>
            <Button onClick={handleGenerate} className="gap-2">
              <FileText className="h-4 w-4" />
              Generate PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading preview...</span>
        </div>
      ) : preview ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Preview: {monthLabel} {year}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              icon={<ClipboardList className="h-5 w-5" />}
              title="Tasks"
              value={String(preview.tasks.totalCreated)}
              subtitle={`${preview.tasks.totalCompleted} completed (${preview.tasks.completionRate}%) · ${preview.tasks.overdueCount} overdue`}
            />
            <MetricCard
              icon={<BarChart3 className="h-5 w-5" />}
              title="Observations"
              value={String(preview.observations.totalCount)}
              subtitle={`${preview.observations.resolvedCount} resolved · ${preview.observations.openCount} open`}
            />
            <MetricCard
              icon={<Beaker className="h-5 w-5" />}
              title="Chemical Apps"
              value={String(preview.chemical.applicationCount)}
              subtitle={
                preview.chemical.topProducts[0]
                  ? `Top: ${preview.chemical.topProducts[0].name}`
                  : "No applications"
              }
            />
            <MetricCard
              icon={<Wrench className="h-5 w-5" />}
              title="Equipment"
              value={String(preview.equipment.serviceRecordsCount)}
              subtitle={`service records · ${preview.equipment.downtimeHours}h downtime`}
            />
            <MetricCard
              icon={<Cloud className="h-5 w-5" />}
              title="Weather"
              value={
                preview.weather.avgHighF !== null
                  ? `${preview.weather.avgHighF}/${preview.weather.avgLowF ?? "—"}°F`
                  : "No data"
              }
              subtitle={
                preview.weather.totalRainInches !== null
                  ? `${preview.weather.totalRainInches}" rain · ${preview.weather.frostDays} frost days`
                  : "No weather logs"
              }
            />
            <MetricCard
              icon={<Users className="h-5 w-5" />}
              title="Labor"
              value={String(preview.labor.totalScheduledShifts)}
              subtitle={`scheduled shifts · ${preview.labor.totalCrewMembers} crew`}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon,
  title,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">
            {title}
          </span>
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export default function MonthlyBoardReportPage() {
  return (
    <RoleGuard allowedRoles={ADMIN_ROLES}>
      <MonthlyBoardReportContent />
    </RoleGuard>
  );
}
