"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Droplets,
  Plus,
  Trash2,
  Target,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  Loader2,
  Printer,
  GaugeCircle,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { DetailPageHeader } from "@/components/ui/back-button";
import { useAuth } from "@/lib/hooks/useAuth";
import { RoleGuard } from "@/components/auth/role-guard";
import {
  directSelectList,
  directInsertRow,
  directPatchRow,
  directDeleteRow,
} from "@/lib/supabase/rest";
import type { WaterMeterReading, WaterUsageTarget, WaterSource } from "@/types/database";
import { todayLocal } from "@/lib/utils/date";

// ── Constants ──
const ALLOWED_ROLES: Array<"super" | "asst_super" | "director" | "foreman"> = [
  "super",
  "asst_super",
  "director",
  "foreman",
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WATER_SOURCES: { value: WaterSource; label: string }[] = [
  { value: "municipal", label: "Municipal" },
  { value: "well", label: "Well" },
  { value: "reclaimed", label: "Reclaimed" },
  { value: "pond", label: "Pond" },
  { value: "mixed", label: "Mixed" },
];

function formatGallons(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Main Page ──
export default function WaterUsagePage() {
  return (
    <RoleGuard allowedRoles={ALLOWED_ROLES}>
      <WaterUsageContent />
    </RoleGuard>
  );
}

function WaterUsageContent() {
  const { user, profile } = useAuth();

  const [readings, setReadings] = useState<WaterMeterReading[]>([]);
  const [targets, setTargets] = useState<WaterUsageTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [showExport, setShowExport] = useState(false);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // ── Data fetching ──
  const fetchReadings = useCallback(async () => {
    // Direct REST avoids the supabase.from() wedge that has stuck other
    // pages on "Loading..." after navigation.
    try {
      const data = await directSelectList<WaterMeterReading>("water_meter_readings", {
        columns: "*",
        orderBy: [{ column: "reading_date", ascending: false }],
        limit: 100,
        label: "water-usage.fetchReadings",
      });
      setReadings(data);
    } catch (err) {
      console.error("[water-usage] fetchReadings failed:", err);
    }
  }, []);

  const fetchTargets = useCallback(async () => {
    try {
      const data = await directSelectList<WaterUsageTarget>("water_usage_targets", {
        columns: "*",
        filters: [`year=eq.${currentYear}`],
        orderBy: [{ column: "month", ascending: true }],
        label: "water-usage.fetchTargets",
      });
      setTargets(data);
    } catch (err) {
      console.error("[water-usage] fetchTargets failed:", err);
    }
  }, [currentYear]);

  useEffect(() => {
    Promise.all([fetchReadings(), fetchTargets()]).finally(() =>
      setLoading(false)
    );
  }, [fetchReadings, fetchTargets]);

  // ── Computed stats ──
  const thisMonthReadings = readings.filter((r) => {
    const d = new Date(r.reading_date);
    return d.getFullYear() === currentYear && d.getMonth() + 1 === currentMonth;
  });

  const lastMonthReadings = readings.filter((r) => {
    const d = new Date(r.reading_date);
    const lm = currentMonth === 1 ? 12 : currentMonth - 1;
    const ly = currentMonth === 1 ? currentYear - 1 : currentYear;
    return d.getFullYear() === ly && d.getMonth() + 1 === lm;
  });

  const thisMonthUsage = thisMonthReadings.reduce(
    (sum, r) => sum + (r.usage_gallons || 0),
    0
  );
  const lastMonthUsage = lastMonthReadings.reduce(
    (sum, r) => sum + (r.usage_gallons || 0),
    0
  );
  const monthDelta =
    lastMonthUsage > 0
      ? ((thisMonthUsage - lastMonthUsage) / lastMonthUsage) * 100
      : 0;

  const monthTarget = targets.find((t) => t.month === currentMonth);
  const targetPct =
    monthTarget && monthTarget.target_gallons > 0
      ? (thisMonthUsage / monthTarget.target_gallons) * 100
      : 0;

  const ytdReadings = readings.filter((r) => {
    const d = new Date(r.reading_date);
    return d.getFullYear() === currentYear;
  });
  const ytdUsage = ytdReadings.reduce(
    (sum, r) => sum + (r.usage_gallons || 0),
    0
  );

  const dayOfMonth = new Date().getDate();
  const dailyAvg = dayOfMonth > 0 ? thisMonthUsage / dayOfMonth : 0;

  // ── Chart data ──
  const chartData = MONTH_NAMES.map((name, i) => {
    const monthNum = i + 1;
    const monthReadings = readings.filter((r) => {
      const d = new Date(r.reading_date);
      return d.getFullYear() === currentYear && d.getMonth() + 1 === monthNum;
    });
    const actual = monthReadings.reduce(
      (sum, r) => sum + (r.usage_gallons || 0),
      0
    );
    const target = targets.find((t) => t.month === monthNum);
    return {
      month: name,
      actual: Math.round(actual),
      target: target ? Math.round(target.target_gallons) : 0,
    };
  });

  // ── Delete reading ──
  const handleDeleteReading = async (id: string) => {
    try {
      await directDeleteRow(
        "water_meter_readings",
        "id",
        id,
        "water-usage.deleteReading",
      );
      setReadings((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("[water-usage] deleteReading failed:", err);
    }
  };

  // ── Inline target edit ──
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleTargetSave = async (targetId: string, _month: number) => {
    const val = parseFloat(editingValue);
    if (isNaN(val) || val <= 0) return;

    const existing = targets.find((t) => t.id === targetId);
    if (existing) {
      try {
        await directPatchRow(
          "water_usage_targets",
          "id",
          targetId,
          { target_gallons: val, updated_at: new Date().toISOString() },
          "water-usage.inlineTargetEdit",
        );
      } catch (err) {
        console.error("[water-usage] inlineTargetEdit failed:", err);
      }
    }
    setEditingTarget(null);
    setEditingValue("");
    fetchTargets();
  };

  // ── Set annual budget ──
  const handleSetAnnualBudget = async (totalGallons: number) => {
    if (totalGallons <= 0) return;

    // Growing season weighting: Apr-Oct = 1.5x, Nov-Mar = 0.5x
    const weights = [0.5, 0.5, 0.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 0.5, 0.5];
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    for (let m = 1; m <= 12; m++) {
      const monthTarget = Math.round(
        (totalGallons * weights[m - 1]) / totalWeight
      );

      const existing = targets.find(
        (t) => t.year === currentYear && t.month === m
      );
      try {
        if (existing) {
          await directPatchRow(
            "water_usage_targets",
            "id",
            existing.id,
            {
              target_gallons: monthTarget,
              updated_at: new Date().toISOString(),
            },
            "water-usage.updateTarget",
          );
        } else {
          await directInsertRow(
            "water_usage_targets",
            {
              year: currentYear,
              month: m,
              target_gallons: monthTarget,
            },
            "water-usage.insertTarget",
          );
        }
      } catch (err) {
        console.error(`[water-usage] target month ${m} save failed:`, err);
      }
    }
    setShowBudgetForm(false);
    fetchTargets();
  };

  // ── Export ──
  const sourceBreakdown = () => {
    const map: Record<string, number> = {};
    ytdReadings.forEach((r) => {
      map[r.source] = (map[r.source] || 0) + (r.usage_gallons || 0);
    });
    return Object.entries(map).map(([source, gallons]) => ({
      source,
      gallons: Math.round(gallons),
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-24 max-w-4xl mx-auto">
      <DetailPageHeader
        backHref="/more"
        backLabel="More"
        title="Water Usage"
        subtitle="Irrigation metering & base utilities reporting"
      />

      {/* ── Top Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard
          label="This Month"
          value={formatGallons(thisMonthUsage)}
          sub="gallons"
          delta={monthDelta}
          icon={<Droplets className="w-4 h-4 text-cyan-600" />}
        />
        <StatCard
          label="Monthly Target"
          value={
            monthTarget
              ? formatGallons(monthTarget.target_gallons)
              : "Not set"
          }
          sub={monthTarget ? `${targetPct.toFixed(0)}% used` : ""}
          icon={<Target className="w-4 h-4 text-emerald-600" />}
          pct={monthTarget ? targetPct : undefined}
        />
        <StatCard
          label="Year-to-Date"
          value={formatGallons(ytdUsage)}
          sub="gallons"
          icon={<CalendarDays className="w-4 h-4 text-blue-600" />}
        />
        <StatCard
          label="Daily Average"
          value={formatGallons(Math.round(dailyAvg))}
          sub="gal/day this month"
          icon={<GaugeCircle className="w-4 h-4 text-violet-600" />}
        />
      </div>

      {/* ── Monthly Usage Chart ── */}
      <div className="rounded-2xl border border-border bg-card p-4 md:p-6 mb-6">
        <h2 className="text-base font-semibold mb-4">
          Monthly Usage vs Target - {currentYear}
        </h2>
        <div className="h-64 md:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => formatGallons(v)}
              />
              <Tooltip
                formatter={(value, name) => [
                  Number(value).toLocaleString() + " gal",
                  name === "actual" ? "Actual" : "Target",
                ]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                  backgroundColor: "hsl(var(--card))",
                  color: "hsl(var(--foreground))",
                }}
              />
              <Legend />
              <Bar
                dataKey="target"
                name="Target"
                fill="hsl(var(--muted-foreground))"
                opacity={0.25}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="actual"
                name="Actual"
                fill="hsl(210, 100%, 50%)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Meter Readings ── */}
      <div className="rounded-2xl border border-border bg-card mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Meter Readings
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Reading
          </Button>
        </div>

        {showAddForm && (
          <AddReadingForm
            userId={user?.id || ""}
            readings={readings}
            onSaved={() => {
              setShowAddForm(false);
              fetchReadings();
            }}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground text-xs uppercase">
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="text-left px-4 py-2 font-medium">Meter</th>
                <th className="text-right px-4 py-2 font-medium">Reading</th>
                <th className="text-right px-4 py-2 font-medium">Usage (gal)</th>
                <th className="text-left px-4 py-2 font-medium">Source</th>
                <th className="text-right px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {readings.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No meter readings yet. Add your first reading above.
                  </td>
                </tr>
              )}
              {readings.slice(0, 20).map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-2.5">{r.reading_date}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">
                    {r.meter_id}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.reading_value.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">
                    {r.usage_gallons.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 capitalize">{r.source}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => handleDeleteReading(r.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      title="Delete reading"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Monthly Targets ── */}
      <div className="rounded-2xl border border-border bg-card mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Monthly Targets - {currentYear}
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowBudgetForm(!showBudgetForm)}
          >
            <Target className="w-4 h-4 mr-1" />
            Set Annual Budget
          </Button>
        </div>

        {showBudgetForm && (
          <AnnualBudgetForm
            onSave={handleSetAnnualBudget}
            onCancel={() => setShowBudgetForm(false)}
          />
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground text-xs uppercase">
                <th className="text-left px-4 py-2 font-medium">Month</th>
                <th className="text-right px-4 py-2 font-medium">
                  Target (gal)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {MONTH_FULL.map((name, i) => {
                const monthNum = i + 1;
                const target = targets.find((t) => t.month === monthNum);
                const isEditing = editingTarget === (target?.id || `new-${monthNum}`);

                return (
                  <tr
                    key={monthNum}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-2.5">{name}</td>
                    <td className="px-4 py-2.5 text-right">
                      {isEditing ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            inputMode="decimal"
                            className="w-28 px-2 py-1 text-right rounded border border-border bg-background text-sm"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && target) {
                                handleTargetSave(target.id, monthNum);
                              }
                              if (e.key === "Escape") {
                                setEditingTarget(null);
                                setEditingValue("");
                              }
                            }}
                            autoFocus
                          />
                          <button
                            className="text-xs text-primary font-medium px-1"
                            onClick={() =>
                              target && handleTargetSave(target.id, monthNum)
                            }
                          >
                            Save
                          </button>
                        </span>
                      ) : (
                        <button
                          className="hover:text-primary transition-colors cursor-pointer"
                          onClick={() => {
                            if (target) {
                              setEditingTarget(target.id);
                              setEditingValue(
                                String(target.target_gallons)
                              );
                            }
                          }}
                          title={target ? "Click to edit" : "Set annual budget first"}
                        >
                          {target
                            ? target.target_gallons.toLocaleString()
                            : "--"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Export Button ── */}
      <div className="flex gap-3 mb-6">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setShowExport(true)}
        >
          <Printer className="w-4 h-4 mr-2" />
          Export for Base Utilities
        </Button>
      </div>

      {/* ── Export Modal ── */}
      {showExport && (
        <ExportReport
          year={currentYear}
          month={currentMonth}
          readings={readings}
          targets={targets}
          ytdUsage={ytdUsage}
          sourceBreakdown={sourceBreakdown()}
          preparedBy={
            profile
              ? (profile.full_name || profile.display_name || profile.email || "Unknown")
              : "Unknown"
          }
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

// ── Stat Card ──
function StatCard({
  label,
  value,
  sub,
  delta,
  icon,
  pct,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number;
  icon: React.ReactNode;
  pct?: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
          {label}
        </span>
        {icon}
      </div>
      <p className="text-xl font-bold">{value}</p>
      <div className="flex items-center gap-1 mt-1">
        {delta !== undefined && delta !== 0 && (
          <span
            className={`text-xs font-medium flex items-center gap-0.5 ${
              delta > 0 ? "text-red-500" : "text-green-500"
            }`}
          >
            {delta > 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
        {sub && (
          <span className="text-xs text-muted-foreground">{sub}</span>
        )}
      </div>
      {pct !== undefined && (
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              pct > 100
                ? "bg-red-500"
                : pct > 80
                ? "bg-amber-500"
                : "bg-emerald-500"
            }`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ── Add Reading Form ──
// `supabase` prop removed — the form's submit now uses directInsertRow
// (no `.from()` call), so the prop was dead. Keeping `userId`, `readings`
// for the previous-reading lookup and the recorded_by column.
function AddReadingForm({
  userId,
  readings,
  onSaved,
  onCancel,
}: {
  userId: string;
  readings: WaterMeterReading[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [meterId, setMeterId] = useState("MAIN-01");
  const [readingDate, setReadingDate] = useState(todayLocal());
  const [readingValue, setReadingValue] = useState("");
  const [source, setSource] = useState<WaterSource>("municipal");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Find previous reading for this meter
  const previousForMeter = readings
    .filter((r) => r.meter_id === meterId)
    .sort(
      (a, b) =>
        new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime()
    )[0];

  const calcUsage =
    previousForMeter && readingValue
      ? Math.max(0, parseFloat(readingValue) - previousForMeter.reading_value)
      : parseFloat(readingValue) || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!readingValue || parseFloat(readingValue) < 0) return;
    setSaving(true);

    const val = parseFloat(readingValue);
    try {
      await directInsertRow(
        "water_meter_readings",
        {
          meter_id: meterId,
          reading_date: readingDate,
          reading_value: val,
          previous_reading: previousForMeter
            ? previousForMeter.reading_value
            : null,
          usage_gallons: calcUsage,
          source,
          notes: notes || null,
          recorded_by: userId,
        },
        "water-usage.insertReading",
      );
      onSaved();
    } catch (err) {
      console.error("[water-usage] insertReading failed:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-4 border-b border-border/50 bg-muted/20 space-y-3"
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Meter ID
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            value={meterId}
            onChange={(e) => setMeterId(e.target.value)}
            placeholder="e.g. MAIN-01"
            required
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Reading Date
          </label>
          <input
            type="date"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            value={readingDate}
            onChange={(e) => setReadingDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Current Reading (gal)
          </label>
          <input
            type="number"
            inputMode="decimal"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            value={readingValue}
            onChange={(e) => setReadingValue(e.target.value)}
            min="0"
            step="1"
            placeholder="Gallons"
            required
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Water Source
          </label>
          <select
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            value={source}
            onChange={(e) => setSource(e.target.value as WaterSource)}
          >
            {WATER_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 md:col-span-1">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Notes
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      {previousForMeter && readingValue && (
        <p className="text-xs text-muted-foreground">
          Previous reading for {meterId}:{" "}
          {previousForMeter.reading_value.toLocaleString()} gal |{" "}
          <span className="font-medium text-foreground">
            Calculated usage: {calcUsage.toLocaleString()} gal
          </span>
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
          Save Reading
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── Annual Budget Form ──
function AnnualBudgetForm({
  onSave,
  onCancel,
}: {
  onSave: (total: number) => void;
  onCancel: () => void;
}) {
  const [total, setTotal] = useState("");

  return (
    <div className="p-4 border-b border-border/50 bg-muted/20">
      <p className="text-sm text-muted-foreground mb-2">
        Enter the annual water budget in gallons. It will be distributed across
        12 months with growing-season weighting (Apr-Oct get 1.5x, Nov-Mar get
        0.5x).
      </p>
      <div className="flex items-end gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Total Annual Gallons
          </label>
          <input
            type="number"
            inputMode="decimal"
            className="w-48 px-3 py-2 rounded-lg border border-border bg-background text-sm"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            min="1"
            placeholder="e.g. 12000000"
          />
        </div>
        <Button
          size="sm"
          onClick={() => {
            const v = parseFloat(total);
            if (v > 0) onSave(v);
          }}
        >
          Apply
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Export Report ──
function ExportReport({
  year,
  month,
  readings,
  targets,
  ytdUsage,
  sourceBreakdown,
  preparedBy,
  onClose,
}: {
  year: number;
  month: number;
  readings: WaterMeterReading[];
  targets: WaterUsageTarget[];
  ytdUsage: number;
  sourceBreakdown: { source: string; gallons: number }[];
  preparedBy: string;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Water Usage Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; font-size: 14px; color: #111; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            h2 { font-size: 16px; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; font-size: 13px; }
            th { background: #f5f5f5; font-weight: 600; }
            .right { text-align: right; }
            .meta { color: #666; font-size: 13px; }
            .footer { margin-top: 32px; font-size: 12px; color: #888; }
          </style>
        </head>
        <body>${content.innerHTML}</body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  // Monthly detail for the report
  const monthlyDetail = MONTH_FULL.map((name, i) => {
    const mn = i + 1;
    const mReadings = readings.filter((r) => {
      const d = new Date(r.reading_date);
      return d.getFullYear() === year && d.getMonth() + 1 === mn;
    });
    const actual = mReadings.reduce(
      (sum, r) => sum + (r.usage_gallons || 0),
      0
    );
    const target = targets.find((t) => t.month === mn);
    return { name, actual: Math.round(actual), target: target ? Math.round(target.target_gallons) : 0 };
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-card rounded-2xl border border-border max-w-2xl w-full my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-lg">Base Utilities Report</h2>
          <div className="flex gap-2">
            <Button size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-1" />
              Print
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div ref={printRef} className="p-6 text-sm">
          <h1 style={{ fontSize: "20px", fontWeight: 700 }}>
            Water Consumption Report
          </h1>
          <p className="meta" style={{ color: "#666", fontSize: "13px" }}>
            Veterans Memorial Golf Course
            <br />
            Naval Station Great Lakes
          </p>

          <h2
            style={{
              fontSize: "16px",
              marginTop: "20px",
              borderBottom: "1px solid #ccc",
              paddingBottom: "4px",
            }}
          >
            Reporting Period
          </h2>
          <p>
            Fiscal Year {year}, as of {MONTH_FULL[month - 1]} {year}
          </p>

          <h2
            style={{
              fontSize: "16px",
              marginTop: "20px",
              borderBottom: "1px solid #ccc",
              paddingBottom: "4px",
            }}
          >
            Summary
          </h2>
          <p>
            <strong>Total YTD Consumption:</strong>{" "}
            {ytdUsage.toLocaleString()} gallons
          </p>

          <h2
            style={{
              fontSize: "16px",
              marginTop: "20px",
              borderBottom: "1px solid #ccc",
              paddingBottom: "4px",
            }}
          >
            Source Breakdown
          </h2>
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th className="right" style={{ textAlign: "right" }}>
                  Gallons
                </th>
              </tr>
            </thead>
            <tbody>
              {sourceBreakdown.map((s) => (
                <tr key={s.source}>
                  <td style={{ textTransform: "capitalize" }}>{s.source}</td>
                  <td style={{ textAlign: "right" }}>
                    {s.gallons.toLocaleString()}
                  </td>
                </tr>
              ))}
              {sourceBreakdown.length === 0 && (
                <tr>
                  <td colSpan={2} style={{ textAlign: "center", color: "#999" }}>
                    No data
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <h2
            style={{
              fontSize: "16px",
              marginTop: "20px",
              borderBottom: "1px solid #ccc",
              paddingBottom: "4px",
            }}
          >
            Monthly Detail
          </h2>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th style={{ textAlign: "right" }}>Target (gal)</th>
                <th style={{ textAlign: "right" }}>Actual (gal)</th>
                <th style={{ textAlign: "right" }}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {monthlyDetail.map((m) => {
                const variance = m.target > 0 ? m.actual - m.target : 0;
                return (
                  <tr key={m.name}>
                    <td>{m.name}</td>
                    <td style={{ textAlign: "right" }}>
                      {m.target > 0 ? m.target.toLocaleString() : "--"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {m.actual > 0 ? m.actual.toLocaleString() : "--"}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        color:
                          variance > 0 ? "#dc2626" : variance < 0 ? "#16a34a" : "inherit",
                      }}
                    >
                      {m.target > 0 && m.actual > 0
                        ? (variance > 0 ? "+" : "") +
                          variance.toLocaleString()
                        : "--"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div
            className="footer"
            style={{ marginTop: "32px", fontSize: "12px", color: "#888" }}
          >
            <p>
              Prepared by: {preparedBy}
              <br />
              Date: {today}
              <br />
              Generated by GreenKeeper Pro
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
