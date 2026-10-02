"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, ClipboardCheck, FileArchive, Loader2, Play, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADMIN_ROLES, MANAGEMENT_ROLES, RoleGuard, useRoleAccess } from "@/components/auth/role-guard";
import { getInitials, roleLabels } from "@/lib/hooks/useProfiles";
import { useAuth } from "@/lib/hooks/useAuth";
import { directSelectList, getCachedUserId } from "@/lib/supabase/rest";
import { saveBlobToDevice } from "@/lib/utils/download-blob";
import { todayLocal } from "@/lib/utils/date";
import { payPlanGrade } from "@/lib/evaluations/facts";
import { fiscalYearOf, periodChoices, periodDisplay, periodFromFyParam } from "@/lib/evaluations/period";
import JSZip from "jszip";
import {
  combinedEvaluationsPdfBlob,
  evaluationFilename,
  evaluationPdfBlob,
  type EvaluationPrintData,
} from "@/lib/evaluations/pdf";
import { useEvaluationRoster } from "@/lib/evaluations/use-evaluations";
import { PROGRESS_COLORS, PROGRESS_LABELS } from "@/lib/evaluations/types";
import type { StaffPersonnelPrivate } from "@/types/database";

function EvaluationsRoster() {
  const router = useRouter();
  const params = useSearchParams();
  const period = periodFromFyParam(params.get("fy"), todayLocal());
  const fy = fiscalYearOf(period.end);
  const { hasRole } = useRoleAccess();
  const { profile: me } = useAuth();
  const viewer = useMemo(
    () => ({ id: me?.id ?? getCachedUserId(), isManager: hasRole(ADMIN_ROLES) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me?.id, me?.role],
  );
  const { entries, loading, error } = useEvaluationRoster(period, viewer);
  const [printing, setPrinting] = useState<null | "print" | "zip">(null);
  const [printError, setPrintError] = useState<string | null>(null);

  const finals = entries.filter((e) => e.progress === "final");
  const next = entries.find((e) => e.progress !== "final");
  const editHref = (employeeId: string) => `/staff/evaluations/edit?employee=${employeeId}&fy=${fy}`;

  /** Everything needed to fill each finished evaluation's form. */
  async function finishedPrintData(): Promise<EvaluationPrintData[]> {
    const ids = finals.map((f) => f.profile.id);
    const personnel = await directSelectList<
      Pick<StaffPersonnelPrivate, "employee_id" | "hire_date" | "certifications" | "personnel_details">
    >("staff_personnel_private", {
      columns: "employee_id,hire_date,certifications,personnel_details",
      filters: [`employee_id=in.(${ids.join(",")})`],
      label: "evaluations.print_all.personnel",
    }).catch(() => []);
    const byId = new Map(personnel.map((p) => [p.employee_id, p]));
    return finals.map((f) => {
      const pd = byId.get(f.profile.id)?.personnel_details ?? null;
      return {
        evaluation: f.evaluation!,
        employeeName: f.profile.full_name || "Employee",
        nameParts: pd ? { last: pd.name_last, first: pd.name_first, middle: pd.name_middle } : null,
        positionTitle: pd?.position_title?.trim() || roleLabels[f.profile.role],
        payPlanGrade: payPlanGrade(pd),
        hireDate: byId.get(f.profile.id)?.hire_date ?? null,
        workSchedule: pd?.work_schedule ?? null,
      };
    });
  }

  /** One PDF with everyone, ready to print. */
  async function printAllFinal() {
    if (finals.length === 0) return;
    setPrinting("print");
    setPrintError(null);
    try {
      await saveBlobToDevice({
        blob: await combinedEvaluationsPdfBlob(await finishedPrintData()),
        filename: evaluationFilename(period.label),
        shareTitle: `${period.label} evaluations`,
      });
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : "Couldn't build the PDF.");
    } finally {
      setPrinting(null);
    }
  }

  /** A .zip of each person's editable form (for SSN and CAC signatures). */
  async function downloadAllZip() {
    if (finals.length === 0) return;
    setPrinting("zip");
    setPrintError(null);
    try {
      const zip = new JSZip();
      for (const item of await finishedPrintData()) {
        zip.file(evaluationFilename(period.label, item.employeeName), await evaluationPdfBlob(item));
      }
      await saveBlobToDevice({
        blob: await zip.generateAsync({ type: "blob" }),
        filename: evaluationFilename(period.label).replace(/\.pdf$/, ".zip"),
        shareTitle: `${period.label} evaluations`,
      });
    } catch (e) {
      setPrintError(e instanceof Error ? e.message : "Couldn't build the zip.");
    } finally {
      setPrinting(null);
    }
  }

  const doneCount = finals.length;
  const total = entries.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="p-4 md:p-6 pb-24 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-[#1B4332] dark:text-emerald-400" />
          Yearly Evaluations
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Answer a few questions per person. The app writes the paperwork.
        </p>
      </div>

      <label className="block mb-4">
        <span className="text-xs font-semibold text-muted-foreground">Rating period</span>
        <select
          className="mt-1 w-full px-3 py-2.5 rounded-lg border border-input bg-background text-base"
          value={fy}
          onChange={(e) => router.replace(`/staff/evaluations?fy=${e.target.value}`)}
        >
          {periodChoices(todayLocal()).map((p) => (
            <option key={p.label} value={fiscalYearOf(p.end)}>
              {periodDisplay(p)}
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-muted/60 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          {error}
        </div>
      ) : total === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground border border-border rounded-lg">
          No employees to evaluate. Active staff (or your direct reports) show up here.
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card p-4 mb-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="font-medium">
                {doneCount} of {total} finished
              </span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              {next ? (
                <Link href={editHref(next.profile.id)} className="flex-1">
                  <Button className="w-full gap-2 bg-[#1B4332] hover:bg-[#1B4332]/90 text-white">
                    <Play className="w-4 h-4" />
                    {next.progress === "not_started" ? "Start next" : "Continue"}: {next.profile.full_name || "Employee"}
                  </Button>
                </Link>
              ) : (
                <p className="flex-1 text-sm text-emerald-700 dark:text-emerald-400 font-medium self-center">
                  Everyone is done for {period.label}.
                </p>
              )}
              <Button
                variant="outline"
                className="gap-2"
                disabled={finals.length === 0 || printing !== null}
                onClick={printAllFinal}
              >
                {printing === "print" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                Print all finished ({finals.length})
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                disabled={finals.length === 0 || printing !== null}
                onClick={downloadAllZip}
              >
                {printing === "zip" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
                Editable copies (.zip)
              </Button>
            </div>
            {printError && <p className="text-sm text-destructive mt-2">{printError}</p>}
          </div>

          <div className="space-y-2">
            {entries.map(({ profile, progress }) => (
              <Link
                key={profile.id}
                href={editHref(profile.id)}
                className="flex items-center gap-4 p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="w-11 h-11 rounded-full bg-[#1B4332]/10 text-[#1B4332] dark:bg-emerald-400/10 dark:text-emerald-400 flex items-center justify-center font-semibold shrink-0">
                  {getInitials(profile.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{profile.full_name || "Employee"}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{roleLabels[profile.role]}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${PROGRESS_COLORS[progress]}`}>
                  {PROGRESS_LABELS[progress]}
                </span>
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function EvaluationsPage() {
  return (
    <RoleGuard allowedRoles={MANAGEMENT_ROLES}>
      <Suspense fallback={null}>
        <EvaluationsRoster />
      </Suspense>
    </RoleGuard>
  );
}
