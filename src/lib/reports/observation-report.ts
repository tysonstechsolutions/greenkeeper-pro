/**
 * Observation Report — client-side PDF generator.
 *
 * Ported from /api/reports/observation-report. Generates a portrait PDF of
 * observations for a single hole/green, or — when `hole` is omitted — all
 * observations for the chosen surface type.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase/client";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Inlined label maps (same as hole-constants / green-constants)
const issueTypeLabels: Record<string, string> = {
  fungus_disease: "Fungus / Disease",
  dry_spot: "Dry Spot",
  wet_area: "Wet Area",
  bare_spot: "Bare Spot",
  weed_pressure: "Weed Pressure",
  pest_damage: "Pest Damage",
  mechanical_damage: "Mechanical Damage",
  drainage: "Drainage Issue",
  bunker_issue: "Bunker Issue",
  tree_issue: "Tree Issue",
  irrigation_issue: "Irrigation Issue",
  turf_thin: "Thin Turf",
  algae: "Algae",
  frost_damage: "Frost Damage",
  other: "Other",
};

const greenIssueTypeLabels: Record<string, string> = {
  fungus_disease: "Fungus / Disease",
  dry_spot: "Dry Spot",
  wet_area: "Wet Area",
  bare_spot: "Bare Spot",
  weed_pressure: "Weed Pressure",
  pest_damage: "Pest Damage",
  mechanical_damage: "Mechanical Damage",
  irrigation_issue: "Irrigation Issue",
  algae: "Algae",
  frost_damage: "Frost Damage",
  ball_marks: "Ball Marks",
  scalping: "Scalping",
  compaction: "Compaction",
  thatch_buildup: "Thatch Buildup",
  aeration_needed: "Aeration Needed",
  topdressing_needed: "Topdressing Needed",
  moss: "Moss",
  shade_stress: "Shade Stress",
  traffic_wear: "Traffic Wear",
  chemical_burn: "Chemical Burn",
  poor_drainage: "Poor Drainage",
  uneven_surface: "Uneven Surface",
  other: "Other",
};

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GREEN: [number, number, number] = [45, 106, 79];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];

const priorityColors: Record<string, [number, number, number]> = {
  critical: [220, 38, 38],
  high: [234, 88, 12],
  normal: [37, 99, 235],
  low: [107, 114, 128],
};

const statusLabels: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  monitoring: "Monitoring",
};

async function fetchImageAsDataURL(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface ObservationReportOptions {
  /** Surface: "hole" (fairway) or "green" (putting surface). Defaults to "hole". */
  type?: "hole" | "green";
  /** Filter to a specific hole number 1-18, or omit for all holes. */
  hole?: number;
}

export class ObservationReportError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
    this.name = "ObservationReportError";
  }
}

