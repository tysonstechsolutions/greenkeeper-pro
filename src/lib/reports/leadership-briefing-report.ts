/**
 * GM Leadership Briefing PDF.
 *
 * The report accepts the deterministic BriefingData contract only. It never
 * fetches data, derives metrics, or substitutes missing values.
 */
import { jsPDF } from "jspdf";
import type {
  BriefingData,
  BriefingFact,
  BriefingFinding,
  CountByLabel,
  MoneyCategoryAmount,
  MoneyMonthAmount,
  PeriodComparison,
} from "@/lib/briefing/types";

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const TEXT: [number, number, number] = [55, 65, 81];
const MUTED: [number, number, number] = [100, 116, 139];

const MARGIN = 16;
const TOP = 38;
const BOTTOM = 18;
const BODY_LINE = 4.7;

export interface LeadershipBriefingPdf {
  blob: Blob;
  filename: string;
}

export function leadershipBriefingFilename(data: BriefingData): string {
  return `gm-leadership-briefing-${data.meta.period.key}.pdf`;
}

/** Render a facts-only PDF from an already-built deterministic briefing. */
export function generateLeadershipBriefingReport(
  data: BriefingData,
): LeadershipBriefingPdf {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  let y = TOP;

  const drawHeader = () => {
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pageWidth, 24, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, 24, pageWidth, 1.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("GM Leadership Briefing", MARGIN, 11);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(data.meta.courseName, MARGIN, 18);
    y = TOP;
  };

  const nextPage = () => {
    doc.addPage();
    drawHeader();
  };

  const ensureSpace = (height: number) => {
    if (y + height > pageHeight - BOTTOM) nextPage();
  };

  const writeLines = (
    text: string,
    options: { bold?: boolean; color?: [number, number, number]; size?: number } = {},
  ) => {
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    const lineHeight = options.size && options.size < 8 ? 3.8 : BODY_LINE;
    doc.setFont("helvetica", options.bold ? "bold" : "normal");
    doc.setFontSize(options.size ?? 8.5);
    doc.setTextColor(...(options.color ?? TEXT));
    let offset = 0;
    while (offset < lines.length) {
      // A single list/detail block may legitimately be longer than one page.
      // Write only the lines that fit, then continue on a fresh page instead
      // of relying on jsPDF to clip the remaining wrapped text.
      const availableLines = Math.floor((pageHeight - BOTTOM - y) / lineHeight);
      if (availableLines < 1) {
        nextPage();
        continue;
      }
      const batch = lines.slice(offset, offset + availableLines);
      doc.text(batch, MARGIN, y);
      y += batch.length * lineHeight;
      offset += batch.length;
      if (offset < lines.length) nextPage();
    }
    y += 2;
  };

  const writeSection = (title: string, sourceLabels?: string[]) => {
    ensureSpace(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND_DARK);
    doc.text(title, MARGIN, y);
    y += 3;
    doc.setDrawColor(...BRAND_GOLD);
    doc.setLineWidth(0.45);
    doc.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 5;
    if (sourceLabels && sourceLabels.length > 0) {
      writeLines(`Sources: ${sourceLabels.join(", ")}`, { color: MUTED, size: 7.2 });
    }
  };

  drawHeader();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND_DARK);
  doc.text(data.meta.period.label, MARGIN, y);
  y += 7;
  writeLines(
    `Reporting period: ${data.meta.period.start} to ${data.meta.period.end}. Generated: ${formatGeneratedAt(data.meta.generatedAt)}.`,
    { color: MUTED },
  );
  writeLines("Facts-only report. Values are displayed only when recorded by the briefing engine.", {
    color: MUTED,
    size: 7.5,
  });

  writeSection("At a glance", data.atAGlance.source.map((item) => item.label));
  writeFindingFact(doc, data.atAGlance.data.improved, "Improved", writeLines);
  writeFindingFact(doc, data.atAGlance.data.worsened, "Worsened", writeLines);
  writeFindingFact(doc, data.atAGlance.data.overdue, "Overdue", writeLines);
  writeFindingFact(doc, data.atAGlance.data.equipmentDown, "Equipment down", writeLines);
  writeFindingFact(
    doc,
    data.atAGlance.data.prCommittedOrderedSpend,
    data.atAGlance.data.prCommittedOrderedSpend.value?.[0]?.label ??
      "PR committed/ordered spend",
    writeLines,
  );
  writeFindingFact(doc, data.atAGlance.data.decisionsNeeded, "Decisions needed", writeLines);
  writeFindingFact(doc, data.atAGlance.data.supportNeeded, "Support needed", writeLines);

  writeSection("Executive overview", data.executive.source.map((item) => item.label));
  writeFact(
    data.executive.data.headline,
    "Executive status",
    (value) => value,
    writeLines,
  );

  const financial = data.financial.data;
  writeSection("Financials", data.financial.source.map((item) => item.label));
  writeFact(financial.revenueTotal, "Revenue total", money, writeLines);
  writeFact(
    financial.prCommittedOrderedSpendTotal,
    financial.prCommittedOrderedSpendTotal.label,
    money,
    writeLines,
  );
  writeFact(financial.periodBudgetTotal, "Period budget", money, writeLines);
  writeFact(
    financial.prSpendAgainstBudget,
    financial.prSpendAgainstBudget.label,
    (value) => {
      const percent = value.percentUsed === null ? "Unavailable" : `${value.percentUsed}%`;
      return `Budget ${money(value.budget)}; ${value.label} ${money(value.prCommittedOrderedSpend)}; remaining ${money(value.remaining)}; used ${percent}.`;
    },
    writeLines,
  );
  writeFact(
    financial.revenuePeriodComparison,
    "Revenue period comparison",
    comparisonText,
    writeLines,
  );
  writeFact(
    financial.revenueYearOverYear,
    "Revenue year-over-year",
    comparisonText,
    writeLines,
  );
  writeFact(
    financial.prSpendPeriodComparison,
    `${financial.prSpendPeriodComparison.label} period comparison`,
    comparisonText,
    writeLines,
  );
  writeFact(
    financial.prBudgetUtilizationComparison,
    `${financial.prBudgetUtilizationComparison.label} comparison`,
    comparisonText,
    writeLines,
  );
  writeFact(financial.revenueByCategory, "Revenue by category", amountListText, writeLines);
  writeFact(
    financial.prSpendByCostCenter,
    `${financial.prSpendByCostCenter.label} by cost center`,
    amountListText,
    writeLines,
  );
  writeFact(financial.revenueTrend, "Recorded revenue trend", monthAmountListText, writeLines);
  writeFact(
    financial.reconciliationVariances,
    "Purchase-request reconciliation variances",
    (values) =>
      values.length === 0
        ? "No recorded reconciliation variances."
        : values
            .map(
              (value) =>
                `PR ${value.purchaseRequestId}: submitted ${money(value.submittedAmount)}; recorded receipt amount ${money(value.recordedReceiptAmount)}; variance ${money(value.dollarVariance)}${value.percentVariance === null ? "" : ` (${value.percentVariance}%)`}.`,
            )
            .join(" "),
    writeLines,
  );

  const equipment = data.equipment.data;
  writeSection("Equipment", data.equipment.source.map((item) => item.label));
  writeFact(equipment.total, "Active equipment", String, writeLines);
  writeFact(equipment.operational, "Operational", String, writeLines);
  writeFact(equipment.down, "Equipment down", String, writeLines);
  writeFact(equipment.waitingParts, "Waiting on parts", String, writeLines);
  writeFact(equipment.needsService, "Needs service", String, writeLines);
  writeFact(
    equipment.downPeriodComparison,
    "Equipment down period comparison",
    comparisonText,
    writeLines,
  );
  writeFact(
    equipment.pmNote,
    "Safe PM status",
    (value) => value,
    writeLines,
  );
  writeFact(
    equipment.attentionUnits,
    "Equipment needing attention",
    (values) =>
      values.length === 0
        ? "No recorded equipment needs attention."
        : values
            .map(
              (value) =>
                `${value.name}: operational status ${value.status}; triage ${value.triageLabel}.`,
            )
            .join(" "),
    writeLines,
  );

  const course = data.course.data;
  writeSection("Course conditions", data.course.source.map((item) => item.label));
  writeFact(course.openIssues, "Open course issues", String, writeLines);
  writeFact(course.resolvedThisPeriod, "Resolved this period", String, writeLines);
  writeFact(course.openIssuePeriodComparison, "Open issue period comparison", comparisonText, writeLines);
  writeFact(course.byCategory, "Open issues by category", countListText, writeLines);
  writeFact(course.byHole, "Open issues by hole", countListText, writeLines);
  writeFact(
    course.topPriority,
    "Priority course issues",
    (values) =>
      values.length === 0
        ? "No recorded priority issues."
        : values
            .map(
              (value) =>
                `Hole ${value.holeNumber}: ${value.title} (${value.priority}, ${value.issueType}).`,
            )
            .join(" "),
    writeLines,
  );

  const procurement = data.procurement.data;
  writeSection("Procurement", data.procurement.source.map((item) => item.label));
  writeFact(procurement.prCountByStatus, "Purchase requests by status", countListText, writeLines);
  writeFact(
    procurement.prCommittedOrderedSpend,
    procurement.prCommittedOrderedSpend.label,
    money,
    writeLines,
  );
  writeFact(
    procurement.openPRs,
    "Open purchase requests",
    procurementListText,
    writeLines,
  );
  writeFact(
    procurement.awaitingApproval,
    "Awaiting approval",
    procurementListText,
    writeLines,
  );

  const staffing = data.staffing.data;
  writeSection("Staffing", data.staffing.source.map((item) => item.label));
  writeFact(staffing.activeHeadcount, "Active headcount", String, writeLines);
  writeFact(staffing.byRole, "Active headcount by role", countListText, writeLines);
  writeFact(staffing.vacancies, "Vacancies", String, writeLines);
  writeFact(
    staffing.certificationsExpiring,
    "Expired or expiring certifications",
    (values) =>
      values.length === 0
        ? "No recorded expired or expiring certifications."
        : values
            .map(
              (value) =>
                `${value.holder}: ${value.certification} (${value.status}; ${value.daysUntil} days).`,
            )
            .join(" "),
    writeLines,
  );
  writeFact(staffing.trainingRecords, "Training records", String, writeLines);

  const compliance = data.compliance.data;
  writeSection("Compliance", data.compliance.source.map((item) => item.label));
  writeFact(
    compliance.overdue,
    "Overdue obligations",
    complianceListText,
    writeLines,
  );
  writeFact(
    compliance.dueSoon,
    "Due soon obligations",
    complianceListText,
    writeLines,
  );
  writeFact(
    compliance.overduePeriodComparison,
    "Overdue obligation comparison",
    comparisonText,
    writeLines,
  );

  const workOrders = data.workOrders.data;
  writeSection("Work orders", data.workOrders.source.map((item) => item.label));
  writeFact(workOrders.open, "Open work orders", String, writeLines);
  writeFact(workOrders.agedOpen, "Aged open work orders", String, writeLines);
  writeFact(
    workOrders.openPeriodComparison,
    "Open work order period comparison",
    comparisonText,
    writeLines,
  );
  writeFact(
    workOrders.agedOpenItems,
    "Aged open work order details",
    (values) =>
      values.length === 0
        ? "No recorded aged open work orders."
        : values
            .map((value) => `${value.submittedDate}: ${value.description}.`)
            .join(" "),
    writeLines,
  );

  writeSection("Additional data availability");
  writeFact(
    data.restaurant.data.recordCount,
    "Restaurant records",
    String,
    writeLines,
  );
  writeFact(data.proShop.data.recordCount, "Pro shop inventory records", String, writeLines);
  writeFact(data.projects.data.recordCount, "Capital project records", String, writeLines);

  writeSection("Risks", data.risks.source.map((item) => item.label));
  writeFindingFact(doc, data.risks.data.items, "Recorded risks", writeLines);

  writeSection(
    "Decisions and support needed",
    data.leadershipAsks.source.map((item) => item.label),
  );
  writeFindingFact(
    doc,
    data.leadershipAsks.data.decisionsNeeded,
    "Decisions needed",
    writeLines,
  );
  writeFindingFact(
    doc,
    data.leadershipAsks.data.supportNeeded,
    "Support needed",
    writeLines,
  );

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Page ${page} of ${pages}`, pageWidth - MARGIN, pageHeight - 8, {
      align: "right",
    });
  }

  return { blob: doc.output("blob"), filename: leadershipBriefingFilename(data) };
}

function writeFact<T>(
  fact: BriefingFact<T>,
  label: string,
  formatter: (value: T) => string,
  writeLines: (text: string, options?: { bold?: boolean; color?: [number, number, number]; size?: number }) => void,
): void {
  if (fact.availability !== "recorded" || fact.value === null) {
    const note = fact.note ? ` ${fact.note}` : "";
    writeLines(`${label}: ${fact.availabilityLabel}.${note} ${sourceText(fact)}`, {
      color: MUTED,
    });
    return;
  }
  writeLines(`${label}: ${formatter(fact.value)} ${sourceText(fact)}`);
}

function writeFindingFact(
  _doc: jsPDF,
  fact: BriefingFact<BriefingFinding[]>,
  label: string,
  writeLines: (text: string, options?: { bold?: boolean; color?: [number, number, number]; size?: number }) => void,
): void {
  writeFact(
    fact,
    label,
    (findings) =>
      findings.length === 0
        ? "No recorded findings."
        : findings.map((finding) => `${finding.label}: ${finding.detail}`).join(" "),
    writeLines,
  );
}

function sourceText<T>(fact: BriefingFact<T>): string {
  const labels = fact.source.map((source) => source.label);
  return labels.length > 0 ? `Source: ${labels.join(", ")}.` : "";
}

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function comparisonText(value: PeriodComparison): string {
  const percentage = value.percentChange === null ? "Percentage change unavailable." : `${value.percentChange}% change.`;
  return `${value.currentPeriod}: ${value.current}; ${value.priorPeriod}: ${value.prior}; ${value.direction} by ${value.absoluteChange}. ${percentage}`;
}

function amountListText(values: MoneyCategoryAmount[]): string {
  return values.length === 0
    ? "No recorded items."
    : values.map((value) => `${value.category}: ${money(value.amount)}.`).join(" ");
}

function monthAmountListText(values: MoneyMonthAmount[]): string {
  return values.length === 0
    ? "No recorded months."
    : values.map((value) => `${value.month}: ${money(value.amount)}.`).join(" ");
}

function countListText(values: CountByLabel[]): string {
  return values.length === 0
    ? "No recorded items."
    : values.map((value) => `${value.label}: ${value.count}.`).join(" ");
}

function procurementListText(
  values: Array<{ id: string; status: string; datePrepared: string; submittedAmount: number | null }>,
): string {
  return values.length === 0
    ? "No recorded items."
    : values
        .map(
          (value) =>
            `${value.id}: ${value.status}, prepared ${value.datePrepared}${value.submittedAmount === null ? "" : `, submitted ${money(value.submittedAmount)}`}.`,
        )
        .join(" ");
}

function complianceListText(
  values: Array<{ title: string; dueDate: string; daysUntil: number; status: string }>,
): string {
  return values.length === 0
    ? "No recorded items."
    : values
        .map(
          (value) => `${value.title}: ${value.status}, due ${value.dueDate} (${value.daysUntil} days).`,
        )
        .join(" ");
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}
