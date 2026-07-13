"use client";

// TODAY — the operating-rhythm home (Operation Blueprint Phase 1).
// One screen answers "what do I need to do?": alarms coming due, today's
// duties per area, My Day tasks, and this week's events. Everything else
// is one tap away through the workspace doors.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ListChecks,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOperations } from "@/lib/operations/use-operations";
import { isInSeason, ymdLocal } from "@/lib/operations/engine";
import type { DutyArea } from "@/lib/operations/types";
import { directSelectList } from "@/lib/supabase/rest";
import { evaluateCerts, type Certification, type EvaluatedCert } from "@/lib/people/certs";
import { useMyDay } from "@/lib/my-day/use-my-day";
import { useCalendar } from "@/lib/calendar/use-calendar";
import { useEquipment } from "@/lib/hooks/useEquipment";
import { getReadinessBuckets } from "@/lib/equipment/readiness";
import { isTriageAttention, triageLabel, triageOrder } from "@/lib/equipment/triage";
import { kindMeta } from "@/lib/calendar/types";
import {
  HUB_COURSE,
  HUB_MONEY,
  HUB_PEOPLE,
  HUB_PRO_SHOP,
  HUB_RESTAURANT,
} from "@/lib/layout/app-catalog";
import { ObligationRow } from "@/components/features/operations/obligation-row";

const WORKSPACES = [HUB_COURSE, HUB_RESTAURANT, HUB_PRO_SHOP, HUB_MONEY, HUB_PEOPLE];

const AREA_LABELS: Record<DutyArea, string> = {
  course: "Course & Range",
  restaurant: "Restaurant",
  pro_shop: "Pro Shop",
};

