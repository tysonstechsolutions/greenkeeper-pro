"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  Loader2,
  RefreshCw,
  Save,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  BriefingAvailability,
  BriefingData,
  BriefingFact,
  BriefingFinding,
  BriefingPeriodKind,
  ComplianceItem,
  CountByLabel,
  MoneyCategoryAmount,
  MoneyMonthAmount,
  PeriodComparison,
  ProcurementItem,
} from "@/lib/briefing/types";
import { PR_COMMITTED_ORDERED_SPEND_LABEL } from "@/lib/briefing/types";
import { cn } from "@/lib/utils";

export interface BriefingReviewSelection {
  kind: BriefingPeriodKind;
  anchor: string;
}

export interface LeadershipBriefingReviewProps {
  loadBriefing: (selection: BriefingReviewSelection) => Promise<BriefingData>;
  onExport: (briefing: BriefingData, approved: boolean) => Promise<void>;
  onSave: (briefing: BriefingData, approved: boolean) => Promise<void>;
  initialAnchor: string;
}

/**
 * Read-only Phase 2 view. Every displayed fact comes directly from
 * BriefingData; this component only formats recorded contract values.
 */
export function LeadershipBriefingReview({
  loadBriefing,
  onExport,
  onSave,
  initialAnchor,
}: LeadershipBriefingReviewProps) {
  const [kind, setKind] = useState<BriefingPeriodKind>("quarterly");
  const [anchor, setAnchor] = useState(initialAnchor);
  const [refresh, setRefresh] = useState(0);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotice(null);
    setApproved(false);
    loadBriefing({ kind, anchor })
      .then((data) => {
        if (!cancelled) setBriefing(data);
      })
      .catch((reason) => {
        if (cancelled) return;
        setBriefing(null);
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load the leadership briefing.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [anchor, kind, loadBriefing, refresh]);

  const handleExport = useCallback(async () => {
    if (!briefing || !approved) return;
    setExporting(true);
    setError(null);
    setNotice(null);
    try {
      await onExport(briefing, approved);
      setNotice("Approved PDF export is ready.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to export the approved PDF.",
      );
    } finally {
      setExporting(false);
    }
  }, [approved, briefing, onExport]);

  const handleSave = useCallback(async () => {
    if (!briefing || !approved) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await onSave(briefing, approved);
      setNotice("Approved PDF saved to Documents.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save the approved PDF.",
      );
    } finally {
      setSaving(false);
    }
  }, [approved, briefing, onSave]);

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-6 pb-24 md:pb-8">
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-primary">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold tracking-tight">GM Leadership Briefing</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Read-only, facts-only preview. Values are shown only when the deterministic
          briefing engine recorded them.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Reporting period</CardTitle>
          <CardDescription>
            Quarterly is the default. Changing the cadence or anchor refreshes the
            read-only briefing and clears prior approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="briefing-cadence">Cadence</Label>
            <select
              id="briefing-cadence"
              aria-label="Briefing cadence"
              value={kind}
              onChange={(event) => setKind(event.target.value as BriefingPeriodKind)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="quarterly">Quarterly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="briefing-anchor">Period anchor</Label>
            <Input
              id="briefing-anchor"
              aria-label="Briefing period anchor"
              type="date"
              value={anchor}
              max={initialAnchor}
              onChange={(event) => setAnchor(event.target.value)}
              className="w-[180px]"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => setRefresh((current) => current + 1)}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh preview
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/50" role="alert">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}
      {notice ? (
        <Card className="border-primary/30 bg-primary/5" role="status" aria-live="polite">
          <CardContent className="pt-6 text-sm text-primary">{notice}</CardContent>
        </Card>
      ) : null}

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center gap-2 py-16 text-muted-foreground"
        >
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading briefing preview…
        </div>
      ) : null}

      {briefing && !loading ? (
        <div aria-label="Briefing preview" className="space-y-6">
          <BriefingSummary briefing={briefing} />
          <AtAGlance briefing={briefing} />
          <ExecutiveOverview briefing={briefing} />
          <Financials briefing={briefing} />
          <Equipment briefing={briefing} />
          <CourseConditions briefing={briefing} />
          <Procurement briefing={briefing} />
          <Staffing briefing={briefing} />
          <Compliance briefing={briefing} />
          <WorkOrders briefing={briefing} />
          <AdditionalAvailability briefing={briefing} />
          <RisksAndAsks briefing={briefing} />
          <ApprovalActions
            briefing={briefing}
            approved={approved}
            exporting={exporting}
            saving={saving}
            onApprove={() => setApproved(true)}
            onExport={handleExport}
            onSave={handleSave}
          />
        </div>
      ) : null}
    </div>
  );
}

