/**
 * FY26 Asset Inventory Report — client-side PDF generator.
 *
 * Produces a portrait PDF with:
 *   1. Cover / summary page  (stats by status + total value)
 *   2. Full inventory table  (sorted site → asset#, status-colored)
 *   3. Condition-photo pages (one card per asset that has photos)
 *   4. Signature page
 *
 * Page-break guard: every section checks remaining space before drawing and
 * adds a fresh page when necessary so nothing is clipped.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { createClient } from "@/lib/supabase/client";
import { getCachedUserId } from "@/lib/supabase/rest";
import { todayLocal } from "@/lib/utils/date";
import type { Fy26Asset } from "@/types/fy26-assets";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Brand palette ────────────────────────────────────────────────────────────
const DARK:   [number,number,number] = [27,  67,  50 ];
const GREEN:  [number,number,number] = [45,  106, 79 ];
const GOLD:   [number,number,number] = [182, 141, 64 ];
const GRAY6:  [number,number,number] = [75,  85,  99 ];
const GRAY4:  [number,number,number] = [156, 163, 175];
const WHITE:  [number,number,number] = [255, 255, 255];
const RED:    [number,number,number] = [220, 38,  38 ];
const AMBER:  [number,number,number] = [245, 158, 11 ];
const ORANGE: [number,number,number] = [234, 88,  12 ];

// ── Status helpers ────────────────────────────────────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  verified_present: "Present",
  mia:              "Missing",
  unverified:       "Unverified",
  no_asset_tag:     "No Asset Tag",
  needs_disposed:   "Needs Disposed",
  disposed:         "Disposed",
};
const STATUS_COLORS: Record<string, [number,number,number]> = {
  verified_present: [34,  197, 94 ],
  mia:              [239, 68,  68 ],
  unverified:       [107, 114, 128],
  no_asset_tag:     [245, 158, 11 ],
  needs_disposed:   [234, 88,  12 ],
  disposed:         [153, 27,  27 ],
};

const SITE_LABELS: Record<string, string> = {
  "7009": "7009 — Golf Course",
  "7010": "7010 — Golf Course Maintenance",
};

function s(v: unknown, fallback = "—"): string {
  if (v == null || v === "") return fallback;
  return String(v);
}

function money(v: number | null | undefined): string {
  if (v == null) return "—";
  return "$" + Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Fetch a remote photo and convert to a data-URL. Returns null on any error. */
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── Page geometry ─────────────────────────────────────────────────────────────
const FORMAT = "a4";
const ORIENT = "portrait" as const;
const M = 14;   // side margin

export class AssetReportError extends Error {
  step: string;
  constructor(step: string, msg: string) { super(msg); this.step = step; this.name = "AssetReportError"; }
}

