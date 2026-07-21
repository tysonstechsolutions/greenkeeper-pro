"use client";

import { Printer, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGEMENT_ROLES, RoleGuard } from "@/components/auth/role-guard";
import {
  WEEKLY_SPECIALS,
  buildSpecialFlyerHtml,
  type DailySpecial,
} from "@/lib/marketing/daily-specials";

function printFlyer(special: DailySpecial) {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(buildSpecialFlyerHtml(special));
  win.document.close();
  win.focus();
  win.print();
}

function SpecialsBoard() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-4">
      <PageHeader
        title="Daily specials"
        description="A week of traffic-driving specials for the restaurant — the theme, who it's for, why that day, and a flyer you can print. Starting ideas based on golf-course and day-of-week patterns; adjust to your own sales."
      />

      <div className="space-y-3">
        {WEEKLY_SPECIALS.map((special) => (
          <article key={special.day} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">{special.day}</span>
                  {special.proven && (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Proven at your course</span>
                  )}
                </div>
                <h2 className="mt-0.5 text-lg font-bold">{special.theme}</h2>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{special.tagline}</p>
              </div>
              <Button variant="outline" className="shrink-0 gap-1.5" onClick={() => printFlyer(special)}>
                <Printer className="h-4 w-4" /> Print flyer
              </Button>
            </div>

            <p className="mt-2 text-sm">{special.description}</p>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Users className="h-3.5 w-3.5" />Who it&apos;s for</p>
                <p className="mt-0.5 text-sm">{special.audience}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Sparkles className="h-3.5 w-3.5" />Why this day</p>
                <p className="mt-0.5 text-sm">{special.rationale}</p>
              </div>
            </div>

            {special.alternatives.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-semibold">Other ideas:</span> {special.alternatives.join(" · ")}
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

export default function MarketingPage() {
  return (
    <RoleGuard allowedRoles={MANAGEMENT_ROLES}>
      <SpecialsBoard />
    </RoleGuard>
  );
}