function BriefingSummary({ briefing }: { briefing: BriefingData }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <div>
          <p className="text-sm font-medium">{briefing.meta.period.label}</p>
          <p className="text-xs text-muted-foreground">
            {briefing.meta.period.start} to {briefing.meta.period.end} · Generated {formatDateTime(briefing.meta.generatedAt)}
          </p>
        </div>
        <Badge variant="outline">Facts-only</Badge>
      </CardContent>
    </Card>
  );
}

function AtAGlance({ briefing }: { briefing: BriefingData }) {
  const data = briefing.atAGlance.data;
  return (
    <section aria-labelledby="at-a-glance-heading" className="space-y-3">
      <div>
        <h2 id="at-a-glance-heading" className="text-xl font-bold">At a glance</h2>
        <p className="text-sm text-muted-foreground">Deterministic findings for the selected reporting period.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <FindingCard title="Improved" fact={data.improved} />
        <FindingCard title="Worsened" fact={data.worsened} />
        <FindingCard title="Overdue" fact={data.overdue} />
        <FindingCard title="Equipment down" fact={data.equipmentDown} />
        <FindingCard title={PR_COMMITTED_ORDERED_SPEND_LABEL} fact={data.prCommittedOrderedSpend} />
        <FindingCard title="Decisions needed" fact={data.decisionsNeeded} />
        <FindingCard title="Support needed" fact={data.supportNeeded} />
      </div>
    </section>
  );
}

function ExecutiveOverview({ briefing }: { briefing: BriefingData }) {
  return (
    <SectionCard title="Executive overview" description="Recorded headline facts only." section={briefing.executive}>
      <FactBlock fact={briefing.executive.data.headline} label="Executive status" render={(value) => <p>{value}</p>} />
    </SectionCard>
  );
}

function Financials({ briefing }: { briefing: BriefingData }) {
  const data = briefing.financial.data;
  return (
    <SectionCard title="Financials" description="Revenue and PR-derived commitments are reported from the engine contract." section={briefing.financial}>
      <div className="grid gap-4 md:grid-cols-2">
        <FactBlock fact={data.revenueTotal} label="Revenue total" render={money} />
        <FactBlock fact={data.prCommittedOrderedSpendTotal} label={data.prCommittedOrderedSpendTotal.label} render={money} />
        <FactBlock fact={data.periodBudgetTotal} label="Period budget" render={money} />
        <FactBlock
          fact={data.prSpendAgainstBudget}
          label={data.prSpendAgainstBudget.label}
          render={(value) => (
            <p>
              Budget {money(value.budget)} · {value.label} {money(value.prCommittedOrderedSpend)} · Remaining {money(value.remaining)} · Used {value.percentUsed === null ? "Unavailable" : `${value.percentUsed}%`}
            </p>
          )}
        />
        <FactBlock fact={data.revenuePeriodComparison} label="Revenue period comparison" render={comparisonText} />
        <FactBlock fact={data.revenueYearOverYear} label="Revenue year-over-year" render={comparisonText} />
        <FactBlock fact={data.prSpendPeriodComparison} label={`${data.prSpendPeriodComparison.label} period comparison`} render={comparisonText} />
        <FactBlock fact={data.prBudgetUtilizationComparison} label={`${data.prBudgetUtilizationComparison.label} comparison`} render={comparisonText} />
      </div>
      <FactBlock fact={data.revenueByCategory} label="Revenue by category" render={amountList} />
      <FactBlock fact={data.prSpendByCostCenter} label={`${data.prSpendByCostCenter.label} by cost center`} render={amountList} />
      <FactBlock fact={data.revenueTrend} label="Recorded revenue trend" render={monthAmountList} />
      <FactBlock
        fact={data.reconciliationVariances}
        label="Purchase-request reconciliation variances"
        render={(values) => <DetailList items={values.map((value) => `PR ${value.purchaseRequestId}: submitted ${money(value.submittedAmount)}; recorded receipt amount ${money(value.recordedReceiptAmount)}; variance ${money(value.dollarVariance)}${value.percentVariance === null ? "" : ` (${value.percentVariance}%)`}.`)} />}
      />
    </SectionCard>
  );
}

