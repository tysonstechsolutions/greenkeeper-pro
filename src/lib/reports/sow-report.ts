/**
 * Statement of Work (SOW) PDF generator.
 *
 * Recreates the 5-page Navy FRSC SOW request form to match the original
 * template exactly. Uses jsPDF with Courier monospace font throughout to
 * match the typewriter-style government form layout.
 */
import { jsPDF } from "jspdf";
import { formatLocalDate } from "@/lib/utils/date";

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

export function generateSowReport(data: SowFormData): { blob: Blob; filename: string } {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pw = doc.internal.pageSize.getWidth();
  const cw = contentWidth(doc);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 1
  // ═══════════════════════════════════════════════════════════════════════════
  let y = MT;

  // Title
  doc.setFont("times", "normal");
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text("Statement of Work (SOW) Request", pw / 2, y + 4, { align: "center" });
  y += 14;

  // Header fields
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
  doc.text("1.  BACKGROUND", ML, y);
  y += LH * 1.5;

  const bgText =
    "The mission of the N9 Fleet & Family Readiness is to provide a varied program of\n" +
    "wholesome and constructive off-duty recreation activities for Navy personnel and\n" +
    "their family members which will effectively contribute to the mental, physical,\n" +
    "social and educational enrichment of participants.";
  const bgLines = doc.splitTextToSize(bgText, cw);
  doc.text(bgLines, ML, y);
  y += bgLines.length * LH + LH;

  // 2. SCOPE
  body(doc, true);
  doc.text("2.  SCOPE", ML, y);
  body(doc);
  y += LH * 1.5;

  const scopeText =
    "The contractor requested shall provide all services required to perform the\n" +
    "work described in this SOW. The contractor shall provide these services according\n" +
    "to the specifications contained herein and in accordance with the publications\n" +
    "listed below.";
  const scopeLines = doc.splitTextToSize(scopeText, cw);
  doc.text(scopeLines, ML, y);
  y += scopeLines.length * LH + LH;

  // 3. APPLICABLE DOCUMENTS
  body(doc, true);
  doc.text("3.  APPLICABLE DOCUMENTS", ML, y);
  body(doc);
  y += LH * 1.5;

  const appDocText =
    "The following documents are instrumental to performing this contract. This list is not\n" +
    "all inclusive. The most recent version of these documents in effect as of the time\n" +
    "of contract award will apply.";
  const appDocLines = doc.splitTextToSize(appDocText, cw);
  doc.text(appDocLines, ML, y);
  y += appDocLines.length * LH + LH;

  body(doc, true);
  doc.text("3.1  CNICINST 1710.3", ML, y);
  y += LH;
  doc.text("3.2  CNICINST 7043.1", ML, y);
  body(doc);
  y += LH * 2;

  // 4. REQUIREMENTS
  body(doc, true);
  doc.text("4.  REQUIREMENTS", ML, y);
  body(doc);
  y += LH * 1.5;

  // 4.1 REQUISITION TYPE
  body(doc, true);
  doc.text("4.1  REQUISITION TYPE", ML, y);
  body(doc);
  y += LH * 1.5;

  doc.text("If other is chosen, list type below:", ML, y);
  y += LH;

  const typeBoxH = 12;
  drawBox(doc, ML, y, cw, typeBoxH, data.requisitionType);
  y += typeBoxH + LH;

  // 4.2 REASON FOR REQUISITION
  body(doc, true);
  doc.text("4.2  REASON FOR REQUISITION", ML, y);
  body(doc);
  y += LH * 1.5;

  doc.text(" If other is chosen, list the reason below:", ML, y);
  y += LH;

  const reasonBoxH = 12;
  drawBox(doc, ML, y, cw, reasonBoxH, data.requisitionReason);

  addFooter(doc, 1);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 2
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = MT;
  body(doc);

  doc.text("Are there applicable references or instructions substantiating this request?", ML, y);
  y += LH;
  drawCb(doc, ML, y, data.hasReferences);
  doc.text("Yes", ML + 4.5, y);
  drawCb(doc, ML + 18, y, !data.hasReferences);
  doc.text("No", ML + 22.5, y);
  y += LH * 1.5;

  doc.text("If Yes, what are the references or instructions?", ML, y);
  y += LH;

  const refBoxH = 18;
  drawBox(doc, ML, y, cw, refBoxH, data.hasReferences ? data.referencesText : "");
  y += refBoxH + LH;

  doc.text(`Projected Start Date:  ${data.projectedStartDate}`, ML, y);
  y += LH * 1.5;

  doc.text(`Desired Completion Date:  ${data.desiredCompletionDate}`, ML, y);
  y += LH * 1.5;

  doc.text("Facility or Program Hours of Operation:", ML, y);
  y += LH;

  const hoursBoxH = 12;
  drawBox(doc, ML, y, cw, hoursBoxH, data.facilityHours);
  y += hoursBoxH + LH;

  doc.text("Requested Appointment and Suggested Time of Service or Delivery:", ML, y);
  y += LH * 2;

  doc.text("If other is chosen, list suggested time of service or delivery below:", ML, y);
  y += LH;

  const apptBoxH = 12;
  drawBox(doc, ML, y, cw, apptBoxH, data.appointmentTime);
  y += apptBoxH + LH * 1.5;

  // Services interrupted
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
  body(doc, true);
  doc.text("4.4  MINIMUM PERSONNEL REQUIREMENTS", ML, y);
  body(doc);
  y += LH * 1.5;

  const mpText =
    "Please list below the minimum certifications, licenses or special skills the\n" +
    "contractor(s) should have prior to a contract being awarded. If these are a requirement\n" +
    "per official program requirements, disclose the referenced material.";
  const mpLines = doc.splitTextToSize(mpText, cw);
  doc.text(mpLines, ML, y);
  y += mpLines.length * LH + LH;

  const personnelBoxH = 22;
  drawBox(doc, ML, y, cw, personnelBoxH, data.personnelCertifications);
  y += personnelBoxH + LH * 1.5;

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
  body(doc, true);
  doc.text("4.5  LODGING REQUIREMENT", ML, y);
  body(doc);
  y += LH * 1.5;

  doc.text("Will the contractor require lodging as part of the contract?", ML, y);
  y += LH;
  drawCb(doc, ML, y, data.lodgingRequired);
  doc.text("Yes", ML + 4.5, y);
  drawCb(doc, ML + 18, y, !data.lodgingRequired);
  doc.text("No", ML + 22.5, y);

  addFooter(doc, 2);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 3
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = MT;
  body(doc);

  const lodgIntroText =
    "Please select all that will apply to this contract. If special requests are made after\n" +
    "the award of the contract, contact the FRSC for approval.";
  const lodgIntroLines = doc.splitTextToSize(lodgIntroText, cw);
  doc.text(lodgIntroLines, ML, y);
  y += lodgIntroLines.length * LH + LH;

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
  body(doc, true);
  doc.text("4.6  EXPECTATION", ML, y);
  body(doc);
  y += LH * 1.5;

  const expIntroText =
    "In the area provided, please list a complete list of specific duties the contractor\n" +
    "will be required to perform. i.e. perform lifeguard services, remove old self-service\n" +
    "pumps, install two self-service pump stations at specific locations and dispose of old\n" +
    "materials and equipment, order and install sails and jibs for the Sailing Center,\n" +
    "located at... If additional space is required please attach separate documentation with\n" +
    "outlined duties. Be detailed and specific.";
  const expIntroLines = doc.splitTextToSize(expIntroText, cw);
  doc.text(expIntroLines, ML, y);
  y += expIntroLines.length * LH + LH;

  const expectBoxH = 52;
  drawBox(doc, ML, y, cw, expectBoxH, data.expectationText, 8);
  y += expectBoxH + LH;

  // 5. CONTINGENCY PLAN
  body(doc, true);
  doc.text("5.  CONTINGENCY PLAN", ML, y);
  body(doc);
  y += LH * 1.5;

  const contText =
    "In the event of inclement weather or unforeseen circumstances that affect or interrupt\n" +
    "services requested or event dates, the program or facility will have a contingency plan\n" +
    "in place to be agreed upon with the contractor.";
  const contLines = doc.splitTextToSize(contText, cw);
  doc.text(contLines, ML, y);
  y += contLines.length * LH + LH;

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
  const reschedLines = doc.splitTextToSize(reschedText, cw);
  doc.text(reschedLines, ML, y);
  y += reschedLines.length * LH;
  drawCb(doc, ML, y, data.rescheduleIfWeather);
  doc.text("Yes", ML + 4.5, y);
  drawCb(doc, ML + 18, y, !data.rescheduleIfWeather);
  doc.text("No", ML + 22.5, y);
  y += LH * 1.5;

  doc.text("What is/are the proposed reschedule date(s)?", ML, y);
  y += LH;
  const reschedBoxH = 10;
  drawBox(doc, ML, y, cw, reschedBoxH, data.rescheduleDate);
  y += reschedBoxH + LH;

  doc.text("Will the contractor need amendments to base entry documents?", ML, y);
  y += LH;
  drawCb(doc, ML, y, data.baseEntryAmendments);
  doc.text("Yes", ML + 4.5, y);
  drawCb(doc, ML + 18, y, !data.baseEntryAmendments);
  doc.text("No", ML + 22.5, y);
  y += LH * 2;

  // 6. LOCATION OF SERVICE
  body(doc, true);
  doc.text("6.  LOCATION OF SERVICE", ML, y);
  body(doc);
  y += LH * 1.5;

  doc.text(`What is the building name and number?  ${data.buildingNameNumber}`, ML, y);
  y += LH * 2;

  doc.text(`Room Number?  ${data.roomNumber}`, ML, y);

  addFooter(doc, 3);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 4
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = MT;
  body(doc);

  const accessText =
    "Specific directions for initial contact. (i.e. who should the contractor ask for upon\n" +
    "arrival to the site, will the contractor have to utilize a specific gate, will the\n" +
    "contractor need an escort to the area requesting services?) If no specific instructions,\n" +
    "write N/A.";
  const accessLines = doc.splitTextToSize(accessText, cw);
  doc.text(accessLines, ML, y);
  y += accessLines.length * LH + LH;

  const accessBoxH = 25;
  drawBox(doc, ML, y, cw, accessBoxH, data.accessDirections);
  y += accessBoxH + LH * 2;

  body(doc, true);
  doc.text("Description of Goods Requested (Ref 4.1):", ML, y);
  body(doc);
  doc.setFontSize(8);
  doc.text("(attach additional pages if needed)", ML, y + LH);
  body(doc);
  y += LH * 2.5;

  const ph = doc.internal.pageSize.getHeight();
  const goodsBoxH = ph - y - 20;
  drawBox(doc, ML, y, cw, goodsBoxH, data.descriptionOfGoods, 8);

  addFooter(doc, 4);

  // ═══════════════════════════════════════════════════════════════════════════
  // PAGE 5
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  y = MT;
  body(doc);

  body(doc, true);
  doc.text("7.  REQUESTOR INFORMATION", ML, y);
  body(doc);
  y += LH * 3;

  const fieldBoxW = cw * 0.58;

  // Name of Requestor
  doc.text("Name of Requestor:", ML, y);
  drawBox(doc, ML + 52, y - 4, fieldBoxW, 7, data.requestorName, 9);
  y += LH * 2.5;

  // Position or Title
  doc.text("Position or Title:", ML, y);
  drawBox(doc, ML + 52, y - 4, fieldBoxW, 7, data.requestorTitle, 9);
  y += LH * 2.5;

  // Phone numbers
  doc.text(`Direct Phone Number:  ${data.directPhone}`, ML, y);
  doc.text(`Cell Phone Number:  ${data.cellPhone}`, ML + 90, y);
  y += LH * 2;

  doc.text(`Email:  ${data.email}`, ML, y);
  y += LH * 2;

  // Supervisor Name
  doc.text("Supervisor Name:", ML, y);
  drawBox(doc, ML + 47, y - 4, fieldBoxW, 7, data.supervisorName, 9);
  y += LH * 2.5;

  // Supervisor Phone
  doc.text("Supervisor Direct Phone Number:", ML, y);
  drawBox(doc, ML + 82, y - 4, 50, 7, data.supervisorPhone, 9);
  y += LH * 2.5;

  // Signature
  doc.text("Signature of Requestor:", ML, y);
  drawBox(doc, ML + 62, y - 4, cw - 62, 7, "", 9);
  y += LH * 2.5;

  // Date Signed
  doc.text("Date Signed: ", ML, y);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(ML + 32, y, ML + 95, y);

  addFooter(doc, 5);

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
  const { blob, filename } = generateSowReport(data);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
