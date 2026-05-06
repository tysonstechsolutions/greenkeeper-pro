/**
 * Pin Sheet Report — client-side PDF generator.
 *
 * Ported from /api/reports/pin-sheet. Portrait 2-col x 9-row grid of pin
 * positions for a given date.
 */
import { jsPDF } from "jspdf";
import { createClient } from "@/lib/supabase/client";
import { todayLocal } from "@/lib/utils/date";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BRAND_DARK: [number, number, number] = [27, 67, 50];
const BRAND_GOLD: [number, number, number] = [182, 141, 64];
const GRAY_600: [number, number, number] = [75, 85, 99];
const GRAY_400: [number, number, number] = [156, 163, 175];
const WHITE: [number, number, number] = [255, 255, 255];

const difficultyColors: Record<string, [number, number, number]> = {
  easy: [22, 163, 74],
  medium: [202, 138, 4],
  hard: [220, 38, 38],
};

function difficultyLabel(d: string | null | undefined): string {
  if (!d) return "";
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export interface PinSheetReportOptions {
  /** Date string YYYY-MM-DD. Defaults to today. */
  date?: string;
}

export class PinSheetReportError extends Error {
  step: string;
  constructor(step: string, message: string) {
    super(message);
    this.step = step;
    this.name = "PinSheetReportError";
  }
}

export async function generatePinSheetReport(
  options: PinSheetReportOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  let step = "init";
  try {
    const supabase = createClient();

    step = "auth";
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new PinSheetReportError(step, "Not signed in");

    step = "profile";
    const { data: profile } = await supabase.from("profiles")
      .select("full_name, role").eq("id", user.id).single();

    step = "parse-date";
    const date = options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date)
      ? options.date
      : todayLocal();

    step = "fetch-pins";
    const { data: pinsRaw, error: fetchErr } = await supabase
      .from("pin_positions")
      .select("*")
      .eq("date", date)
      .order("hole_number", { ascending: true });

    if (fetchErr) throw new PinSheetReportError(step, fetchErr.message);

    const pinsByHole = new Map<number, any>();
    (pinsRaw || []).forEach((p: any) => pinsByHole.set(p.hole_number, p));

    step = "pdf-init";
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const m = 12;

    const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    step = "pdf-header";
    doc.setFillColor(...BRAND_DARK);
    doc.rect(0, 0, pw, 28, "F");
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(0, 28, pw, 1.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...WHITE);
    doc.text("Veterans Memorial GC", m, 13);
    doc.setFontSize(13);
    doc.text("Pin Sheet", m, 21);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_GOLD);
    doc.text(displayDate, pw - m, 13, { align: "right" });
    doc.setTextColor(...WHITE);
    doc.setFontSize(8);
    doc.text(`${(pinsRaw || []).length} of 18 holes set`, pw - m, 21, { align: "right" });

    step = "pdf-grid";
    const gridTop = 36;
    const gridBottom = ph - 16;
    const gridH = gridBottom - gridTop;
    const rows = 9;
    const cols = 2;
    const cellH = gridH / rows;
    const gutter = 4;
    const cellW = (pw - m * 2 - gutter) / cols;

    for (let hole = 1; hole <= 18; hole++) {
      const col = (hole - 1) % 2;
      const row = Math.floor((hole - 1) / 2);
      const x = m + col * (cellW + gutter);
      const y = gridTop + row * cellH;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(x, y + 1, cellW, cellH - 2, 2, 2, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.setTextColor(...BRAND_DARK);
      doc.text(String(hole), x + 4, y + 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY_600);
      doc.text("HOLE", x + 4, y + 16);

      const pin = pinsByHole.get(hole);
      const detailX = x + 26;
      let dy = y + 8;

      if (pin) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...GRAY_600);
        doc.text("From Front:", detailX, dy);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 30, 30);
        doc.text(`${pin.paces_from_front} paces`, detailX + 24, dy);
        dy += 5;

        doc.setFont("helvetica", "bold");
        doc.setTextColor(...GRAY_600);
        doc.text("From Left:", detailX, dy);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(30, 30, 30);
        doc.text(`${pin.paces_from_left} paces`, detailX + 24, dy);
        dy += 5;

        if (pin.difficulty) {
          const color = difficultyColors[pin.difficulty as string] || GRAY_400;
          const label = difficultyLabel(pin.difficulty).toUpperCase();
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7);
          const badgeW = doc.getTextWidth(label) + 6;
          doc.setFillColor(...color);
          doc.roundedRect(detailX, dy - 3, badgeW, 4.5, 1, 1, "F");
          doc.setTextColor(...WHITE);
          doc.text(label, detailX + badgeW / 2, dy + 0.3, { align: "center" });
          dy += 5;
        }

        if (pin.notes) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(7);
          doc.setTextColor(...GRAY_600);
          const noteLines = doc.splitTextToSize(String(pin.notes), cellW - 28);
          doc.text(noteLines.slice(0, 2), detailX, dy);
        }
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(9);
        doc.setTextColor(...GRAY_400);
        doc.text("Not set", detailX, dy + 4);
      }
    }

    step = "pdf-footer";
    const timestamp = new Date().toLocaleString("en-US");
    const preparedBy = profile?.full_name || user.email || "Unknown";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_400);
    doc.text(`Generated ${timestamp} by ${preparedBy}`, m, ph - 6);
    doc.text("VMGC GreenKeeper Pro", pw - m, ph - 6, { align: "right" });

    step = "pdf-output";
    const blob = doc.output("blob") as Blob;
    const filename = `vmgc-pin-sheet-${date}.pdf`;

    return { blob, filename };
  } catch (err) {
    if (err instanceof PinSheetReportError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Pin sheet report error at step [${step}]:`, msg, err);
    throw new PinSheetReportError(step, msg);
  }
}

export async function downloadPinSheetReport(options: PinSheetReportOptions = {}): Promise<void> {
  const { blob, filename } = await generatePinSheetReport(options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
