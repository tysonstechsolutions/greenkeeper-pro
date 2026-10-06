"use client";

// "Don't let it slip" reminders on Today: evaluations, follow-through, new
// hires reaching 90 days, expiring certifications and 889s, and last days.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BellRing, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { directSelectList } from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";
import { defaultPeriod, fiscalYearOf } from "@/lib/evaluations/period";
import { useEvaluationRoster, type EvaluationViewer } from "@/lib/evaluations/use-evaluations";
import { isFbStaff } from "@/lib/auth/fb-manager";
import { buildReminders, type Reminder, type ReminderInput } from "@/lib/reminders/reminders";
import type { StaffPersonnelPrivate } from "@/types/database";

/** Who gets the card: the GM and course managers, and the F&B Manager for her staff. */
const REMINDER_ROLES = new Set(["super", "asst_super", "director", "gm", "fb_manager"]);

/** Show this many before "Show all". */
const COLLAPSED_COUNT = 5;

type Extras = Pick<ReminderInput, "people" | "certifications" | "vendors">;

async function loadExtras(isFb: boolean): Promise<Extras> {
  const [profiles, personnel, certifications, vendors] = await Promise.all([
    directSelectList<{ id: string; full_name: string | null; department: string | null; is_active: boolean | null }>(
      "profiles",
      { columns: "id,full_name,department,is_active", filters: ["is_active=eq.true"], label: "reminders.profiles" },
    ).catch(() => []),
    directSelectList<Pick<StaffPersonnelPrivate, "employee_id" | "hire_date" | "personnel_details">>(
      "staff_personnel_private",
      { columns: "employee_id,hire_date,personnel_details", label: "reminders.personnel" },
    ).catch(() => []),
    directSelectList<ReminderInput["certifications"][number]>("certifications", {
      columns: "id,holder,profile_id,cert_name,expires_date",
      filters: ["is_active=eq.true", "expires_date=not.is.null"],
      label: "reminders.certifications",
    }).catch(() => []),
    isFb
      ? Promise.resolve(null)
      : directSelectList<NonNullable<ReminderInput["vendors"]>[number]>("vendors", {
          columns: "id,name,section_889_path,section_889_expiration_date",
          filters: ["merged_into_id=is.null", "section_889_expiration_date=not.is.null"],
          label: "reminders.vendors",
        }).catch(() => null),
  ]);
  const byId = new Map(personnel.map((p) => [p.employee_id, p]));
  const people = profiles
    .filter((p) => !isFb || isFbStaff(p))
    .map((p) => {
      const priv = byId.get(p.id);
      const sep = priv?.personnel_details?.separation_date;
      return {
        id: p.id,
        name: p.full_name || "Employee",
        hireDate: priv?.hire_date ?? null,
        separationDate: typeof sep === "string" && sep ? sep : null,
      };
    });
  return { people, certifications, vendors };
}

export function RemindersCard() {
  const { profile, user } = useAuth();
  const role = profile?.role ?? "";
  if (!REMINDER_ROLES.has(role)) return null;
  return <RemindersInner isFb={role === "fb_manager"} isManager={role !== "fb_manager"} viewerId={user?.id ?? profile?.id ?? null} />;
}

function RemindersInner({ isFb, isManager, viewerId }: { isFb: boolean; isManager: boolean; viewerId: string | null }) {
  const today = todayLocal();
  const period = useMemo(() => defaultPeriod(today), [today]);
  const viewer: EvaluationViewer = useMemo(
    () => ({ id: viewerId, isManager, isFbManager: isFb }),
    [viewerId, isManager, isFb],
  );
  const roster = useEvaluationRoster(period, viewer);
  const [extras, setExtras] = useState<Extras | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    loadExtras(isFb).then((x) => {
      if (alive) setExtras(x);
    });
    return () => {
      alive = false;
    };
  }, [isFb]);

  const reminders: Reminder[] = useMemo(() => {
    if (!extras || roster.loading) return [];
    return buildReminders({
      todayIso: today,
      yearEnd: roster.entries,
      ninetyDay: roster.ninetyDay,
      fiscalYear: fiscalYearOf(period.end),
      ...extras,
    });
  }, [extras, roster.loading, roster.entries, roster.ninetyDay, today, period.end]);

  if (!extras || roster.loading || reminders.length === 0) return null;
  const overdue = reminders.filter((r) => r.tone === "overdue").length;
  const shown = showAll ? reminders : reminders.slice(0, COLLAPSED_COUNT);

  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-3 sm:p-4" aria-label="Reminders">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <BellRing className="h-4 w-4 text-amber-600" />
        Don&apos;t let these slip
        <span className="text-xs font-normal text-muted-foreground">
          {reminders.length} reminder{reminders.length === 1 ? "" : "s"}
          {overdue ? ` · ${overdue} overdue` : ""}
        </span>
      </h2>
      <ul className="mt-2 divide-y divide-border/50">
        {shown.map((r) => (
          <li key={r.key}>
            <Link href={r.href} className="flex items-start gap-2 py-2 text-sm hover:bg-muted/40 rounded">
              {r.tone === "overdue" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-label="Overdue" />
              ) : (
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-label="Coming up" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{r.title}</span>
                <span className={`block text-xs ${r.tone === "overdue" ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}>
                  {r.detail}
                </span>
              </span>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      {reminders.length > COLLAPSED_COUNT && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 flex items-center gap-1 text-xs font-medium text-primary"
        >
          {showAll ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {showAll ? "Show fewer" : `Show all ${reminders.length}`}
        </button>
      )}
    </section>
  );
}