function Equipment({ briefing }: { briefing: BriefingData }) {
  const data = briefing.equipment.data;
  return (
    <SectionCard title="Equipment" description="Operational status remains the recorded source of truth." section={briefing.equipment}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FactBlock fact={data.total} label="Active equipment" render={String} />
        <FactBlock fact={data.operational} label="Operational" render={String} />
        <FactBlock fact={data.down} label="Equipment down" render={String} />
        <FactBlock fact={data.waitingParts} label="Waiting on parts" render={String} />
        <FactBlock fact={data.needsService} label="Needs service" render={String} />
        <FactBlock fact={data.downPeriodComparison} label="Equipment down period comparison" render={comparisonText} />
      </div>
      <FactBlock fact={data.pmNote} label="Safe PM status" render={(value) => <p>{value}</p>} />
      <FactBlock
        fact={data.attentionUnits}
        label="Equipment needing attention"
        render={(values) => <DetailList items={values.map((value) => `${value.name}: status ${value.status}; triage ${value.triageLabel}.`)} />}
      />
    </SectionCard>
  );
}

function CourseConditions({ briefing }: { briefing: BriefingData }) {
  const data = briefing.course.data;
  return (
    <SectionCard title="Course conditions" description="Issue counts are derived only from recorded hole observations." section={briefing.course}>
      <div className="grid gap-4 md:grid-cols-2">
        <FactBlock fact={data.openIssues} label="Open course issues" render={String} />
        <FactBlock fact={data.resolvedThisPeriod} label="Resolved this period" render={String} />
        <FactBlock fact={data.openIssuePeriodComparison} label="Open issue period comparison" render={comparisonText} />
      </div>
      <FactBlock fact={data.byCategory} label="Open issues by category" render={countList} />
      <FactBlock fact={data.byHole} label="Open issues by hole" render={countList} />
      <FactBlock
        fact={data.topPriority}
        label="Priority course issues"
        render={(values) => <DetailList items={values.map((value) => `Hole ${value.holeNumber}: ${value.title} (${value.priority}, ${value.issueType}).`)} />}
      />
    </SectionCard>
  );
}

function Procurement({ briefing }: { briefing: BriefingData }) {
  const data = briefing.procurement.data;
  return (
    <SectionCard title="Procurement" description="Purchase-request workflow and committed/ordered data only." section={briefing.procurement}>
      <div className="grid gap-4 md:grid-cols-2">
        <FactBlock fact={data.prCountByStatus} label="Purchase requests by status" render={countList} />
        <FactBlock fact={data.prCommittedOrderedSpend} label={data.prCommittedOrderedSpend.label} render={money} />
      </div>
      <FactBlock fact={data.openPRs} label="Open purchase requests" render={procurementList} />
      <FactBlock fact={data.awaitingApproval} label="Awaiting approval" render={procurementList} />
      <FactBlock
        fact={data.reconciliationVariances}
        label="Purchase-request reconciliation variances"
        render={(values) => <DetailList items={values.map((value) => `PR ${value.purchaseRequestId}: submitted ${money(value.submittedAmount)}; recorded receipt amount ${money(value.recordedReceiptAmount)}; variance ${money(value.dollarVariance)}${value.percentVariance === null ? "" : ` (${value.percentVariance}%)`}.`)} />}
      />
    </SectionCard>
  );
}

function Staffing({ briefing }: { briefing: BriefingData }) {
  const data = briefing.staffing.data;
  return (
    <SectionCard title="Staffing" description="Active headcount only; vacancy counts are never inferred." section={briefing.staffing}>
      <div className="grid gap-4 md:grid-cols-2">
        <FactBlock fact={data.activeHeadcount} label="Active headcount" render={String} />
        <FactBlock fact={data.byRole} label="Active headcount by role" render={countList} />
        <FactBlock fact={data.vacancies} label="Vacancies" render={String} />
        <FactBlock fact={data.trainingRecords} label="Training records" render={String} />
      </div>
      <FactBlock
        fact={data.certificationsExpiring}
        label="Expired or expiring certifications"
        render={(values) => <DetailList items={values.map((value) => `${value.holder}: ${value.certification} (${value.status}; ${value.daysUntil} days).`)} />}
      />
    </SectionCard>
  );
}