export async function generateAssetInventoryReport(): Promise<{ blob: Blob; filename: string }> {
  let step = "init";
  try {
    const supabase = createClient();

    // ── Auth ──────────────────────────────────────────────────────────────────
    step = "auth";
    const userId = getCachedUserId();
    if (!userId) throw new AssetReportError(step, "Not signed in");

    step = "profile";
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

    // ── Fetch all assets ──────────────────────────────────────────────────────
    step = "fetch";
    const { data: rawAssets, error: fetchErr } = await supabase
      .from("fy26_assets")
      .select("*")
      .order("site",         { ascending: true })
      .order("asset_number", { ascending: true });

    if (fetchErr) throw new AssetReportError(step, fetchErr.message);
    const assets: Fy26Asset[] = rawAssets || [];
    if (assets.length === 0) throw new AssetReportError("no-data", "No assets found");

    // ── Stats ─────────────────────────────────────────────────────────────────
    const stats = {
      total:            assets.length,
      verified_present: assets.filter(a => a.status === "verified_present").length,
      mia:              assets.filter(a => a.status === "mia").length,
      unverified:       assets.filter(a => a.status === "unverified").length,
      no_asset_tag:     assets.filter(a => a.status === "no_asset_tag").length,
      needs_disposed:   assets.filter(a => a.status === "needs_disposed").length,
      disposed:         assets.filter(a => a.status === "disposed").length,
      total_value:      assets.reduce((s, a) => s + (Number(a.original_value) || 0), 0),
    };

    // ── Pre-fetch condition photos (parallel, non-blocking) ──────────────────
    step = "photos";
    const assetsWithPhotos = assets.filter(a =>
      a.condition_photos && Object.keys(a.condition_photos).length > 0,
    );

    // Map: assetId → { angle → dataUrl }
    const photoDataMap = new Map<string, Record<string, string | null>>();
    await Promise.all(
      assetsWithPhotos.map(async (asset) => {
        const photos = asset.condition_photos || {};
        const angleMap: Record<string, string | null> = {};
        await Promise.all(
          (["front","back","left","right"] as const).map(async (angle) => {
            const url = photos[angle];
            angleMap[angle] = url ? await toDataUrl(url) : null;
          }),
        );
        photoDataMap.set(asset.id, angleMap);
      }),
    );

    // ── Init PDF ──────────────────────────────────────────────────────────────
    step = "pdf-init";
    const doc = new jsPDF({ orientation: ORIENT, unit: "mm", format: FORMAT });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();

    const dateStr = new Date().toLocaleDateString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    // Helper: draw consistent page footer
    const drawFooter = (pageNum: number, totalPages: number) => {
      doc.setFontSize(7);
      doc.setTextColor(...GRAY4);
      doc.text(`Page ${pageNum} of ${totalPages}`, pw / 2, ph - 5, { align: "center" });
      doc.text("VMGC GreenKeeper Pro — FY26 Asset Inventory", M, ph - 5);
      doc.text(new Date().toLocaleDateString(), pw - M, ph - 5, { align: "right" });
    };

    // Helper: draw section header banner
    const sectionHeader = (title: string, yPos: number): number => {
      doc.setFillColor(...GREEN);
      doc.rect(M, yPos, pw - M * 2, 7, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...WHITE);
      doc.text(title.toUpperCase(), M + 3, yPos + 4.8);
      return yPos + 9;
    };

    // ════════════════════════════════════════════════════════════════════════
    // PAGE 1 — COVER
    // ════════════════════════════════════════════════════════════════════════
    step = "pdf-cover";

    // Header bar
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pw, 52, "F");
    doc.setFillColor(...GOLD);
    doc.rect(0, 52, pw, 2.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...WHITE);
    doc.text("FY26 Capital Asset Inventory", M, 22);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...GOLD);
    doc.text("SITE 7009 — Golf Course  ·  SITE 7010 — Golf Course Maintenance", M, 32);

    doc.setFontSize(9);
    doc.setTextColor(...WHITE);
    doc.text(dateStr, pw - M, 20, { align: "right" });
    if (profile?.full_name) {
      doc.text("Prepared by: " + profile.full_name, pw - M, 28, { align: "right" });
    }
    doc.text(`${stats.total} Total Assets`, pw - M, 36, { align: "right" });

    // Stats grid
    let y = 62;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...DARK);
    doc.text("Inventory Status Summary", M, y);
    y += 7;

    const statItems = [
      { label: "Present",       val: stats.verified_present, color: STATUS_COLORS.verified_present },
      { label: "Missing (MIA)", val: stats.mia,              color: STATUS_COLORS.mia              },
      { label: "Unverified",    val: stats.unverified,        color: STATUS_COLORS.unverified       },
      { label: "No Asset Tag",  val: stats.no_asset_tag,      color: STATUS_COLORS.no_asset_tag     },
      { label: "Needs Disposed",val: stats.needs_disposed,    color: STATUS_COLORS.needs_disposed   },
      { label: "Disposed",      val: stats.disposed,          color: STATUS_COLORS.disposed         },
    ];

    const cardW = (pw - M * 2 - 10) / 3;
    const cardH = 28;
    const cardGap = 5;

    statItems.forEach((item, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = M + col * (cardW + cardGap);
      const cy = y + row * (cardH + 4);

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(229, 231, 235);
      doc.roundedRect(cx, cy, cardW, cardH, 3, 3, "FD");
      doc.setFillColor(...item.color);
      doc.rect(cx, cy, cardW, 3.5, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(24);
      doc.setTextColor(...item.color);
      doc.text(String(item.val), cx + cardW / 2, cy + 18, { align: "center" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY6);
      doc.text(item.label, cx + cardW / 2, cy + 24, { align: "center" });
    });

    y += 2 * (cardH + 4) + 8;

    // Total value callout
    const valBoxY = y;
    doc.setFillColor(...DARK);
    doc.roundedRect(M, valBoxY, pw - M * 2, 18, 4, 4, "F");
    doc.setFillColor(...GOLD);
    doc.rect(M, valBoxY, 4, 18, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...GOLD);
    doc.text("Total Original Portfolio Value", M + 10, valBoxY + 8);
    doc.setFontSize(16);
    doc.setTextColor(...WHITE);
    doc.text(
      "$" + stats.total_value.toLocaleString("en-US", { maximumFractionDigits: 0 }),
      pw - M - 4,
      valBoxY + 11,
      { align: "right" },
    );
    y = valBoxY + 24;

    // Site breakdown table on cover
    const site7009 = assets.filter(a => a.site === "7009");
    const site7010 = assets.filter(a => a.site === "7010");
    const siteRows = [
      ["7009 — Golf Course",             String(site7009.length), money(site7009.reduce((s,a)=>s+(Number(a.original_value)||0),0))],
      ["7010 — Golf Course Maintenance", String(site7010.length), money(site7010.reduce((s,a)=>s+(Number(a.original_value)||0),0))],
    ];

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...DARK);
    doc.text("By Site", M, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [["Site", "Assets", "Original Value"]],
      body: siteRows,
      margin: { left: M, right: M },
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { halign: "center" as const, cellWidth: 24 },
        2: { halign: "right"  as const, cellWidth: 40 },
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // PAGES 2+ — INVENTORY TABLE
    // ════════════════════════════════════════════════════════════════════════
    step = "pdf-table";
    doc.addPage();

    // Table page header
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pw, 16, "F");
    doc.setFillColor(...GOLD);
    doc.rect(0, 16, pw, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...WHITE);
    doc.text("Full Asset Inventory", M, 10.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GOLD);
    doc.text(
      `${stats.total} assets  ·  Generated ${new Date().toLocaleDateString()}`,
      pw - M,
      10.5,
      { align: "right" },
    );

    const tableRows = assets.map(a => {
      const statusLabel = STATUS_LABELS[a.status] || a.status;
      const statusColor = STATUS_COLORS[a.status] || GRAY4;
      return {
        row: [
          s(a.asset_number) + (a.sub_number && a.sub_number !== "0" ? `/${a.sub_number}` : ""),
          s(a.description),
          a.site === "7009" ? "7009" : "7010",
          [a.manufacturer, a.model_text].filter(Boolean).join(" · ") || "—",
          s(a.serial_number),
          String(a.qty),
          money(a.original_value),
          statusLabel,
        ],
        statusColor,
        isDisposed: a.status === "disposed" || a.status === "needs_disposed",
        isMIA: a.status === "mia",
      };
    });

    autoTable(doc, {
      startY: 22,
      head: [["Asset #", "Description", "Site", "Make / Model", "Serial #", "Qty", "Value", "Status"]],
      body: tableRows.map(r => r.row),
      margin: { left: M, right: M },
      styles: { fontSize: 7, cellPadding: 1.8, overflow: "linebreak" },
      headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 20, fontStyle: "bold" as const },
        1: { cellWidth: "auto" },
        2: { cellWidth: 12, halign: "center" as const },
        3: { cellWidth: 36 },
        4: { cellWidth: 26, font: "courier" as const },
        5: { cellWidth: 8,  halign: "center" as const },
        6: { cellWidth: 20, halign: "right" as const },
        7: { cellWidth: 22, halign: "center" as const },
      },
      didParseCell(data) {
        if (data.section === "body" && data.column.index === 7) {
          const rowData = tableRows[data.row.index];
          if (rowData) {
            const [r, g, b] = rowData.statusColor;
            data.cell.styles.textColor = [r, g, b];
            data.cell.styles.fontStyle = "bold";
          }
        }
        if (data.section === "body") {
          const rowData = tableRows[data.row.index];
          if (rowData?.isMIA) {
            data.cell.styles.fillColor = [255, 245, 245];
          }
        }
      },
    });

    // ════════════════════════════════════════════════════════════════════════
    // CONDITION PHOTO PAGES
    // ════════════════════════════════════════════════════════════════════════
    step = "pdf-photos";

    if (assetsWithPhotos.length > 0) {
      doc.addPage();

      // Section title page
      doc.setFillColor(...DARK);
      doc.rect(0, 0, pw, 16, "F");
      doc.setFillColor(...GOLD);
      doc.rect(0, 16, pw, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...WHITE);
      doc.text("Condition Photo Documentation", M, 10.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GOLD);
      doc.text(`${assetsWithPhotos.length} assets with photos`, pw - M, 10.5, { align: "right" });

      let py = 24;

      // Each asset gets its own card. Each card = header bar + 2×2 photo grid.
      // Card height estimate: 8 (header) + 2 rows × photo height + gaps
      // Photo cell: ~(pw - 2M - gap) / 2 wide, aspect 4:3
      const CARD_INNER_W = pw - M * 2;
      const PHOTO_GAP = 4;
      const PHOTO_W = (CARD_INNER_W - PHOTO_GAP) / 2;
      const PHOTO_H = PHOTO_W * 0.75;   // 4:3 aspect
      const ANGLE_LABELS: Record<string, string> = {
        front: "Front", back: "Back", left: "Left Side", right: "Right Side",
      };
      const ANGLES = ["front", "back", "left", "right"] as const;

      const CARD_H =
        9 +          // header bar
        4 +          // top padding
        PHOTO_H +    // row 1
        PHOTO_GAP +
        PHOTO_H +    // row 2 (back/right might not exist, but space reserved)
        6;           // bottom padding

      for (const asset of assetsWithPhotos) {
        const photosByAngle = photoDataMap.get(asset.id) || {};
        const hasAny = ANGLES.some(a => photosByAngle[a]);
        if (!hasAny) continue;

        // How many photos actually exist?
        const photoCount = ANGLES.filter(a => photosByAngle[a]).length;

        // Card height: 2 rows always for 3-4 photos, 1 row for 1-2 photos
        const numRows = photoCount <= 2 ? 1 : 2;
        const cardH = 9 + 4 + numRows * PHOTO_H + (numRows - 1) * PHOTO_GAP + 6;

        // Page break guard: if card won't fit, add a new page
        if (py + cardH > ph - 14) {
          doc.addPage();
          py = 14;
        }

        const statusColor = STATUS_COLORS[asset.status] || GRAY4;
        const statusLabel  = STATUS_LABELS[asset.status] || asset.status;

        // Card header
        doc.setFillColor(...DARK);
        doc.roundedRect(M, py, CARD_INNER_W, 9, 2, 2, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...WHITE);
        const titleText = s(asset.description);
        doc.text(titleText, M + 3, py + 6);

        // Status badge on the right
        const badgeText = statusLabel.toUpperCase();
        const badgeW = doc.getTextWidth(badgeText) + 8;
        doc.setFillColor(...statusColor);
        doc.roundedRect(pw - M - badgeW - 2, py + 1.5, badgeW, 6, 1.5, 1.5, "F");
        doc.setFontSize(7);
        doc.setTextColor(...WHITE);
        doc.text(badgeText, pw - M - badgeW / 2 - 2, py + 5.5, { align: "center" });

        // Asset # and value sub-line
        const subY = py + 9;
        doc.setFillColor(240, 244, 241);
        doc.rect(M, subY, CARD_INNER_W, 4, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...GRAY6);
        const assetMeta = [
          `Asset # ${s(asset.asset_number)}${asset.sub_number && asset.sub_number !== "0" ? ` / sub ${asset.sub_number}` : ""}`,
          `Site ${asset.site}`,
          [asset.manufacturer, asset.model_text].filter(Boolean).join(" · ") || null,
          asset.serial_number ? `SN: ${asset.serial_number}` : null,
          money(asset.original_value),
        ].filter(Boolean).join("   ·   ");
        doc.text(assetMeta, M + 3, subY + 2.8);

        // Photo grid
        let photoTop = subY + 6;
        const availableAngles = ANGLES.filter(a => photosByAngle[a]);

        availableAngles.forEach((angle, idx) => {
          const col = idx % 2;
          const row = Math.floor(idx / 2);
          const px2 = M + col * (PHOTO_W + PHOTO_GAP);
          const py2 = photoTop + row * (PHOTO_H + PHOTO_GAP);

          const dataUrl = photosByAngle[angle];
          if (dataUrl) {
            try {
              const fmt = dataUrl.includes("image/png") ? "PNG" : "JPEG";
              doc.addImage(dataUrl, fmt, px2, py2, PHOTO_W, PHOTO_H);
            } catch {
              // If image decode fails, draw placeholder
              doc.setFillColor(243, 244, 246);
              doc.setDrawColor(209, 213, 219);
              doc.rect(px2, py2, PHOTO_W, PHOTO_H, "FD");
            }
          }

          // Angle label overlay at the bottom of each photo
          doc.setFillColor(0, 0, 0);
          (doc as any).setGState(new (doc as any).GState({ opacity: 0.55 }));
          doc.rect(px2, py2 + PHOTO_H - 5.5, PHOTO_W, 5.5, "F");
          (doc as any).setGState(new (doc as any).GState({ opacity: 1 }));
          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.5);
          doc.setTextColor(...WHITE);
          doc.text(ANGLE_LABELS[angle] || angle, px2 + PHOTO_W / 2, py2 + PHOTO_H - 1.5, {
            align: "center",
          });
        });

        // If odd number of photos, fill the empty slot with a placeholder
        if (availableAngles.length % 2 !== 0 && availableAngles.length > 1) {
          const idx  = availableAngles.length;
          const col  = idx % 2;
          const row  = Math.floor(idx / 2);
          const px2  = M + col * (PHOTO_W + PHOTO_GAP);
          const py2  = photoTop + row * (PHOTO_H + PHOTO_GAP);
          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(229, 231, 235);
          doc.rect(px2, py2, PHOTO_W, PHOTO_H, "FD");
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(...GRAY4);
          doc.text("No photo", px2 + PHOTO_W / 2, py2 + PHOTO_H / 2, { align: "center" });
        }

        // Notes
        if (asset.notes && asset.notes.trim()) {
          const notesY = photoTop + numRows * (PHOTO_H + PHOTO_GAP) + 1;
          doc.setFont("helvetica", "italic");
          doc.setFontSize(7);
          doc.setTextColor(...GRAY6);
          const noteLines = doc.splitTextToSize("Notes: " + asset.notes.trim(), CARD_INNER_W - 6);
          doc.text(noteLines.slice(0, 2), M + 3, notesY + 3);
        }

        py += cardH + 5;
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // MIA ASSET DETAIL PAGE (if any)
    // ════════════════════════════════════════════════════════════════════════
    const miaAssets = assets.filter(a => a.status === "mia");
    if (miaAssets.length > 0) {
      step = "pdf-mia";
      doc.addPage();

      doc.setFillColor(...RED);
      doc.rect(0, 0, pw, 16, "F");
      doc.setFillColor(...GOLD);
      doc.rect(0, 16, pw, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...WHITE);
      doc.text("Missing Assets (MIA)", M, 10.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(255, 200, 200);
      doc.text(`${miaAssets.length} assets not verified present`, pw - M, 10.5, { align: "right" });

      const miaRows = miaAssets.map(a => [
        s(a.asset_number) + (a.sub_number && a.sub_number !== "0" ? `/${a.sub_number}` : ""),
        s(a.description),
        a.site === "7009" ? "7009" : "7010",
        [a.manufacturer, a.model_text].filter(Boolean).join(" · ") || "—",
        s(a.serial_number),
        money(a.original_value),
        a.notes ? s(a.notes).substring(0, 60) + (s(a.notes).length > 60 ? "…" : "") : "—",
      ]);

      autoTable(doc, {
        startY: 22,
        head: [["Asset #", "Description", "Site", "Make / Model", "Serial #", "Value", "Notes"]],
        body: miaRows,
        margin: { left: M, right: M },
        styles: { fontSize: 7, cellPadding: 1.8, overflow: "linebreak" },
        headStyles: { fillColor: RED, textColor: WHITE, fontStyle: "bold", fontSize: 7.5 },
        alternateRowStyles: { fillColor: [255, 248, 248] },
        columnStyles: {
          0: { cellWidth: 20, fontStyle: "bold" as const },
          1: { cellWidth: "auto" },
          2: { cellWidth: 12, halign: "center" as const },
          3: { cellWidth: 34 },
          4: { cellWidth: 26, font: "courier" as const },
          5: { cellWidth: 20, halign: "right" as const },
          6: { cellWidth: 35 },
        },
        didParseCell(data) {
          if (data.section === "body") {
            data.cell.styles.textColor = [153, 27, 27];
          }
        },
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SIGNATURE PAGE
    // ════════════════════════════════════════════════════════════════════════
    step = "pdf-signatures";
    doc.addPage();

    doc.setFillColor(...DARK);
    doc.rect(0, 0, pw, 16, "F");
    doc.setFillColor(...GOLD);
    doc.rect(0, 16, pw, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...WHITE);
    doc.text("Signatures & Certification", M, 10.5);

    let sy = 28;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY6);
    doc.text(
      "I certify that the asset inventory documented in this report is accurate to the best of my knowledge.",
      M, sy,
    );
    sy += 14;

    const sigLine = (label: string, y2: number) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...GRAY6);
      doc.text(label, M, y2);
      doc.setDrawColor(180, 180, 180);
      doc.line(M + 42, y2 + 1, M + 120, y2 + 1);
      doc.text("Date:", M + 128, y2);
      doc.line(M + 143, y2 + 1, M + 180, y2 + 1);
    };

    sigLine("Superintendent:", sy);
    sy += 18;
    sigLine("Director / Approver:", sy);
    sy += 18;
    sigLine("Additional Approval:", sy);
    sy += 24;

    doc.setDrawColor(...GRAY4);
    doc.line(M, sy, pw - M, sy);
    sy += 8;

    // Summary recap
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text("Report Summary", M, sy);
    sy += 7;

    const summaryLines = [
      `Total Assets: ${stats.total}`,
      `Present: ${stats.verified_present}  |  Missing: ${stats.mia}  |  Unverified: ${stats.unverified}`,
      `No Asset Tag: ${stats.no_asset_tag}  |  Needs Disposed: ${stats.needs_disposed}  |  Disposed: ${stats.disposed}`,
      `Total Original Value: ${money(stats.total_value)}`,
    ];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY6);
    for (const line of summaryLines) {
      doc.text(line, M, sy);
      sy += 5.5;
    }

    // ── Footers (all pages) ───────────────────────────────────────────────────
    step = "pdf-footers";
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawFooter(i, totalPages);
    }

    // ── Output ────────────────────────────────────────────────────────────────
    step = "pdf-output";
    const blob = doc.output("blob") as Blob;
    const filename = `vmgc-asset-inventory-${todayLocal()}.pdf`;
    return { blob, filename };

  } catch (err) {
    if (err instanceof AssetReportError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[asset-inventory-report] error at step [${step}]:`, msg);
    throw new AssetReportError(step, msg);
  }
}

export async function downloadAssetInventoryReport(): Promise<void> {
  const { blob, filename } = await generateAssetInventoryReport();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