export default function TodayPage() {
  const ops = useOperations();
  const myDay = useMyDay();
  const calendar = useCalendar();
  const { equipment: equipmentUnits } = useEquipment();
  const [showScheduled, setShowScheduled] = useState(false);

  // Expiring certifications ride the alarm section (Phase 5). Light fetch —
  // only active certs, evaluated client-side.
  const [certAlarms, setCertAlarms] = useState<EvaluatedCert[]>([]);
  useEffect(() => {
    let cancelled = false;
    directSelectList<Certification>("certifications", {
      columns: "*",
      filters: ["is_active=eq.true", "expires_date=not.is.null"],
      limit: 200,
      label: "today.certs",
    })
      .then((rows) => {
        if (cancelled) return;
        setCertAlarms(
          evaluateCerts(rows, new Date()).filter(
            (e) => e.status === "expired" || e.status === "expiring",
          ),
        );
      })
      .catch(() => {
        // Non-critical — Today still renders without cert alarms.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const alarms = ops.evaluated.filter(
    (e) => e.status === "overdue" || e.status === "due_soon",
  );
  const scheduled = ops.evaluated.filter(
    (e) => e.status === "upcoming" || e.status === "done",
  );

  const dutiesToday = ops.dutiesToday;
  const dutiesByArea = useMemo(() => {
    const groups = new Map<DutyArea, typeof dutiesToday>();
    for (const d of dutiesToday) {
      const list = groups.get(d.duty.area) ?? [];
      list.push(d);
      groups.set(d.duty.area, list);
    }
    return groups;
  }, [dutiesToday]);

  // My Day: overdue rolls into today (same rule as /my-day).
  const myDayItems = useMemo(
    () => [...myDay.view.overdue, ...myDay.view.today].slice(0, 8),
    [myDay.view],
  );

  // Down units need a short, actionable presence on Today. Status and triage
  // remain separate: no diagnosis is inferred for an untriaged down unit.
  const equipmentAttention = useMemo(
    () => equipmentUnits
      .filter((unit) => (
        isTriageAttention(unit.triage_status)
        || (getReadinessBuckets(unit).includes("down") && !unit.triage_status)
      ))
      .sort((a, b) => triageOrder(a.triage_status) - triageOrder(b.triage_status) || a.name.localeCompare(b.name))
      .slice(0, 6),
    [equipmentUnits],
  );

  // This week's events (exclude My Day 'task' deadlines — shown above).
  const weekItems = useMemo(() => {
    const start = ymdLocal(now);
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + 6);
    const end = ymdLocal(endDate);
    return calendar.items
      .filter((i) => i.kind !== "task")
      .filter((i) => {
        const last = i.endDate ?? i.date;
        return last >= start && i.date <= end;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar.items, ops.today]);

  const loading = ops.loading && myDay.loading;

  return (
    <div className="gk-page mx-auto">
      {/* Header */}
      <div className="mb-6 gk-animate-in gk-animate-in-1">
        <h1 className="mb-0.5">Today</h1>
        <p className="text-sm text-muted-foreground">
          {dateLabel}
          <span
            className={cn(
              "ml-2 text-[11px] font-semibold px-1.5 py-0.5 rounded-md border align-middle",
              isInSeason(now)
                ? "bg-success/10 text-success border-success/30"
                : "bg-muted text-muted-foreground border-border",
            )}
          >
            {isInSeason(now) ? "In season" : "Off season"}
          </span>
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <>
          {/* Alarms */}
          {(alarms.length > 0 || certAlarms.length > 0) && (
            <section className="mb-6 gk-animate-in gk-animate-in-2">
              <p className="gk-section-label mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                Coming due
              </p>
              <div className="space-y-2">
                {alarms.map((e) => (
                  <ObligationRow
                    key={e.obligation.id}
                    item={e}
                    onComplete={() => ops.completeObligation(e)}
                  />
                ))}
                {certAlarms.map(({ cert, status, daysUntil }) => (
                  <Link
                    key={cert.id}
                    href="/certifications"
                    className="gk-card flex items-center gap-3 px-4 py-3 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {cert.cert_name} — {cert.holder}
                        </span>
                        <span
                          className={cn(
                            "text-[11px] font-semibold px-1.5 py-0.5 rounded-md border",
                            status === "expired"
                              ? "bg-destructive/10 text-destructive border-destructive/30"
                              : "bg-warning/15 text-warning-foreground border-warning/40",
                          )}
                        >
                          {status === "expired"
                            ? `Expired ${-(daysUntil ?? 0)} day${daysUntil === -1 ? "" : "s"} ago`
                            : daysUntil === 0
                              ? "Expires today"
                              : `Expires in ${daysUntil} days`}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Certification · renew before it lapses
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {equipmentAttention.length > 0 && (
            <section className="mb-6 gk-animate-in gk-animate-in-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="gk-section-label flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                  Equipment attention
                </p>
                <Link href="/equipment" className="inline-link text-xs font-medium text-primary py-1">Open equipment</Link>
              </div>
              <div className="gk-card divide-y divide-border/50">
                {equipmentAttention.map((unit) => (
                  <Link
                    key={unit.id}
                    href={`/equipment/view?id=${encodeURIComponent(unit.id)}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm">{unit.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{triageLabel(unit.triage_status)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Duties by area */}
          {dutiesByArea.size > 0 && (
            <section className="mb-6 gk-animate-in gk-animate-in-3">
              <p className="gk-section-label mb-2">The day&apos;s rhythm</p>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {(Object.keys(AREA_LABELS) as DutyArea[]).map((areaKey) => {
                  const list = dutiesByArea.get(areaKey);
                  if (!list?.length) return null;
                  const doneCount = list.filter((d) => d.done).length;
                  return (
                    <div key={areaKey} className="gk-card overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-muted/40">
                        <span className="text-xs font-semibold">{AREA_LABELS[areaKey]}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {doneCount}/{list.length}
                        </span>
                      </div>
                      <div className="divide-y divide-border/50">
                        {list.map(({ duty, done }) => (
                          <button
                            key={duty.id}
                            onClick={() => ops.toggleDuty(duty.id, !done)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors"
                          >
                            <span
                              className={cn(
                                "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                                done
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-input",
                              )}
                            >
                              {done && <Check className="w-3.5 h-3.5" />}
                            </span>
                            <span
                              className={cn(
                                "text-sm leading-snug",
                                done && "line-through text-muted-foreground",
                              )}
                            >
                              {duty.title}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* My Day tasks */}
          {myDayItems.length > 0 && (
            <section className="mb-6 gk-animate-in gk-animate-in-4">
              <div className="flex items-center justify-between mb-2">
                <p className="gk-section-label flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5" />
                  My Day
                </p>
                <Link href="/my-day" className="inline-link text-xs font-medium text-primary py-1">
                  Open My Day
                </Link>
              </div>
              <div className="gk-card divide-y divide-border/50">
                {myDayItems.map((step) => (
                  <button
                    key={step.id}
                    onClick={() => myDay.toggleStep(step.id, true)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors"
                  >
                    <span className="w-5 h-5 rounded-md border border-input shrink-0" />
                    <span className="text-sm leading-snug flex-1 min-w-0 truncate">
                      {step.title}
                    </span>
                    {step.urgent && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive shrink-0">
                        URGENT
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* This week */}
          {weekItems.length > 0 && (
            <section className="mb-6 gk-animate-in gk-animate-in-5">
              <div className="flex items-center justify-between mb-2">
                <p className="gk-section-label flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" />
                  This week
                </p>
                <Link href="/calendar" className="inline-link text-xs font-medium text-primary py-1">
                  Calendar
                </Link>
              </div>
              <div className="gk-card divide-y divide-border/50">
                {weekItems.map((item) => {
                  const meta = kindMeta(item.kind);
                  const [y, m, d] = item.date.split("-").map(Number);
                  const day = new Date(y, m - 1, d).toLocaleDateString("en-US", {
                    weekday: "short",
                    day: "numeric",
                  });
                  const inner = (
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <span className={cn("w-2 h-2 rounded-full shrink-0", meta.dot)} />
                      <span className="text-xs text-muted-foreground w-16 shrink-0">{day}</span>
                      <span className="text-sm flex-1 min-w-0 truncate">{item.title}</span>
                      {item.time && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {item.time.slice(0, 5)}
                        </span>
                      )}
                    </div>
                  );
                  return item.href ? (
                    <Link
                      key={`${item.source}-${item.sourceId}`}
                      href={item.href}
                      className="block hover:bg-muted/40 transition-colors"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={`${item.source}-${item.sourceId}`}>{inner}</div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Workspace doors */}
          <section className="mb-6 gk-animate-in gk-animate-in-6">
            <p className="gk-section-label mb-2">Workspaces</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {WORKSPACES.map((w) => (
                <Link
                  key={w.href}
                  href={w.href}
                  className="flex flex-col items-center gap-2 p-3.5 rounded-2xl bg-card border border-border hover:border-primary/30 active:scale-95 transition-all"
                >
                  <div
                    className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${w.color} flex items-center justify-center text-white shadow-sm`}
                  >
                    <w.icon className="w-5 h-5" />
                  </div>
                  <span className="text-[12px] font-medium text-center leading-tight">
                    {w.label}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* Everything scheduled (quiet, collapsible) */}
          {scheduled.length > 0 && (
            <section className="gk-animate-in gk-animate-in-7">
              <button
                onClick={() => setShowScheduled((v) => !v)}
                className="flex items-center gap-1.5 gk-section-label mb-2"
              >
                <ChevronDown
                  className={cn("w-3.5 h-3.5 transition-transform", !showScheduled && "-rotate-90")}
                />
                All scheduled obligations ({scheduled.length})
              </button>
              {showScheduled && (
                <div className="space-y-2">
                  {scheduled.map((e) => (
                    <ObligationRow
                      key={e.obligation.id}
                      item={e}
                      onComplete={() => ops.completeObligation(e)}
                      onUndo={() => ops.uncompleteObligation(e.obligation.id, e.period)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {ops.error && <p className="mt-4 text-sm text-destructive">{ops.error}</p>}
        </>
      )}
    </div>
  );
}
