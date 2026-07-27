"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { prioritisedGaps } from "@/lib/equipment/gap-analysis";
import {
  FLEET_STANDARD_CODE,
  FLEET_STANDARD_TITLE,
} from "@/lib/equipment/fleet-standard";
import {
  calculateStaffing,
  DEFAULT_STAFFING_ASSUMPTIONS,
  staffingGap,
  type StaffingAssumptions,
} from "@/lib/equipment/staffing-model";
import { useFleetReadiness } from "@/lib/equipment/use-fleet-readiness";

const usd = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * Fleet readiness — "what do we need, what works, what does it cost".
 *
 * The requirement side is quoted from the course's own Program Standard
 * 4.1.15 rather than invented, and the money is summed from recorded DPAS
 * values. The staffing figure is a transparent planning model whose every
 * assumption is on screen and editable.
 */
export default function FleetReadinessPage() {
  const { analysis, loading, error, reload } = useFleetReadiness();
  const [crew, setCrew] = useState(3);
  const [assumptions, setAssumptions] = useState<StaffingAssumptions>(DEFAULT_STAFFING_ASSUMPTIONS);

  const staffing = useMemo(() => calculateStaffing(assumptions), [assumptions]);
  const gap = useMemo(() => staffingGap(staffing, crew), [staffing, crew]);
  const gaps = useMemo(() => (analysis ? prioritisedGaps(analysis) : []), [analysis]);

  const setSurface = (key: string, field: "acres" | "passesPerWeek" | "acresPerHour", value: number) =>
    setAssumptions((prior) => ({
      ...prior,
      surfaces: prior.surfaces.map((s) => (s.key === key ? { ...s, [field]: value } : s)),
    }));

  return (
    <div className="mx-auto w-full max-w-[1200px] px-3 pb-28 pt-4 sm:px-5 md:pb-8">
      <Link href="/equipment" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ArrowLeft className="h-4 w-4" />Equipment
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Fleet readiness &amp; staffing"
          description="What an 18-hole course needs, what is actually working today, and what it costs to put right."
        />
        <div className="flex gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}>Print</Button>
          <Button variant="outline" size="icon" aria-label="Refresh" onClick={reload}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {loading && !analysis ? (
        <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Reading the equipment register…
        </div>
      ) : !analysis ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No equipment is recorded yet.
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Requirement met" value={`${analysis.metClasses}/${analysis.rows.length}`} tone={analysis.metClasses === analysis.rows.length ? "good" : "danger"} hint="equipment classes" />
            <Metric label="Machines short" value={String(analysis.shortTotal)} tone={analysis.shortTotal > 0 ? "danger" : "good"} hint={`of ${analysis.requiredTotal} required`} />
            <Metric label="Down fleet value" value={usd(analysis.downFleetValue)} tone="warning" hint="tied up in machines not working" />
            <Metric label="Annual capital target" value={usd(analysis.annualReplacementTarget)} hint="Standard 4.2.2 — 20% of register" />
          </div>

          {analysis.carts.meetsStandard === false && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>
                <span className="font-semibold">Cart fleet is {analysis.carts.downPercent}% down</span>{" "}
                ({analysis.carts.down} of {analysis.carts.total}). Standard 2.3.7 allows no more than 5%.
              </span>
            </div>
          )}

          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide">Fleet against the standard</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Minimums quoted from Program Standard {FLEET_STANDARD_CODE}, &ldquo;{FLEET_STANDARD_TITLE}&rdquo;.
              A machine counts only when its status is operational — one sitting out of service
              does not maintain a golf course.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Equipment</th>
                    <th className="py-2 pr-3 text-right font-semibold">Need</th>
                    <th className="py-2 pr-3 text-right font-semibold">Working</th>
                    <th className="py-2 pr-3 text-right font-semibold">Down</th>
                    <th className="py-2 pr-3 text-right font-semibold">Short</th>
                    <th className="py-2 font-semibold">Why it matters</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.rows.map((row) => (
                    <tr key={row.fleetClass} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3 font-medium">
                        {row.label}
                        {row.totalOutage && (
                          <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700 dark:text-red-300">
                            nothing working
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.required}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{row.operational}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{row.down || ""}</td>
                      <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${row.short > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {row.short > 0 ? row.short : "—"}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">{row.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {gaps.length > 0 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wide">What to fix first</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Classes with nothing working at all come first — those stop a job from happening
                rather than just slowing it down.
              </p>
              <ol className="mt-3 space-y-2">
                {gaps.map((row, index) => (
                  <li key={row.fleetClass} className="flex gap-3 rounded-xl border border-border bg-card p-3">
                    <span className="text-sm font-bold text-muted-foreground">{index + 1}</span>
                    <span className="text-sm">
                      <span className="font-semibold">
                        {row.short} more {row.label.toLowerCase()}
                      </span>
                      {row.totalOutage
                        ? <> — nothing in this class is working. {row.purpose}</>
                        : <> — {row.operational} working against a minimum of {row.required}. {row.purpose}</>}
                      {row.down > 0 && (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {row.down} unit{row.down === 1 ? "" : "s"} already on the register but down
                          {row.downValue !== null ? ` · ${usd(row.downValue)} of recorded value` : ""}.
                          Repairing before buying is usually the cheaper route — Standard 4.2.4 expects
                          inoperative equipment back within 2 business days.
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide">How many maintenance staff</h2>
            <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
              <p>
                <span className="font-semibold">This is a planning model, not a regulation.</span>{" "}
                No Navy or federal instruction sets a crew size for a golf course. Standard {FLEET_STANDARD_CODE} does
                say equipment levels depend on &ldquo;size of staff, number of holes to be maintained,
                acreage to be maintained&rdquo; — this is that calculation, with every assumption shown.
                Change any number and the answer moves.
              </p>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Surface</th>
                    <th className="py-2 pr-3 font-semibold">Acres</th>
                    <th className="py-2 pr-3 font-semibold">Cuts / week</th>
                    <th className="py-2 pr-3 font-semibold">Acres / hour</th>
                    <th className="py-2 pr-3 text-right font-semibold">Hours / week</th>
                  </tr>
                </thead>
                <tbody>
                  {staffing.surfaces.map((surface) => (
                    <tr key={surface.key} className="border-b border-border/60">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{surface.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{surface.basis}</span>
                      </td>
                      <td className="py-2 pr-3"><NumberCell value={surface.acres} onChange={(v) => setSurface(surface.key, "acres", v)} /></td>
                      <td className="py-2 pr-3"><NumberCell value={surface.passesPerWeek} onChange={(v) => setSurface(surface.key, "passesPerWeek", v)} /></td>
                      <td className="py-2 pr-3"><NumberCell value={surface.acresPerHour} step={0.1} onChange={(v) => setSurface(surface.key, "acresPerHour", v)} /></td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{surface.hoursPerWeek}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <LabelledNumber label="Non-mowing hours / week" hint="Bunkers, cups, setup, irrigation, spraying, projects, shop"
                value={assumptions.nonMowingHoursPerWeek}
                onChange={(v) => setAssumptions((p) => ({ ...p, nonMowingHoursPerWeek: v }))} />
              <LabelledNumber label="Paid hours / person / week" value={assumptions.hoursPerPersonPerWeek}
                onChange={(v) => setAssumptions((p) => ({ ...p, hoursPerPersonPerWeek: v }))} />
              <LabelledNumber label="Productive fraction" step={0.05} hint="After breaks, travel, fuelling, weather"
                value={assumptions.productiveFraction}
                onChange={(v) => setAssumptions((p) => ({ ...p, productiveFraction: v }))} />
              <LabelledNumber label="Crew you have now" value={crew} onChange={setCrew} />
            </div>

            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <p className="text-sm">
                {staffing.mowingHoursPerWeek} mowing hours + {assumptions.nonMowingHoursPerWeek} other hours
                = <span className="font-semibold">{staffing.totalHoursPerWeek} hours a week</span>.
                At {staffing.productiveHoursPerPerson} productive hours per person, that needs{" "}
                <span className="font-semibold">{staffing.requiredFte} full-time equivalents</span>.
              </p>
              <p className={`mt-2 text-sm font-semibold ${gap.shortfallFte > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                {gap.shortfallFte > 0
                  ? `You are ${gap.shortfallFte} FTE short — about ${gap.uncoveredHoursPerWeek} hours a week nobody is available to cover.`
                  : `Your ${crew}-person crew covers the modelled workload.`}
              </p>
              {staffing.unallocatedAcres > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {staffing.unallocatedAcres} of the {assumptions.totalAcres} acres are not in the surface
                  list above (clubhouse grounds, water, native areas, car park). They carry no mowing
                  hours in this model.
                </p>
              )}
              {staffing.unallocatedAcres < 0 && (
                <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                  The surfaces above add up to {Math.abs(staffing.unallocatedAcres)} acres more than the
                  {" "}{assumptions.totalAcres} you have. Check the acreages — the crew figure is too high
                  until they add up.
                </p>
              )}
            </div>
          </section>

          {analysis.unclassified.length > 0 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wide">Needs your eye</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                These units are on the register but their recorded name does not say what they are, so
                they count toward nothing above. A bare &ldquo;tractor&rdquo; could be the prime mover for
                the spreader or the bunker rake — naming it would change the numbers.
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {analysis.unclassified.map((unit) => (
                  <li key={unit.id} className="rounded-full border border-border bg-card px-3 py-1 text-xs">
                    {unit.name} <span className="text-muted-foreground">({unit.status?.replaceAll("_", " ")})</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-muted-foreground">
            Register value covers the {analysis.units.length} units in the equipment register that are
            linked to a DPAS asset record. Figures are summed from recorded values only — nothing is
            estimated, and {analysis.downUnitsMissingValue > 0
              ? `${analysis.downUnitsMissingValue} down unit(s) carry no recorded value, so the down-fleet figure is a floor.`
              : "every down unit carries a recorded value."}
          </p>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, hint, tone = "default" }: {
  label: string; value: string; hint?: string; tone?: "default" | "good" | "warning" | "danger";
}) {
  const border = tone === "danger" ? "border-red-500/30 bg-red-500/5"
    : tone === "warning" ? "border-amber-500/30 bg-amber-500/5"
    : tone === "good" ? "border-emerald-500/30 bg-emerald-500/5"
    : "border-border bg-card";
  return (
    <div className={`rounded-xl border p-3 ${border}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function NumberCell({ value, onChange, step = 1 }: { value: number; onChange: (value: number) => void; step?: number }) {
  return (
    <Input type="number" step={step} min={0} value={value} className="h-8 w-20"
      onChange={(event) => onChange(Number(event.target.value) || 0)} />
  );
}

function LabelledNumber({ label, value, onChange, step = 1, hint }: {
  label: string; value: number; onChange: (value: number) => void; step?: number; hint?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      <Input type="number" step={step} min={0} value={value} className="h-9"
        onChange={(event) => onChange(Number(event.target.value) || 0)} />
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