export async function generateObservationReport(
  options: ObservationReportOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  let step = "init";
  try {
    const type = options.type === "green" ? "green" : "hole";
    const holeNumber = typeof options.hole === "number" && options.hole >= 1 && options.hole <= 18
      ? options.hole
      : null;

    const supabase = createClient();

    step = "auth";
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new ObservationReportError(step, "Not signed in");

    step = "fetch-profile";
    const { data: profile } = await supabase.from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    step = "fetch-observations";
    const table = type === "green" ? "green_observations" : "hole_observations";
    let q = (supabase.from(table) as any)
      .select(`*, reporter:profiles!reported_by(id, full_name, avatar_url, role)`)
      .order("created_at", { ascending: false });
    if (holeNumber != null) q = q.eq("hole_number", holeNumber);

    const { data: observations, error: fetchErr } = await q;
    if (fetchErr) throw new ObservationReportError(step, fetchErr.message);

    const labels = type === "green" ? greenIssueTypeLabels : issueTypeLabels;

    step = "photos";
    const photoPromises = (observations || []).map((obs: { photo_url: string | null }) =>
      obs.photo_url ? fetchImageAsDataURL(obs.photo_url) : Promise.resolve(null),
    );
    const photos = await Promise.all(photoPromises);

    step = "pdf-init";
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const addPage = () => {
      doc.addPage();
      y = margin;
    };

    const checkPageSpace = (needed: number) => {
      if (y + needed > pageHeight - 20) addPage();
    };

    const truncateText = (text: string, maxWidth: number, fontSize: number) => {
      doc.setFontSize(fontSize);
      if (doc.getTextWidth(text) <= maxWidth) return text;
      let truncated = text;
      while (doc.getTextWidth(truncated + "…") > maxWidth && truncated.length > 0) {
        truncated = truncated.slice(0, -1);
      }
      return truncated + "…";
    };

    // ── HEADER ──
    step = "pdf-header";
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pageWidth, 32, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, 32, pageWidth, 1.5, "F");

    const surfaceLabel = type === "green" ? "Green" : "Fairway";
    const titleText = holeNumber
      ? `Hole ${holeNumber} ${surfaceLabel} Report`
      : `All ${surfaceLabel}s Observation Report`;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.text(titleText, margin, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GOLD);
    doc.text("Observation & Treatment Report", margin, 22);

    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    doc.text(dateStr, pageWidth - margin, 15, { align: "right" });
    if (profile?.full_name) {
      doc.text(`Prepared by: ${profile.full_name}`, pageWidth - margin, 22, { align: "right" });
    }

    y = 40;

    // ── SUMMARY BOX ──
    step = "pdf-summary";
    const obs = observations || [];
    const openCount = obs.filter((o: any) => o.status !== "resolved").length;
    const criticalCount = obs.filter((o: any) => o.priority === "critical" && o.status !== "resolved").length;
    const highCount = obs.filter((o: any) => o.priority === "high" && o.status !== "resolved").length;

    doc.setFillColor(245, 247, 250);
    doc.roundedRect(margin, y, contentWidth, 22, 3, 3, "F");
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(margin, y, contentWidth, 22, 3, 3, "S");

    const statsY = y + 9;
    const colW = contentWidth / 4;

    const stats: Array<{ label: string; value: string; color: [number, number, number] }> = [
      { label: "Total Issues", value: obs.length.toString(), color: BRAND_GREEN },
      { label: "Open", value: openCount.toString(), color: [220, 38, 38] },
      { label: "Critical", value: criticalCount.toString(), color: [220, 38, 38] },
      { label: "High Priority", value: highCount.toString(), color: [234, 88, 12] },
    ];

    stats.forEach((stat, i) => {
      const x = margin + colW * i + colW / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...stat.color);
      doc.text(stat.value, x, statsY, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_600);
      doc.text(stat.label, x, statsY + 7, { align: "center" });
    });

    y += 28;

    // ── OBSERVATIONS ──
    step = "pdf-observations";
    if (obs.length === 0) {
      checkPageSpace(20);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      doc.setTextColor(...GRAY_400);
      doc.text("No observations recorded.", margin, y + 10);
    }

    for (let i = 0; i < obs.length; i++) {
      const observation = obs[i];
      const photo = photos[i];
      const diag = observation.diagnosis_result;

      const estimatedHeight = photo ? 100 : 50;
      checkPageSpace(estimatedHeight);

      const pColor = priorityColors[observation.priority] || GRAY_600;
      doc.setFillColor(...pColor);
      doc.rect(margin, y, contentWidth, 8, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const statusText = `${observation.priority.toUpperCase()} | ${statusLabels[observation.status] || observation.status}`;
      const statusWidth = doc.getTextWidth(statusText) + 8;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      const holePrefix = holeNumber == null && observation.hole_number
        ? `H${observation.hole_number}  `
        : "";
      const titlePrefix = `#${i + 1}  ${holePrefix}`;
      const maxTitleWidth = contentWidth - statusWidth - 8;
      const truncatedTitle = truncateText(
        observation.title,
        maxTitleWidth - doc.getTextWidth(titlePrefix),
        10,
      );
      doc.text(`${titlePrefix}${truncatedTitle}`, margin + 3, y + 5.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(statusText, pageWidth - margin - 3, y + 5.5, { align: "right" });

      y += 10;

      doc.setFontSize(8);
      doc.setTextColor(...GRAY_600);
      const issueLabel = labels[observation.issue_type] || observation.issue_type;
      const reportDate = new Date(observation.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const reporterName = observation.reporter?.full_name || "Unknown";
      doc.text(
        `Type: ${issueLabel}  |  Reported: ${reportDate}  |  By: ${reporterName}`,
        margin + 2,
        y + 3,
      );
      y += 6;

      if (photo) {
        checkPageSpace(65);
        try {
          const imgWidth = 60;
          const imgHeight = 45;
          const imgFormat = photo.startsWith("data:image/png") ? "PNG" : "JPEG";
          doc.addImage(photo, imgFormat, margin + 2, y, imgWidth, imgHeight);

          const textX = margin + imgWidth + 6;
          const textWidth = contentWidth - imgWidth - 8;
          let textY = y + 2;

          if (observation.description) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(...BRAND_DARK);
            doc.text("Description:", textX, textY);
            textY += 4;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...GRAY_600);
            const descLines = doc.splitTextToSize(observation.description, textWidth);
            doc.text(descLines.slice(0, 6), textX, textY);
            textY += Math.min(descLines.length, 6) * 3.5;
          }

          if (observation.fix_instructions) {
            textY += 2;
            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(180, 83, 9);
            doc.text("Fix Instructions:", textX, textY);
            textY += 4;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(...GRAY_600);
            const fixLines = doc.splitTextToSize(observation.fix_instructions, textWidth);
            doc.text(fixLines.slice(0, 5), textX, textY);
            textY += Math.min(fixLines.length, 5) * 3.5;
          }

          const textHeight = textY - y;
          y += Math.max(imgHeight, textHeight) + 3;
        } catch {
          y += 2;
        }
      } else {
        if (observation.description) {
          checkPageSpace(15);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(...GRAY_600);
          const descLines = doc.splitTextToSize(observation.description, contentWidth - 4);
          doc.text(descLines.slice(0, 4), margin + 2, y + 3);
          y += Math.min(descLines.length, 4) * 3.5 + 3;
        }

        if (observation.fix_instructions) {
          checkPageSpace(15);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(180, 83, 9);
          doc.text("Fix Instructions:", margin + 2, y + 2);
          y += 5;
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...GRAY_600);
          const fixLines = doc.splitTextToSize(observation.fix_instructions, contentWidth - 4);
          doc.text(fixLines.slice(0, 4), margin + 2, y);
          y += Math.min(fixLines.length, 4) * 3.5 + 2;
        }
      }

      if (diag?.diagnosis) {
        checkPageSpace(30);
        const conditionText = `${diag.diagnosis.condition || "Unknown Condition"}${
          diag.diagnosis.scientific_name ? ` (${diag.diagnosis.scientific_name})` : ""
        }`;
        doc.setFontSize(8);
        const conditionLines = doc.splitTextToSize(conditionText, contentWidth - 14);
        const conditionHeight = conditionLines.length * 3.5;
        const diagBoxHeight = Math.max(18, 8 + conditionHeight + 6);

        doc.setFillColor(240, 253, 244);
        doc.setDrawColor(187, 247, 208);
        doc.roundedRect(margin + 2, y, contentWidth - 4, diagBoxHeight, 2, 2, "FD");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...BRAND_DARK);
        doc.text("AI Diagnosis", margin + 5, y + 5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...BRAND_GREEN);
        doc.text(conditionLines, margin + 5, y + 10);

        const severityY = y + 10 + conditionHeight + 1;
        doc.setFontSize(7);
        doc.setTextColor(...GRAY_600);
        const severityDisplay = diag.diagnosis.severity_label
          ? `${diag.diagnosis.severity_label} (${diag.diagnosis.severity}/5)`
          : `${diag.diagnosis.severity}/5`;
        doc.text(
          `Severity: ${severityDisplay}  |  Confidence: ${diag.diagnosis.confidence || "N/A"}  |  Category: ${diag.diagnosis.category || "N/A"}`,
          margin + 5,
          severityY,
        );

        y += diagBoxHeight + 3;

        if (diag.treatment?.products?.length > 0) {
          checkPageSpace(25);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(...BRAND_DARK);
          doc.text("Recommended Products:", margin + 2, y + 3);
          y += 5;

          const tableData = diag.treatment.products.map((p: any) => [
            p.name || "Unknown Product",
            p.active_ingredient || "—",
            p.application_rate || "—",
            p.method || "—",
            p.in_inventory ? "In Stock" : "Not in Stock",
            p.timing || "—",
          ]);

          autoTable(doc, {
            startY: y,
            margin: { left: margin + 2, right: margin + 2 },
            head: [["Product", "Active Ingredient", "Rate", "Method", "Inventory", "Timing"]],
            body: tableData,
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: {
              fillColor: BRAND_DARK,
              textColor: [255, 255, 255],
              fontSize: 7,
              fontStyle: "bold",
            },
            alternateRowStyles: { fillColor: [245, 247, 250] },
            columnStyles: {
              0: { fontStyle: "bold", cellWidth: 28 },
              4: { cellWidth: 18 },
            },
          });

          y = (doc as any).lastAutoTable.finalY + 3;
        }

        if (diag.treatment?.application_window) {
          checkPageSpace(18);
          const aw = diag.treatment.application_window;
          doc.setFillColor(239, 246, 255);
          doc.setDrawColor(191, 219, 254);
          doc.roundedRect(margin + 2, y, contentWidth - 4, 14, 2, 2, "FD");

          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          doc.setTextColor(30, 64, 175);
          doc.text("Application Window", margin + 5, y + 4);

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(...GRAY_600);
          doc.text(
            `Best Date: ${aw.best_date || "TBD"}  |  Time: ${aw.best_time || "TBD"}  |  Temp: ${aw.ideal_temp_range || "N/A"}`,
            margin + 5,
            y + 8.5,
          );
          doc.text(
            `Max Wind: ${aw.max_wind || "N/A"}  |  Rain Buffer: ${aw.rain_buffer || "N/A"}`,
            margin + 5,
            y + 12,
          );

          y += 17;
        }

        if (diag.treatment?.follow_up?.length > 0) {
          checkPageSpace(20);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(...BRAND_DARK);
          doc.text("Follow-up Schedule:", margin + 2, y + 3);
          y += 5;

          const followData = diag.treatment.follow_up.map((fu: any) => [
            `Day ${fu.days_after}`,
            fu.action,
            fu.what_to_look_for,
            fu.if_no_improvement || "—",
          ]);

          autoTable(doc, {
            startY: y,
            margin: { left: margin + 2, right: margin + 2 },
            head: [["When", "Action", "Look For", "If No Improvement"]],
            body: followData,
            styles: { fontSize: 7, cellPadding: 1.5 },
            headStyles: {
              fillColor: BRAND_GREEN,
              textColor: [255, 255, 255],
              fontSize: 7,
              fontStyle: "bold",
            },
            alternateRowStyles: { fillColor: [245, 247, 250] },
          });

          y = (doc as any).lastAutoTable.finalY + 3;
        }

        if (diag.prevention?.length > 0) {
          checkPageSpace(15);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8);
          doc.setTextColor(...BRAND_DARK);
          doc.text("Prevention:", margin + 2, y + 3);
          y += 5;

          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(...GRAY_600);
          diag.prevention.forEach((tip: string) => {
            checkPageSpace(5);
            const lines = doc.splitTextToSize(`- ${tip}`, contentWidth - 6);
            doc.text(lines, margin + 4, y + 2);
            y += lines.length * 3 + 1;
          });
          y += 2;
        }
      }

      if (i < obs.length - 1) {
        y += 3;
        checkPageSpace(5);
        doc.setDrawColor(...GRAY_400);
        doc.setLineDashPattern([1, 1], 0);
        doc.line(margin + 10, y, pageWidth - margin - 10, y);
        doc.setLineDashPattern([], 0);
        y += 5;
      }
    }

    step = "pdf-footer";
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8);
      doc.setTextColor(...GRAY_400);
      doc.text(
        `VMGC GreenKeeper Pro | Generated ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: "center" },
      );
      doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 8, {
        align: "right",
      });
    }

    step = "pdf-output";
    const surface = type === "green" ? "Green" : "Fairway";
    const scope = holeNumber ? `Hole-${holeNumber}` : `All-${surface}s`;
    const filename = `${scope}-${surface}-Report-${new Date().toISOString().split("T")[0]}.pdf`;
    const blob = doc.output("blob") as Blob;

    return { blob, filename };
  } catch (err) {
    if (err instanceof ObservationReportError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Observation report error at step [${step}]:`, msg, err);
    throw new ObservationReportError(step, msg);
  }
}

/**
 * Convenience wrapper: generate + trigger a browser download.
 */
export async function downloadObservationReport(
  options: ObservationReportOptions = {},
): Promise<void> {
  const { blob, filename } = await generateObservationReport(options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
