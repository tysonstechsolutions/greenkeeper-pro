/**
 * Sprinkler Map Report — client-side, printable visual reference.
 *
 * One page per hole-part (18 holes × tee / fairway / green = 54 pages, in
 * play order tee → fairway → green), each showing that part's aerial picture
 * scaled to fill the page with every sprinkler head drawn on top at its
 * stored position, colored by area and labeled "satellite-station".
 *
 * Photos are re-encoded to JPEG so a 54-image PDF stays a reasonable size;
 * the pins/labels are drawn as crisp vector graphics on top.
 *
 * Pictures only — no tables (per the superintendent's request).
 */
import { jsPDF } from "jspdf";
import { createClient } from "@/lib/supabase/client";
import { getCachedUserId } from "@/lib/supabase/rest";

/* eslint-disable @typescript-eslint/no-explicit-any */

type AreaType = "green" | "tee" | "fairway";

interface Sprinkler {
  id: string;
  satellite_num: number;
  station_num: number;
  hole_number: number;
  area_type: AreaType;
  x_pct: number;
  y_pct: number;
  label: string | null;
}

const AREA_COLOR: Record<AreaType, [number, number, number]> = {
  green: [22, 163, 74], // emerald-600
  tee: [101, 163, 13], // lime-600
  fairway: [37, 99, 235], // blue-600
};
const AREA_LABEL: Record<AreaType, string> = {
  green: "Green",
  tee: "Tee",
  fairway: "Fairway",
};

/** Hole flow: tee → fairway → green. */
const PART_ORDER: AreaType[] = ["tee", "fairway", "green"];
const HOLES = Array.from({ length: 18 }, (_, i) => i + 1);

/** Matches the on-screen sprinkler map's per-part image paths. */
function partImageSrc(hole: number, part: AreaType): string {
  const suffix = part === "tee" ? " tees" : part === "fairway" ? " fairway" : "";
  return encodeURI(`/irrigation/hole ${hole}${suffix}.png`);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Re-encode an image as a JPEG data URL (smaller than PNG for photos). */
function toJpeg(img: HTMLImageElement): { dataUrl: string; w: number; h: number } {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff"; // flatten any transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
  }
  return {
    dataUrl: canvas.toDataURL("image/jpeg", 0.82),
    w: img.naturalWidth,
    h: img.naturalHeight,
  };
}

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Draw one sprinkler head: colored dot with a white halo + a "sat-station" chip. */
function drawPin(
  doc: jsPDF,
  x: number,
  y: number,
  color: [number, number, number],
  text: string,
) {
  // Halo for contrast against the photo.
  doc.setFillColor(255, 255, 255);
  doc.circle(x, y, 2.0, "F");
  doc.setFillColor(color[0], color[1], color[2]);
  doc.circle(x, y, 1.35, "F");

  // Label chip to the upper-right of the dot.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  const tw = doc.getTextWidth(text);
  const chipW = tw + 2.4;
  const chipH = 4.0;
  const chipX = x + 2.2;
  const chipY = y - 4.6;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(chipX, chipY, chipW, chipH, 0.7, 0.7, "F");
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(0.3);
  doc.roundedRect(chipX, chipY, chipW, chipH, 0.7, 0.7, "S");
  doc.setTextColor(30, 30, 30);
  doc.text(text, chipX + 1.2, chipY + 2.8);
}

function drawCover(doc: jsPDF, PW: number, total: number) {
  const cx = PW / 2;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(27, 67, 50); // brand green
  doc.text("Irrigation Sprinkler Maps", cx, 60, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(90, 90, 90);
  doc.text("All 18 holes - tees, fairways & greens", cx, 72, { align: "center" });
  doc.text(`Generated ${todayStr()}`, cx, 80, { align: "center" });
  doc.text(
    `${total} sprinkler head${total === 1 ? "" : "s"} mapped`,
    cx,
    88,
    { align: "center" },
  );

  // Legend.
  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "bold");
  doc.text("Legend", cx, 112, { align: "center" });
  doc.setFont("helvetica", "normal");
  let ly = 122;
  for (const part of ["tee", "fairway", "green"] as AreaType[]) {
    const [r, g, b] = AREA_COLOR[part];
    doc.setFillColor(r, g, b);
    doc.circle(cx - 34, ly - 1.2, 2.0, "F");
    doc.setTextColor(40, 40, 40);
    doc.text(AREA_LABEL[part], cx - 28, ly);
    ly += 9;
  }
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(
    'Each dot is a sprinkler head, labeled "satellite-station".',
    cx,
    ly + 4,
    { align: "center" },
  );
}

export async function generateSprinklerMapReport(): Promise<{
  blob: Blob;
  filename: string;
}> {
  const supabase = createClient();
  const userId = getCachedUserId();
  if (!userId) throw new Error("Not signed in");

  const { data, error } = await (supabase.from("irrigation_sprinklers") as any)
    .select("id,satellite_num,station_num,hole_number,area_type,x_pct,y_pct,label");
  if (error) throw new Error(error.message);
  const sprinklers = (data ?? []) as Sprinkler[];

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = doc.internal.pageSize.getWidth(); // 210
  const PH = doc.internal.pageSize.getHeight(); // 297
  const margin = 12;
  const headerH = 16;

  drawCover(doc, PW, sprinklers.length);

  for (const hole of HOLES) {
    for (const part of PART_ORDER) {
      doc.addPage();

      // ── Header ──
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(20, 20, 20);
      doc.text(`Hole ${hole} - ${AREA_LABEL[part]}`, margin, margin + 6);
      const [r, g, b] = AREA_COLOR[part];
      doc.setFillColor(r, g, b);
      doc.circle(PW - margin - 3, margin + 3, 2.6, "F");

      const pins = sprinklers.filter(
        (s) => s.hole_number === hole && s.area_type === part,
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(110, 110, 110);
      doc.text(
        `${pins.length} sprinkler${pins.length === 1 ? "" : "s"}`,
        margin,
        margin + 11.5,
      );

      // ── Image area ──
      const areaTop = margin + headerH;
      const areaW = PW - margin * 2;
      const areaH = PH - areaTop - margin;

      const img = await loadImage(partImageSrc(hole, part));
      if (!img || img.naturalWidth === 0) {
        doc.setFontSize(11);
        doc.setTextColor(150, 150, 150);
        doc.text("(picture not available)", PW / 2, areaTop + areaH / 2, {
          align: "center",
        });
        continue;
      }

      const { dataUrl, w: natW, h: natH } = toJpeg(img);
      const scale = Math.min(areaW / natW, areaH / natH);
      const imgW = natW * scale;
      const imgH = natH * scale;
      const imgX = margin + (areaW - imgW) / 2;
      const imgY = areaTop + (areaH - imgH) / 2;

      doc.addImage(dataUrl, "JPEG", imgX, imgY, imgW, imgH);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.rect(imgX, imgY, imgW, imgH);

      // ── Pins ──
      for (const s of pins) {
        const px = imgX + Math.max(0, Math.min(1, s.x_pct)) * imgW;
        const py = imgY + Math.max(0, Math.min(1, s.y_pct)) * imgH;
        drawPin(doc, px, py, AREA_COLOR[part], `${s.satellite_num}-${s.station_num}`);
      }
    }
  }

  // ── Footer page numbers ──
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Page ${p} of ${pageCount}`, PW - margin, PH - 6, { align: "right" });
  }

  const blob = doc.output("blob");
  return { blob, filename: `Sprinkler-Maps-${todayStr()}.pdf` };
}
