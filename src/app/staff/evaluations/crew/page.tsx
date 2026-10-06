"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_ROLES, MANAGEMENT_ROLES, RoleGuard, useRoleAccess, withFbManager } from "@/components/auth/role-guard";
import { roleLabels } from "@/lib/hooks/useProfiles";
import { useAuth } from "@/lib/hooks/useAuth";
import { getCachedUserId } from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";
import { crewSteps, unratedCount } from "@/lib/evaluations/crew";
import {
  RATING_BUTTON_COLORS,
  RATING_LABELS,
  RATING_SHORT_LABELS,
  UNSATISFACTORY_NOTE,
} from "@/lib/evaluations/form";
import { fiscalYearOf, periodFromFyParam } from "@/lib/evaluations/period";
import { useCrewRatings, type CrewSaveState } from "@/lib/evaluations/use-evaluations";
import { isRatingValue, type RatingValue } from "@/lib/evaluations/types";

/** Ratings shown low → high, left → right (same as the per-person screen). */
const SCALE: RatingValue[] = [1, 2, 3, 4, 5];

function CrewRating() {
  const router = useRouter();
  const params = useSearchParams();
  const period = periodFromFyParam(params.get("fy"), todayLocal());
  const fy = fiscalYearOf(period.end);
  const { hasRole } = useRoleAccess();
  const isManager = hasRole(ADMIN_ROLES);
  const { profile: me } = useAuth();
  const viewer = useMemo(
    () => ({ id: me?.id ?? getCachedUserId(), isManager, isFbManager: me?.role === "fb_manager" }),
    [me?.id, me?.role, isManager],
  );
  const { loading, error, people, finalCount, saveState, rate, setSupervisory } = useCrewRatings(period, viewer);
  const [stepIndex, setStepIndex] = useState(0);

  const anySupervisors = people.some((p) => p.member.supervisory);
  const steps = crewSteps(anySupervisors);
  const index = Math.min(stepIndex, steps.length - 1);
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const back = `/staff/evaluations?fy=${fy}`;

  function go(next: number) {
    setStepIndex(next);
    if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading the crew…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">{error}</div>
        <Link href={back} className="inline-block mt-4 text-sm underline">
          Back to evaluations
        </Link>
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <p className="text-sm text-muted-foreground">
          {finalCount > 0 ? `Everyone's evaluation for ${period.label} is already final.` : "No employees to rate."}
        </p>
        <Link href={back} className="text-sm underline">
          Back to evaluations
        </Link>
      </div>
    );
  }

  const element = step.kind === "element" ? step.element : null;
  const rows = element ? people.filter((p) => !element.supervisoryOnly || p.member.supervisory) : people;
  const remaining = element ? unratedCount(element, people) : 0;
  const anyUnsat = element ? rows.some((p) => p.member.ratings[element.key] === 1) : false;

  return (
    <div className="p-4 md:p-6 pb-28 max-w-2xl mx-auto">
      <Link href={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3">
        <ArrowLeft className="w-4 h-4" /> All evaluations
      </Link>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Users className="w-6 h-6 text-[#1B4332] dark:text-emerald-400" />
        Rate the crew
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {period.label} · one item at a time, everyone side by side. Saves as you tap.
      </p>

      <div className="mt-4 mb-4">
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>
            Step {index + 1} of {steps.length}
          </span>
          {finalCount > 0 && <span>{finalCount} already final (not shown)</span>}
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-emerald-600 transition-all" style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      {step.kind === "supervisors" ? (
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Who supervises other people?</h2>
            <p className="text-sm text-muted-foreground">
              They also get rated on f–h (Leadership, Management/Coaching/EEO, Internal Controls). Already
              checked for supervisor roles and anyone with direct reports.
            </p>
          </div>
          {people.map(({ profile, member }) => (
            <label
              key={profile.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
            >
              <input
                type="checkbox"
                className="h-5 w-5 accent-emerald-700"
                checked={member.supervisory}
                onChange={(e) => setSupervisory(profile.id, e.target.checked)}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium truncate">{profile.full_name || "Employee"}</span>
                <span className="block text-xs text-muted-foreground">{roleLabels[profile.role]}</span>
              </span>
              <SaveDot state={saveState[profile.id]} />
            </label>
          ))}
        </div>
      ) : (
        element && (
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">
                {element.letter}. {element.label}
              </h2>
              <p className="text-sm text-muted-foreground">{element.description}</p>
              {element.levels && (
                <details className="mt-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <summary className="cursor-pointer font-medium">What each rating means</summary>
                  <ul className="mt-2 space-y-1.5">
                    {[5, 4, 3, 2, 1].map((v) => (
                      <li key={v}>
                        <span className="font-medium">{RATING_LABELS[v as RatingValue]}:</span>{" "}
                        <span className="text-muted-foreground">{element.levels?.[v as RatingValue]}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <p className={`text-xs mt-2 ${remaining ? "text-amber-700 dark:text-amber-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                {remaining ? `${remaining} left to rate` : "Everyone rated"}
              </p>
            </div>

            {anyUnsat && (
              <div className="flex gap-2 rounded-lg border border-red-600/30 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-900 dark:text-red-100">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>{UNSATISFACTORY_NOTE}</p>
              </div>
            )}

            {rows.map(({ profile, member }) => {
              const current = member.ratings[element.key];
              return (
                <div key={profile.id} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate">{profile.full_name || "Employee"}</p>
                    <span className="flex items-center gap-2 shrink-0">
                      {isRatingValue(current) && (
                        <span className="text-xs text-muted-foreground">{RATING_LABELS[current]}</span>
                      )}
                      <SaveDot state={saveState[profile.id]} />
                    </span>
                  </div>
                  <div
                    className="grid grid-cols-5 gap-1.5 mt-2"
                    role="radiogroup"
                    aria-label={`${profile.full_name || "Employee"} — ${element.label}`}
                  >
                    {SCALE.map((v) => {
                      const selected = current === v;
                      return (
                        <button
                          key={v}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={`${v} ${RATING_LABELS[v]}`}
                          onClick={() => rate(profile.id, element.key, v)}
                          className={`rounded-md border px-1 py-1.5 text-center transition-colors ${
                            selected ? RATING_BUTTON_COLORS[v] : "border-input bg-background hover:bg-muted"
                          }`}
                        >
                          <span className="block text-sm font-bold leading-none">{v}</span>
                          <span className="block text-[10px] leading-tight mt-0.5">{RATING_SHORT_LABELS[v]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      <div className="sticky bottom-20 md:bottom-4 z-10 mt-4 flex gap-2 rounded-lg border border-border bg-background/95 backdrop-blur p-2 shadow-lg">
        {index > 0 && (
          <Button variant="outline" className="gap-2" onClick={() => go(index - 1)}>
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        )}
        {isLast ? (
          <Button
            className="flex-1 gap-2 bg-[#1B4332] hover:bg-[#1B4332]/90 text-white"
            onClick={() => router.push(`/staff/evaluations/edit?employee=${people[0].profile.id}&fy=${fy}`)}
          >
            Done rating — on to {people[0].profile.full_name || "the first person"}&apos;s questions{" "}
            <ArrowRight className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            className="flex-1 gap-2 bg-[#1B4332] hover:bg-[#1B4332]/90 text-white"
            onClick={() => go(index + 1)}
          >
            Next: {steps[index + 1].kind === "element" ? (steps[index + 1] as { element: { label: string } }).element.label : ""}
            <ArrowRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function SaveDot({ state }: { state: CrewSaveState | undefined }) {
  if (state === "saving") return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" aria-label="Saving" />;
  if (state === "saved") return <Check className="w-4 h-4 text-emerald-600" aria-label="Saved" />;
  if (state === "error") return <AlertTriangle className="w-4 h-4 text-destructive" aria-label="Not saved — tap again" />;
  return null;
}

export default function CrewRatingPage() {
  return (
    <RoleGuard allowedRoles={withFbManager(MANAGEMENT_ROLES)}>
      <Suspense fallback={null}>
        <CrewRating />
      </Suspense>
    </RoleGuard>
  );
}