function Compliance({ briefing }: { briefing: BriefingData }) {
  const data = briefing.compliance.data;
  return (
    <SectionCard title="Compliance" description="Recorded obligations evaluated by the existing obligations engine." section={briefing.compliance}>
      <FactBlock fact={data.overdue} label="Overdue obligations" render={complianceList} />
      <FactBlock fact={data.dueSoon} label="Due soon obligations" render={complianceList} />
      <FactBlock fact={data.overduePeriodComparison} label="Overdue obligation comparison" render={comparisonText} />
    </SectionCard>
  );
}

function WorkOrders({ briefing }: { briefing: BriefingData }) {
  const data = briefing.workOrders.data;
  return (
    <SectionCard title="Work orders" description="Current work-order state with explicit historical availability." section={briefing.workOrders}>
      <div className="grid gap-4 md:grid-cols-2">
        <FactBlock fact={data.open} label="Open work orders" render={String} />
        <FactBlock fact={data.agedOpen} label="Aged open work orders" render={String} />
        <FactBlock fact={data.openPeriodComparison} label="Open work order period comparison" render={comparisonText} />
      </div>
      <FactBlock
        fact={data.agedOpenItems}
        label="Aged open work order details"
        render={(values) => <DetailList items={values.map((value) => `${value.submittedDate}: ${value.description}.`)} />}
      />
    </SectionCard>
  );
}

function AdditionalAvailability({ briefing }: { briefing: BriefingData }) {
  return (
    <SectionCard title="Additional data availability" description="These areas remain explicit when source rows are absent.">
      <div className="grid gap-4 md:grid-cols-3">
        <FactBlock fact={briefing.restaurant.data.recordCount} label="Restaurant records" render={String} />
        <FactBlock fact={briefing.proShop.data.recordCount} label="Pro shop inventory records" render={String} />
        <FactBlock fact={briefing.projects.data.recordCount} label="Capital project records" render={String} />
      </div>
    </SectionCard>
  );
}

function RisksAndAsks({ briefing }: { briefing: BriefingData }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="Risks" description="Composite risks built from recorded facts." section={briefing.risks}>
        <FactBlock fact={briefing.risks.data.items} label="Recorded risks" render={(values) => <FindingList findings={values} />} />
      </SectionCard>
      <SectionCard title="Decisions / support needed" description="Leadership items derived by the briefing engine." section={briefing.leadershipAsks}>
        <FactBlock fact={briefing.leadershipAsks.data.decisionsNeeded} label="Decisions needed" render={(values) => <FindingList findings={values} />} />
        <FactBlock fact={briefing.leadershipAsks.data.supportNeeded} label="Support needed" render={(values) => <FindingList findings={values} />} />
      </SectionCard>
    </div>
  );
}

