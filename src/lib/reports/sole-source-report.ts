/**
 * Sole Source justification PDF generator.
 *
 * Fills the official FRSC Sole Source template (stored at
 * /public/templates/sole-source-template.pdf) using pdf-lib.
 * All form fields remain editable after saving.
 */
import { PDFDocument } from "pdf-lib";
import { formatLocalDate } from "@/lib/utils/date";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SoleSourceData {
  // Header
  requestingActivity: string;
  requiringActivity: string;
  requestingInstallation: string;
  date: string;

  // Item / service
  estimatedCost: string;
  requiredDeliveryDate: string;
  description: string;
  additionalDescription: string;

  // Justification
  marketResearch: string;
  equipmentId: string;
  hasProprietary: "Yes" | "No";
  proprietaryData: string;
  equipmentOther: string;

  // Contractor (from selected vendor)
  contractorName: string;
  contractorAddress: string;
  contractorCityStateZip: string;
  contractorPoc: string;
  contractorPhone: string;
  contractorEmail: string;

  // Manufacturer info (optional)
  manufacturerName: string;
  manufacturerPoc: string;
  manufacturerPhone: string;
  manufacturerEmail: string;
  manufacturerAddress: string;
  manufacturerAddress1: string;

  // Requestor
  requestorName: string;
}

// ── Generator ─────────────────────────────────────────────────────────────────

export async function generateSoleSourceReport(
  data: SoleSourceData,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch("/templates/sole-source-template.pdf");
  if (!response.ok) throw new Error("Could not load sole source template");
  const arrayBuffer = await response.arrayBuffer();

  const pdf = await PDFDocument.load(arrayBuffer);
  const form = pdf.getForm();

  function setText(name: string, value: string) {
    try { form.getTextField(name).setText(value); }
    catch { /* field may not exist in all versions */ }
  }

  function setDropdown(name: string, value: string) {
    try { form.getDropdown(name).select(value); }
    catch { /* ignore */ }
  }

  // Header
  setText("Requesting Activity",     data.requestingActivity);
  setText("Requiring Activity",      data.requiringActivity);
  setText("Requesting Installation", data.requestingInstallation);
  setText("Date",                    data.date);
  setText("Requested Date",          data.date);

  // Item / service
  setText("2 Estimated cost of the requirement", data.estimatedCost);
  setText("2a Required Delivery Date",            data.requiredDeliveryDate);
  setText("3 Description of the item or service required", data.description);
  setText("etc",                                  data.additionalDescription);

  // Justification
  setText("the results of any supporting market research as appropriate", data.marketResearch);
  setText("equipment",                            data.equipmentId);
  setDropdown("Yes/No",                           data.hasProprietary);
  setText("If yes list the proprietary data",     data.proprietaryData);
  setText("equipment_2",                          data.equipmentOther || "N/A");

  // Contractor
  setText("Text9",  data.contractorName);
  setText("Text10", data.contractorAddress);
  setText("Text11", data.contractorCityStateZip);
  setText("Text12", data.contractorPoc);
  setText("Text13", data.contractorPhone);
  setText("Text14", data.contractorEmail);

  // Manufacturer (optional)
  setText("Manufacturer Name",     data.manufacturerName);
  setText("Manufacturer POC",      data.manufacturerPoc);
  setText("Manufacturer Phone",    data.manufacturerPhone);
  setText("Manufacturer Email",    data.manufacturerEmail);
  setText("Manufacturer Address0", data.manufacturerAddress);
  setText("Manufacturer Address1", data.manufacturerAddress1);

  // Requestor
  setText("Requestor Printed Name",        data.requestorName);
  setText("Contracting Officers Printed Name", "");
  setText("Approval Date", "");

  const bytes = await pdf.save();
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });

  const today = new Date();
  const dateStr = formatLocalDate(today);
  const safeName = (data.contractorName || "Sole-Source")
    .replace(/[^a-zA-Z0-9-_\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 30);
  const filename = `SoleSource-${safeName}-${dateStr}.pdf`;

  return { blob, filename };
}

export async function downloadSoleSourceReport(data: SoleSourceData): Promise<void> {
  const { blob, filename } = await generateSoleSourceReport(data);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
