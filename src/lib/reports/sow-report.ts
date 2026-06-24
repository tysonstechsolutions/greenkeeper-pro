/**
 * Statement of Work (SOW) PDF generator.
 *
 * Reproduces the Navy FRSC SOW request form (same sections, labels, order,
 * and Courier typewriter look as the official template), but lays it out as a
 * single flowing document: content runs top-to-bottom and a page break is
 * inserted only when the next block won't fit. Fill-in boxes for the
 * AI-generated long-text sections size to their content. This avoids the
 * half-empty pages and separate "(continued)" overflow pages the old
 * one-section-per-fixed-page layout produced.
 */
import { jsPDF } from "jspdf";
import { formatLocalDate } from "@/lib/utils/date";
import { findSignatureUrl } from "@/lib/staff-signatures";

// Cache fetched signature images so re-renders / multiple SOWs in one
// session don't keep re-fetching the same PNG.
const imageCache = new Map<string, string>();

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const cached = imageCache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    imageCache.set(url, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

// ── Layout constants ──────────────────────────────────────────────────────────

const ML = 20;       // left margin (mm)
const MR = 20;       // right margin (mm)
const MT = 22;       // top margin (mm)
const FS = 9;        // body font size (pt)
const LH = 5;        // line height (mm) at 9pt Courier

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SowFormData {
  // Header
  date: string;
  from: string;
  activityName: string;

  // 4.1 Requisition Type
  requisitionType: string;

  // 4.2 Reason
  requisitionReason: string;

  // References / scheduling
  hasReferences: boolean;
  referencesText: string;
  projectedStartDate: string;
  desiredCompletionDate: string;
  facilityHours: string;
  appointmentTime: string;
  servicesInterrupted: boolean;
  patronsInDanger: boolean;

  // Personnel
  personnelCertifications: string;
  specificPersonnelRequired: boolean;
  personnelCount: string;

  // Lodging
  lodgingRequired: boolean;
  individualLodging: boolean;
  groupLodging: boolean;
  vehicleStorage: boolean;
  equipmentStorage: boolean;
  baseAccess: boolean;
  escort: boolean;

  // 4.6 Expectation (AI-generated)
  expectationText: string;

  // Contingency
  weatherInterrupt: boolean;
  rescheduleIfWeather: boolean;
  rescheduleDate: string;
  baseEntryAmendments: boolean;

  // Location
  buildingNameNumber: string;
  roomNumber: string;
  accessDirections: string;

  // Description of Goods (AI-generated)
  descriptionOfGoods: string;

  // Requestor
  requestorName: string;
  requestorTitle: string;
  directPhone: string;
  cellPhone: string;
  email: string;
  supervisorName: string;
  supervisorPhone: string;
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function contentWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth() - ML - MR;
}

/** Draw a checkbox (■ filled or □ empty) aligned with the text baseline at y. */
function drawCb(doc: jsPDF, x: number, y: number, checked: boolean): void {
  const s = 3.2;
  const cbY = y - s;
  doc.setLineWidth(0.3);
  doc.setDrawColor(0, 0, 0);
  if (checked) {
    doc.setFillColor(0, 0, 0);
    doc.rect(x, cbY, s, s, "F");
  } else {
    doc.setFillColor(255, 255, 255);
    doc.rect(x, cbY, s, s, "FD");
  }
}

/** Draw a bordered input box, optionally pre-filled with text. */
function drawBox(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  text = "",
  fontSize = 8,
): void {
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h, "FD");

  if (text.trim()) {
    doc.setFont("courier", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(0, 0, 0);
    const lines = doc.splitTextToSize(text, w - 4);
    let ty = y + fontSize * 0.35 + 1.5;
    for (const line of lines as string[]) {
      if (ty < y + h - 1) {
        doc.text(line, x + 2, ty);
        ty += fontSize * 0.35 + 1.5;
      }
    }
  }
}

/**
 * Render mixed-weight inline text (regular + bold segments) with automatic
 * word-wrap. The original FRSC form has a few paragraphs where specific
 * phrases are bolded inline — the only way to match that exactly in
 * jsPDF (which doesn't support styled runs natively) is to lay out word
 * by word, swapping the font in between.
 */
function drawRichText(
  doc: jsPDF,
  segments: Array<{ text: string; bold?: boolean }>,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  type Word = { text: string; bold: boolean; isSpace: boolean };
  const words: Word[] = [];
  for (const seg of segments) {
    const parts = seg.text.split(/(\s+)/);
    for (const p of parts) {
      if (p.length === 0) continue;
      words.push({
        text: p,
        bold: !!seg.bold,
        isSpace: /^\s+$/.test(p),
      });
    }
  }

  let curX = x;
  let curY = y;

  for (const word of words) {
    doc.setFont("courier", word.bold ? "bold" : "normal");
    const w = doc.getTextWidth(word.text);

    // Don't start a new line with a space.
    if (word.isSpace && curX === x) continue;

    // Wrap when a non-space word would overflow the right margin.
    if (!word.isSpace && curX > x && curX + w > x + maxWidth) {
      curX = x;
      curY += lineHeight;
    }

    doc.text(word.text, curX, curY);
    curX += w;
  }

  doc.setFont("courier", "normal");
  return curY;
}

/** Add page number and revision footer. */
function addFooter(doc: jsPDF, pageNum: number): void {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  doc.setFont("courier", "normal");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text(String(pageNum), pw / 2, ph - 8, { align: "center" });
  doc.text("Rev-Feb2018", pw - MR, ph - 8, { align: "right" });
}

/** Set font and size, return to caller's state via closure (simple helper). */
function body(doc: jsPDF, bold = false): void {
  doc.setFont("courier", bold ? "bold" : "normal");
  doc.setFontSize(FS);
  doc.setTextColor(0, 0, 0);
}

// ── Main generator ────────────────────────────────────────────────────────────

export async function generateSowReport(data: SowFormData): Promise<{ blob: Blob; filename: string }> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const cw = contentWidth(doc);
  const bottomLimit = ph - 16; // stay clear of the footer at ph-8

  let y = MT;
  let pageNum = 1;

  // Flow layout: close the current page (stamping its footer), then start the
  // next one. Called only when something won't fit — never on a fixed cadence.
  const newPage = () => {
    addFooter(doc, pageNum);
    pageNum++;
    doc.addPage();
    y = MT;
    body(doc);
  };
  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) newPage();
  };

  // Height a bordered box needs to show all of `text` at `fontSize`, floored
  // at `minH` so a short/empty field still reads as a fillable box. Mirrors
  // drawBox's own line stepping so nothing is clipped.
  const boxHeightFor = (text: string, fontSize: number, minH: number): number => {
    const step = fontSize * 0.35 + 1.5;
    doc.setFont("courier", "normal");
    doc.setFontSize(fontSize);
    const lines = text.trim() ? (doc.splitTextToSize(text, cw - 4) as string[]) : [];
    return Math.max(minH, lines.length * step + 3);
  };
  // Draw a content box sized to its text (breaking to a new page first if it
  // wouldn't fit), then advance past it plus a trailing gap.
  const drawContentBox = (text: string, fontSize: number, minH: number, gap = LH) => {
    const h = boxHeightFor(text, fontSize, minH);
    ensureSpace(h);
    drawBox(doc, ML, y, cw, h, text, fontSize);
    y += h + gap;
  };
  // Bold section heading kept with the start of what follows (no orphans).
  const heading = (text: string, keepWith = 14) => {
    ensureSpace(LH * 1.5 + keepWith);
    body(doc, true);
    doc.text(text, ML, y);
    body(doc);
    y += LH * 1.5;
  };
  // Normal paragraph block, kept together on one page.
  const paragraph = (text: string) => {
    body(doc);
    const lines = doc.splitTextToSize(text, cw) as string[];
    ensureSpace(lines.length * LH + LH);
    doc.text(lines, ML, y);
    y += lines.length * LH + LH;
  };

  // ── Title + header ──────────────────────────────────────────────────────
  doc.setFont("times", "normal");
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text("Statement of Work (SOW) Request", pw / 2, y + 4, { align: "center" });
  y += 14;

  body(doc);
  const labelGap = 30;

  doc.text("DATE:", ML, y);
  doc.text(data.date, ML + labelGap, y);
  y += LH * 1.5;

  doc.text("FROM:", ML, y);
  doc.text(data.from, ML + labelGap, y);
  y += LH * 1.5;

  doc.text("Activity Name:", ML, y);
  doc.text(data.activityName, ML + 37, y);
  y += LH * 1.5;

  doc.text("TO:", ML, y);
  body(doc, true);
  doc.text("FLEET READINESS SERVICE CENTER (FRSC), CONTRACTING OFFICE", ML + 16, y);
  body(doc);
  y += LH * 1.5;

  doc.text("SUBJECT:", ML, y);
  body(doc, true);
  doc.text("STATEMENT OF WORK REQUEST", ML + 24, y);
  body(doc);
  y += LH * 1.5;

  doc.text("Encl: (1) Purchase Request", ML, y);
  y += LH * 2;

  // 1. BACKGROUND
  heading("1.  BACKGROUND");
  paragraph(
    "The mission of the N9 Fleet & Family Readiness is to provide a varied program of\n" +
    "wholesome and constructive off-duty recreation activities for Navy personnel and\n" +
    "their family members which will effectively contribute to the mental, physical,\n" +
    "social and educational enrichment of participants.",
  );

  // 2. SCOPE
  heading("2.  SCOPE");
  paragraph(
    "The contractor requested shall provide all services required to perform the\n" +
    "work described in this SOW. The contractor shall provide these services according\n" +
    "to the specifications contained herein and in accordance with the publications\n" +
    "listed below.",
  );

  // 3. APPLICABLE DOCUMENTS
  heading("3.  APPLICABLE DOCUMENTS");
  paragraph(
    "The following documents are instrumental to performing this contract. This list is not\n" +
    "all inclusive. The most recent version of these documents in effect as of the time\n" +
    "of contract award will apply.",
  );
  ensureSpace(LH * 2 + LH);
  body(doc, true);
  doc.text("3.1  CNICINST 1710.3", ML, y);
  y += LH;
  doc.text("3.2  CNICINST 7043.1", ML, y);
  body(doc);
  y += LH * 2;

  // 4. REQUIREMENTS
  heading("4.  REQUIREMENTS");

  // 4.1 REQUISITION TYPE — the selected value prints under the heading; the
  // box below is only for an "Other" override.
  const REQ_TYPE_STANDARD = [
    "New Procurement",
    "Re-order",
    "Renewal",
    "Non-Personal Services Contract",
  ];
  const typeIsOther = !!data.requisitionType && !REQ_TYPE_STANDARD.includes(data.requisitionType);
  const typeDisplay = typeIsOther ? "Other" : data.requisitionType;
  heading("4.1  REQUISITION TYPE", 24);
  if (typeDisplay) doc.text(typeDisplay, ML, y);
  y += LH * 1.5;
  doc.text("If other is chosen, list type below:", ML, y);
  y += LH;
  drawContentBox(typeIsOther ? data.requisitionType : "", 8, 12);

  // 4.2 REASON FOR REQUISITION — same pattern as 4.1.
  const REQ_REASON_STANDARD = [
    "New Requirement",
    "Replacement",
    "Additional Quantity",
    "Enhancement/Upgrade",
  ];
  const reasonIsOther =
    !!data.requisitionReason && !REQ_REASON_STANDARD.includes(data.requisitionReason);
  const reasonDisplay = reasonIsOther ? "Other" : data.requisitionReason;
  heading("4.2  REASON FOR REQUISITION", 24);
  if (reasonDisplay) doc.text(reasonDisplay, ML, y);
  y += LH * 1.5;
  doc.text(" If other is chosen, list the reason below:", ML, y);
  y += LH;
  drawContentBox(reasonIsOther ? data.requisitionReason : "", 8, 12);

  // References / instructions
  ensureSpace(LH * 2.5);
  doc.text("Are there applicable references or instructions substantiating this request?", ML, y);
  y += LH;
  drawCb(doc, ML, y, data.hasReferences);
  doc.text("Yes", ML + 4.5, y);
  drawCb(doc, ML + 18, y, !data.hasReferences);
  doc.text("No", ML + 22.5, y);
  y += LH * 1.5;

  doc.text("If Yes, what are the references or instructions?", ML, y);
  y += LH;
  drawContentBox(data.hasReferences ? data.referencesText : "", 8, 14);

  // Scheduling
  ensureSpace(LH * 3);
  doc.text(`Projected Start Date:  ${data.projectedStartDate}`, ML, y);
  y += LH * 1.5;
  doc.text(`Desired Completion Date:  ${data.desiredCompletionDate}`, ML, y);
  y += LH * 1.5;

  doc.text("Facility or Program Hours of Operation:", ML, y);
  y += LH;
  drawContentBox(data.facilityHours, 8, 12);

  doc.text("Requested Appointment and Suggested Time of Service or Delivery:", ML, y);
  y += LH * 1.5;

  const apptStandard = [
    "Standard hours",
    "Before opening",
    "After closing",
    "Weekdays only",
    "Weekends only",
  ];
  const apptIsOther = !!data.appointmentTime && !apptStandard.includes(data.appointmentTime);
  const apptDisplay = apptIsOther ? "Other" : data.appointmentTime;
  if (apptDisplay) doc.text(apptDisplay, ML, y);
  y += LH * 1.5;

  doc.text("If other is chosen, list suggested time of service or delivery below:", ML, y);
  y += LH;
  drawContentBox(apptIsOther ? data.appointmentTime : "", 8, 12, LH * 1.5);

  // Services interrupted
  ensureSpace(LH * 4.5);
  const siLabelW = 115;
  doc.text("Will the facility or program services be interrupted?", ML, y);
  drawCb(doc, ML + siLabelW, y, data.servicesInterrupted);
  doc.text("Yes", ML + siLabelW + 4.5, y);
  drawCb(doc, ML + siLabelW + 18, y, !data.servicesInterrupted);
  doc.text("No", ML + siLabelW + 22.5, y);
  y += LH * 1.5;

  const dangerText =
    "Will patrons be in any danger during the service or until services are rendered?";
  doc.text(dangerText, ML, y);
  y += LH;
  drawCb(doc, ML, y, data.patronsInDanger);
  doc.text("Yes", ML + 4.5, y);
  drawCb(doc, ML + 18, y, !data.patronsInDanger);
  doc.text("No", ML + 22.5, y);
  y += LH * 2;

  // 4.4 MINIMUM PERSONNEL REQUIREMENTS
  heading("4.4  MINIMUM PERSONNEL REQUIREMENTS", 28);
  paragraph(
    "Please list below the minimum certifications, licenses or special skills the\n" +
    "contractor(s) should have prior to a contract being awarded. If these are a requirement\n" +
    "per official program requirements, disclose the referenced material.",
  );
  drawContentBox(data.personnelCertifications, 8, 14, LH * 1.5);

  ensureSpace(LH * 3.5);
  const spLabelW = 118;
  doc.text("Are a specific number of personnel being requested?", ML, y);
  drawCb(doc, ML + spLabelW, y, data.specificPersonnelRequired);
  doc.text("Yes", ML + spLabelW + 4.5, y);
  drawCb(doc, ML + spLabelW + 18, y, !data.specificPersonnelRequired);
  doc.text("No", ML + spLabelW + 22.5, y);
  y += LH * 1.5;

  doc.text("If Yes, provide the specific number necessary:", ML, y);
  drawBox(doc, ML + 105, y - 4, 25, 7, data.specificPersonnelRequired ? data.personnelCount : "");
  y += LH * 2;

  // 4.5 LODGING REQUIREMENT
  heading("4.5  LODGING REQUIREMENT", 28);
  doc.text("Will the contractor require lodging as part of the contract?", ML, y);
  y += LH;
  drawCb(doc, ML, y, data.lodgingRequired);
  doc.text("Yes", ML + 4.5, y);
  drawCb(doc, ML + 18, y, !data.lodgingRequired);
  doc.text("No", ML + 22.5, y);
  y += LH * 2;

  paragraph(
    "Please select all that will apply to this contract. If special requests are made after\n" +
    "the award of the contract, contact the FRSC for approval.",
  );

  ensureSpace(LH * 3.5);
  const col2X = ML + cw / 2;
  drawCb(doc, ML, y, data.individualLodging);
  doc.text("Individual Lodging", ML + 4.5, y);
  drawCb(doc, col2X, y, data.groupLodging);
  doc.text("Group Lodging", col2X + 4.5, y);
  y += LH;

  drawCb(doc, ML, y, data.vehicleStorage);
  doc.text("Vehicle Storage", ML + 4.5, y);
  drawCb(doc, col2X, y, data.equipmentStorage);
  doc.text("Equipment Storage", col2X + 4.5, y);
  y += LH;

  drawCb(doc, ML, y, data.baseAccess);
  doc.text("Base Access", ML + 4.5, y);
  drawCb(doc, col2X, y, data.escort);
  doc.text("Escort", col2X + 4.5, y);
  y += LH * 2;

  // 4.6 EXPECTATION
  heading("4.6  EXPECTATION", 30);
  // 4.6 intro paragraph with the same inline bold runs as the FRSC form:
  // "specific duties", "i.e.", and "Be detailed and specific." are bold.
  ensureSpace(LH * 7);
  const expIntroEndY = drawRichText(
    doc,
    [
      { text: "In the area provided, please list a complete list of " },
      { text: "specific duties", bold: true },
      { text: " the contractor will be required to perform. " },
      { text: "i.e.", bold: true },
      {
        text:
          " perform lifeguard services, remove old self-service pumps, install two self-service pump stations at specific locations and dispose of old materials and equipment, order and install sails and jibs for the Sailing Center, located at... If additional space is required please attach separate documentation with outlined duties. ",
      },
      { text: "Be detailed and specific.", bold: true },
    ],
    ML,
    y,
    cw,
    LH,
  );
  y = expIntroEndY + LH * 2;
  drawContentBox(data.expectationText, 8, 18);

  // 5. CONTINGENCY PLAN
  heading("5.  CONTINGENCY PLAN", 26);
  paragraph(
    "In the event of inclement weather or unforeseen circumstances that affect or interrupt\n" +
    "services requested or event dates, the program or facility will have a contingency plan\n" +
    "in place to be agreed upon with the contractor.",
  );

  ensureSpace(LH * 2.5);
  doc.text("Could inclement weather interrupt services to be provided? If no, skip to Section 6.", ML, y);
  y += LH;
  drawCb(doc, ML, y, data.weatherInterrupt);
  doc.text("Yes", ML + 4.5, y);
  drawCb(doc, ML + 18, y, !data.weatherInterrupt);
  doc.text("No", ML + 22.5, y);
  y += LH * 1.5;

  const reschedText =
    "If lodging will be awarded or arranged within the contract, will the date of service\n" +
    "or event be rescheduled in the event of inclement weather?";
  const reschedLines = doc.splitTextToSize(reschedText, cw) as string[];
  ensureSpace(reschedLines.length * LH + LH * 2);
  doc.text(reschedLines, ML, y);
  y += reschedLines.length * LH;
  drawCb(doc, ML, y, data.rescheduleIfWeather);
  doc.text("Yes", ML + 4.5, y);
  drawCb(doc, ML + 18, y, !data.rescheduleIfWeather);
  doc.text("No", ML + 22.5, y);
  y += LH * 1.5;

  doc.text("What is/are the proposed reschedule date(s)?", ML, y);
  y += LH;
  drawContentBox(data.rescheduleDate, 8, 10);

  ensureSpace(LH * 2.5);
  doc.text("Will the contractor need amendments to base entry documents?", ML, y);
  y += LH;
  drawCb(doc, ML, y, data.baseEntryAmendments);
  doc.text("Yes", ML + 4.5, y);
  drawCb(doc, ML + 18, y, !data.baseEntryAmendments);
  doc.text("No", ML + 22.5, y);
  y += LH * 2;

  // 6. LOCATION OF SERVICE
  heading("6.  LOCATION OF SERVICE", 16);
  doc.text(`What is the building name and number?  ${data.buildingNameNumber}`, ML, y);
  y += LH * 2;
  doc.text(`Room Number?  ${data.roomNumber}`, ML, y);
  y += LH * 2;

  // Access directions
  paragraph(
    "Specific directions for initial contact. (i.e. who should the contractor ask for upon\n" +
    "arrival to the site, will the contractor have to utilize a specific gate, will the\n" +
    "contractor need an escort to the area requesting services?) If no specific instructions,\n" +
    "write N/A.",
  );
  drawContentBox(data.accessDirections, 8, 14, LH * 2);

  // Description of Goods
  ensureSpace(LH * 3 + 20);
  body(doc, true);
  doc.text("Description of Goods Requested (Ref 4.1):", ML, y);
  doc.setFont("courier", "italic");
  doc.setFontSize(8);
  doc.text("(attach additional pages if needed)", ML, y + LH);
  body(doc);
  y += LH * 2.5;
  drawContentBox(data.descriptionOfGoods, 8, 18);

  // 7. REQUESTOR INFORMATION — keep the whole block (through the signature)
  // together on one page.
  ensureSpace(78);
  heading("7.  REQUESTOR INFORMATION", 60);
  y += LH * 1.5;

  const fieldBoxW = cw * 0.58;

  doc.text("Name of Requestor:", ML, y);
  drawBox(doc, ML + 52, y - 4, fieldBoxW, 7, data.requestorName, 9);
  y += LH * 2.5;

  doc.text("Position or Title:", ML, y);
  drawBox(doc, ML + 52, y - 4, fieldBoxW, 7, data.requestorTitle, 9);
  y += LH * 2.5;

  doc.text(`Direct Phone Number:  ${data.directPhone}`, ML, y);
  doc.text(`Cell Phone Number:  ${data.cellPhone}`, ML + 90, y);
  y += LH * 2;

  doc.text(`Email:  ${data.email}`, ML, y);
  y += LH * 2;

  doc.text("Supervisor Name:", ML, y);
  drawBox(doc, ML + 47, y - 4, fieldBoxW, 7, data.supervisorName, 9);
  y += LH * 2.5;

  doc.text("Supervisor Direct Phone Number:", ML, y);
  drawBox(doc, ML + 82, y - 4, 50, 7, data.supervisorPhone, 9);
  y += LH * 2.5;

  doc.text("Signature of Requestor:", ML, y);
  drawBox(doc, ML + 62, y - 4, cw - 62, 7, "", 9);

  // Overlay the requestor's signature image (if mapped in staff-signatures.ts)
  const sigUrl = findSignatureUrl(data.requestorName);
  if (sigUrl) {
    try {
      const dataUrl = await loadImageAsDataUrl(sigUrl);
      if (dataUrl) {
        // ~55mm wide, ~12mm tall; bottom-aligned to the signature line so it
        // looks like the requestor signed on top of the printed box.
        const sigW = 55;
        const sigH = 12;
        doc.addImage(
          dataUrl,
          "PNG",
          ML + 64,
          y + 3 - sigH,
          sigW,
          sigH,
          undefined,
          "FAST",
        );
      }
    } catch (err) {
      console.warn(
        "[sow-report] signature image failed to load:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  y += LH * 2.5;

  doc.text("Date Signed: ", ML, y);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(ML + 32, y, ML + 95, y);
  // Stamp today's date next to the line so the form is fully complete.
  doc.text(data.date, ML + 34, y - 1);

  // Footer for the final page.
  addFooter(doc, pageNum);

  // ── Output ──────────────────────────────────────────────────────────────────
  const blob = doc.output("blob") as Blob;
  const today = new Date();
  const dateStr = formatLocalDate(today);
  const safeName = (data.activityName || "SOW")
    .replace(/[^a-zA-Z0-9-_\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 30);
  const filename = `SOW-${safeName}-${dateStr}.pdf`;

  return { blob, filename };
}

export async function downloadSowReport(data: SowFormData): Promise<void> {
  const { blob, filename } = await generateSowReport(data);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