function ApprovalActions({
  briefing,
  approved,
  exporting,
  saving,
  onApprove,
  onExport,
  onSave,
}: {
  briefing: BriefingData;
  approved: boolean;
  exporting: boolean;
  saving: boolean;
  onApprove: () => void;
  onExport: () => void;
  onSave: () => void;
}) {
  return (
    <Card className={cn("border-primary/30", approved && "bg-primary/5")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileCheck2 className="h-5 w-5" />
          Final PDF approval
        </CardTitle>
        <CardDescription>
          Preview is available now. Exporting or saving requires an explicit GM approval for this exact {briefing.meta.period.label} briefing.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        {approved ? (
          <Badge className="gap-1" variant="secondary">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approved for final PDF
          </Badge>
        ) : (
          <Button type="button" onClick={onApprove} className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Approve briefing for final PDF
          </Button>
        )}
        <Button type="button" variant="outline" className="gap-2" disabled={!approved || exporting} onClick={onExport}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export PDF
        </Button>
        <Button type="button" variant="outline" className="gap-2" disabled={!approved || saving} onClick={onSave}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save approved PDF
        </Button>
      </CardContent>
    </Card>
  );
}

function SectionCard({
  title,
  description,
  section,
  children,
}: {
  title: string;
  description: string;
  section?: { availabilityLabel: string; source: Array<{ label: string }> };
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
            {section ? <Badge variant="outline">{section.availabilityLabel}</Badge> : null}
          </div>
          {section ? (
            <p className="text-xs text-muted-foreground">
              Sources: {section.source.map((source) => source.label).join(", ")}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </section>
  );
}

function FindingCard({ title, fact }: { title: string; fact: BriefingFact<BriefingFinding[]> }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <FactDisplay fact={fact} render={(values) => <FindingList findings={values} compact />} />
      </CardContent>
    </Card>
  );
}

function FactBlock<T>({
  fact,
  label,
  render,
}: {
  fact: BriefingFact<T>;
  label: string;
  render: (value: T) => ReactNode;
}) {
  return (
    <div className="space-y-1.5 rounded-md border border-border/70 p-3">
      <p className="text-sm font-medium">{label}</p>
      <FactDisplay fact={fact} render={render} />
    </div>
  );
}

function FactDisplay<T>({
  fact,
  render,
}: {
  fact: BriefingFact<T>;
  render: (value: T) => ReactNode;
}) {
  if (fact.availability !== "recorded" || fact.value === null) {
    return <AvailabilityState availability={fact.availability} label={fact.availabilityLabel} note={fact.note} source={fact.source.map((item) => item.label)} />;
  }
  return (
    <div className="space-y-1 text-sm">
      {render(fact.value)}
      <p className="text-xs text-muted-foreground">Source: {fact.source.map((item) => item.label).join(", ")}</p>
    </div>
  );
}

function AvailabilityState({
  availability,
  label,
  note,
  source,
}: {
  availability: BriefingAvailability;
  label: string;
  note?: string;
  source: string[];
}) {
  return (
    <div className="space-y-1 text-sm">
      <Badge variant={availability === "not_recorded" ? "secondary" : "outline"}>{label}</Badge>
      {note ? <p className="text-muted-foreground">{note}</p> : null}
      <p className="text-xs text-muted-foreground">Source: {source.join(", ")}</p>
    </div>
  );
}

function FindingList({ findings, compact = false }: { findings: BriefingFinding[]; compact?: boolean }) {
  if (findings.length === 0) return <p className="text-sm text-muted-foreground">No recorded findings.</p>;
  return (
    <ul className={cn("space-y-2 text-sm", compact && "space-y-1.5")}>
      {findings.map((finding, index) => (
        <li key={`${finding.label}-${index}`}>
          <span className="font-medium">{finding.label}:</span> {finding.detail}
        </li>
      ))}
    </ul>
  );
}

function DetailList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No recorded items.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
    </ul>
  );
}

function money(value: number): ReactNode {
  return <p className="text-sm">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}</p>;
}

function comparisonText(value: PeriodComparison): ReactNode {
  const percentage = value.percentChange === null ? "Percentage change unavailable." : `${value.percentChange}% change.`;
  return <p>{value.currentPeriod}: {value.current}; {value.priorPeriod}: {value.prior}; {value.direction} by {value.absoluteChange}. {percentage}</p>;
}

function amountList(values: MoneyCategoryAmount[]): ReactNode {
  return <DetailList items={values.map((value) => `${value.category}: ${moneyText(value.amount)}`)} />;
}

function monthAmountList(values: MoneyMonthAmount[]): ReactNode {
  return <DetailList items={values.map((value) => `${value.month}: ${moneyText(value.amount)}`)} />;
}

function countList(values: CountByLabel[]): ReactNode {
  return <DetailList items={values.map((value) => `${value.label}: ${value.count}`)} />;
}

function procurementList(values: ProcurementItem[]): ReactNode {
  return <DetailList items={values.map((value) => `${value.id}: ${value.status}, prepared ${value.datePrepared}${value.submittedAmount === null ? "" : `, submitted ${moneyText(value.submittedAmount)}`}`)} />;
}

function complianceList(values: ComplianceItem[]): ReactNode {
  return <DetailList items={values.map((value) => `${value.title}: ${value.status}, due ${value.dueDate} (${value.daysUntil} days)`)} />;
}

function moneyText(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
