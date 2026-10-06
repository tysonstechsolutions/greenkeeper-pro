"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Plus,
  Trash2,
  Loader2,
  Calendar,
  TrendingUp,
  Users,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/hooks/useAuth";
import { RoleGuard, GM_ROLES, withFbManager } from "@/components/auth/role-guard";
import { createClient } from "@/lib/supabase/client";
import { formatLocalDate, todayLocal } from "@/lib/utils/date";
import { BUCKLEYS_REVENUE_CATEGORIES, REVENUE_CATEGORIES, REVENUE_LABELS } from "@/lib/money/revenue-categories";
import { UploadReportCard } from "./upload-report";
import { SaleDayItems } from "./sale-day-items";

// ── Types ──
interface RevenueEntry {
  id: string;
  entry_date: string;
  category: string;
  amount: number;
  description: string | null;
  rounds_count: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  // Set on daily sales saved from a RecTrac report (2026-10-09 update).
  sales_report_id?: string | null;
}

// ── Constants ──
const CATEGORIES = REVENUE_CATEGORIES;

const categoryLabels: Record<string, string> = REVENUE_LABELS;

const categoryColors: Record<string, string> = {
  greens_fees: "bg-green-500/10 text-green-700 border-green-200",
  cart_rentals: "bg-blue-500/10 text-blue-700 border-blue-200",
  pro_shop: "bg-purple-500/10 text-purple-700 border-purple-200",
  food_beverage: "bg-orange-500/10 text-orange-700 border-orange-200",
  bar: "bg-rose-500/10 text-rose-700 border-rose-200",
  events: "bg-pink-500/10 text-pink-700 border-pink-200",
  memberships: "bg-indigo-500/10 text-indigo-700 border-indigo-200",
  driving_range: "bg-teal-500/10 text-teal-700 border-teal-200",
  other: "bg-muted text-muted-foreground border-border",
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getToday(): string {
  return todayLocal();
}

function getStartOfWeek(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return formatLocalDate(d);
}

function getStartOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export default function RevenuePage() {
  const { user, isFbManager } = useAuth();
  const supabase = createClient();
  // The F&B Manager sees and logs Buckley's revenue only (restaurant and bar).
  const onlyCategories: string[] | null = isFbManager ? BUCKLEYS_REVENUE_CATEGORIES : null;
  const onlyCategory = onlyCategories ? onlyCategories[0] : null;
  const categories = onlyCategories ? CATEGORIES.filter((c) => onlyCategories.includes(c.value)) : CATEGORIES;
  // Apply the Buckley's-only filter to a revenue_entries query.
  const scoped = useCallback(<Q extends { in: (col: string, v: string[]) => Q }>(q: Q): Q =>
    onlyCategories ? q.in("category", onlyCategories) : q,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onlyCategories only changes with isFbManager
    [isFbManager]);

  // Form state
  const [entryDate, setEntryDate] = useState(getToday());
  const [category, setCategory] = useState(isFbManager ? "food_beverage" : "");
  const [amount, setAmount] = useState("");
  const [roundsCount, setRoundsCount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Data state
  const [entries, setEntries] = useState<RevenueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayTotal, setTodayTotal] = useState(0);
  const [weekTotal, setWeekTotal] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);
  const [mtdRounds, setMtdRounds] = useState(0);
  /** The report entry whose items are open. */
  const [openEntry, setOpenEntry] = useState<string | null>(null);

  // ── Fetch entries ──
  const fetchEntries = useCallback(async () => {
    const { data } = await scoped(supabase
      .from("revenue_entries")
      .select("*"))
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      setEntries(data as RevenueEntry[]);
    }
  }, [supabase, scoped]);

  // ── Fetch summary stats ──
  const fetchSummary = useCallback(async () => {
    const today = getToday();
    const weekStart = getStartOfWeek();
    const monthStart = getStartOfMonth();

    // Today total
    const { data: todayData } = await scoped(supabase
      .from("revenue_entries")
      .select("amount"))
      .eq("entry_date", today);
    setTodayTotal(
      (todayData || []).reduce((sum: number, r: { amount: number }) => sum + Number(r.amount), 0)
    );

    // Week total
    const { data: weekData } = await scoped(supabase
      .from("revenue_entries")
      .select("amount"))
      .gte("entry_date", weekStart);
    setWeekTotal(
      (weekData || []).reduce((sum: number, r: { amount: number }) => sum + Number(r.amount), 0)
    );

    // Month total
    const { data: monthData } = await scoped(supabase
      .from("revenue_entries")
      .select("amount, rounds_count"))
      .gte("entry_date", monthStart);
    setMonthTotal(
      (monthData || []).reduce((sum: number, r: { amount: number }) => sum + Number(r.amount), 0)
    );
    setMtdRounds(
      (monthData || []).reduce(
        (sum: number, r: { rounds_count: number | null }) => sum + (Number(r.rounds_count) || 0),
        0
      )
    );
  }, [supabase, scoped]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      await Promise.all([fetchEntries(), fetchSummary()]);
      setLoading(false);
    }
    load();
  }, [fetchEntries, fetchSummary]);

  // ── Add entry ──
  const handleAddEntry = async () => {
    if (!category || !amount || !user) return;

    setSubmitting(true);
    const { error } = await supabase.from("revenue_entries").insert({
      entry_date: entryDate,
      category,
      amount: parseFloat(amount),
      rounds_count:
        category === "greens_fees" && roundsCount
          ? parseInt(roundsCount)
          : null,
      description: description || null,
      created_by: user.id,
    });

    if (!error) {
      setCategory(onlyCategory ?? "");
      setAmount("");
      setRoundsCount("");
      setDescription("");
      await Promise.all([fetchEntries(), fetchSummary()]);
    }
    setSubmitting(false);
  };

  // ── Delete entry ──
  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("revenue_entries")
      .delete()
      .eq("id", id);

    if (!error) {
      await Promise.all([fetchEntries(), fetchSummary()]);
    }
  };

  // ── Group entries by date ──
  const groupedEntries = entries.reduce<Record<string, RevenueEntry[]>>(
    (groups, entry) => {
      const date = entry.entry_date;
      if (!groups[date]) groups[date] = [];
      groups[date].push(entry);
      return groups;
    },
    {}
  );

  const sortedDates = Object.keys(groupedEntries).sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime()
  );
  // Only show last 30 unique dates
  const displayDates = sortedDates.slice(0, 30);

  return (
    <RoleGuard allowedRoles={withFbManager(GM_ROLES)}>
      <div className="p-4 md:p-6 pb-24 max-w-2xl mx-auto">
        <PageHeader
          icon={DollarSign}
          title="Revenue Tracking"
          description="Enter and track daily revenue"
        />

        {/* ── Upload a POS/register report (AI-transcribed, human-verified) ── */}
        {/* One RecTrac report per area. The F&B Manager uploads Buckley's (restaurant and bar). */}
        <UploadReportCard
          userId={user?.id ?? null}
          areas={isFbManager ? ["restaurant", "bar"] : undefined}
          onSaved={() => {
            Promise.all([fetchEntries(), fetchSummary()]);
          }}
        />

        {/* ── Quick Entry Form ── */}
        <Card className="mb-6">
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="entry-date">Date</Label>
                <Input
                  id="entry-date"
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="amount">Amount ($)</Label>
                <Input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              {category === "greens_fees" && (
                <div>
                  <Label htmlFor="rounds">Rounds</Label>
                  <Input
                    id="rounds"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder="0"
                    value={roundsCount}
                    onChange={(e) => setRoundsCount(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="e.g. Weekend tournament, holiday special..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <Button
              onClick={handleAddEntry}
              disabled={!category || !amount || submitting}
              className="w-full"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add Entry
            </Button>
          </CardContent>
        </Card>

        {/* ── Summary Cards ── */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span className="text-xs">Today</span>
                  </div>
                  <p className="text-xl font-bold">{formatCurrency(todayTotal)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="text-xs">This Week</span>
                  </div>
                  <p className="text-xl font-bold">{formatCurrency(weekTotal)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span className="text-xs">This Month</span>
                  </div>
                  <p className="text-xl font-bold">{formatCurrency(monthTotal)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    <Users className="w-3.5 h-3.5" />
                    <span className="text-xs">MTD Rounds</span>
                  </div>
                  <p className="text-xl font-bold">{mtdRounds.toLocaleString()}</p>
                </CardContent>
              </Card>
            </div>

            {/* ── Recent Entries ── */}
            <h2 className="text-lg font-semibold mb-3">Recent Entries</h2>
            {displayDates.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No revenue entries yet. Add your first entry above.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {displayDates.map((date) => (
                  <div key={date}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        {formatDate(date)}
                      </h3>
                      <span className="text-sm font-semibold">
                        {formatCurrency(
                          groupedEntries[date].reduce(
                            (s, e) => s + Number(e.amount),
                            0
                          )
                        )}
                      </span>
                    </div>
                    <Card>
                      <div className="divide-y divide-border">
                        {groupedEntries[date].map((entry) => {
                          const hasItems = !!entry.sales_report_id;
                          const isOpen = openEntry === entry.id;
                          return (
                          <div key={entry.id}>
                          <div className="flex items-center gap-3 px-4 py-3">
                            <button
                              type="button"
                              disabled={!hasItems}
                              onClick={() => setOpenEntry(isOpen ? null : entry.id)}
                              aria-expanded={hasItems ? isOpen : undefined}
                              aria-label={hasItems ? `${isOpen ? "Hide" : "Show"} what was sold: ${entry.description ?? ""}` : undefined}
                              className="flex-1 min-w-0 text-left flex items-start gap-1.5 disabled:cursor-default"
                            >
                              {hasItems &&
                                (isOpen ? (
                                  <ChevronDown className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                                ))}
                              <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <Badge
                                  variant="outline"
                                  className={
                                    categoryColors[entry.category] || ""
                                  }
                                >
                                  {categoryLabels[entry.category] ||
                                    entry.category}
                                </Badge>
                                {entry.rounds_count != null &&
                                  entry.rounds_count > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                      {entry.rounds_count} rounds
                                    </span>
                                  )}
                              </div>
                              {entry.description && (
                                <p className="text-sm text-muted-foreground truncate">
                                  {entry.description}
                                </p>
                              )}
                              </div>
                            </button>
                            <span className="font-semibold tabular-nums whitespace-nowrap">
                              {formatCurrency(Number(entry.amount))}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="shrink-0 text-muted-foreground hover:text-destructive h-8 w-8"
                              onClick={() => handleDelete(entry.id)}
                              aria-label="Delete entry"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                          {hasItems && isOpen && (
                            <div className="px-4 pb-3 pl-10">
                              <SaleDayItems
                                reportId={entry.sales_report_id!}
                                date={entry.entry_date}
                                entryAmount={Number(entry.amount)}
                              />
                            </div>
                          )}
                          </div>
                          );
                        })}
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </RoleGuard>
  );
}
