/**
 * Fills the original blank SOW PDF template using pdf-lib.
 * Fields remain editable after saving.
 * Run: node scripts/fill-sow.js
 */
"use strict";

const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const path = require("path");

const TEMPLATE = "C:/Users/tyson/Downloads/NEW BLANK- Statement of Work (1).pdf";
const OUTPUT   = "C:/Users/tyson/Downloads/SOW-Veterans-Memorial-GC-Litter-Pickup-2026-05-12.pdf";

async function main() {
  const buf = fs.readFileSync(TEMPLATE);
  const pdf = await PDFDocument.load(buf);
  const form = pdf.getForm();

  // ── Helper to set a text field safely ──
  function setText(name, value) {
    try { form.getTextField(name).setText(value); }
    catch (e) { console.warn("setText failed:", name, e.message); }
  }

  function setDropdown(name, value) {
    try { form.getDropdown(name).select(value); }
    catch (e) { console.warn("setDropdown failed:", name, e.message); }
  }

  function setRadio(name, value) {
    try { form.getRadioGroup(name).select(value); }
    catch (e) { console.warn("setRadio failed:", name, e.message); }
  }

  function setCheck(name, checked) {
    try {
      const cb = form.getCheckBox(name);
      checked ? cb.check() : cb.uncheck();
    } catch (e) { console.warn("setCheck failed:", name, e.message); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Page 1 — Header
  // ─────────────────────────────────────────────────────────────────────────
  setText("Date of SOW", "12 May 2026");
  setDropdown("Select Installation", "Naval Station Great Lakes");
  setText("Activity", "Veterans Memorial Golf Course");

  // ─────────────────────────────────────────────────────────────────────────
  // 4.1 Requisition Type
  // ─────────────────────────────────────────────────────────────────────────
  setDropdown("Requisition Type", "Request Contract for Services");
  // "Other" text box — leave blank (type is not "Other")

  // ─────────────────────────────────────────────────────────────────────────
  // 4.2 Reason for Requisition
  // ─────────────────────────────────────────────────────────────────────────
  setDropdown("Reason for Requisition", "Regular/Routine Maintenance");
  // "OtherReason" text box — leave blank

  // ─────────────────────────────────────────────────────────────────────────
  // Page 2 — References / Scheduling
  // ─────────────────────────────────────────────────────────────────────────
  setRadio("Are there applicable references or instructions substantiating this request", "No");
  setText("References", "");

  setText("Start Date", "As soon as contractor is available");
  setText("Completion Date", "Same day as start date");
  setText("Hours of Operation", "Monday – Saturday: 0700–2000\nSunday: Closed");

  setDropdown("Choose and Item", "Mornings Only (0800-1200)");
  setText("Time of Service",
    "Preferred start 0700–0900. Contractor shall coordinate exact arrival time with the " +
    "Course Superintendent no later than 24 hours before mobilization."
  );

  // Services interrupted → No
  setRadio("Will the facility or program services be interrupted", "No_2");
  // Patrons in danger → No
  setRadio("Will patrons be in any danger during the service or until services are rendered", "No_3");

  // ─────────────────────────────────────────────────────────────────────────
  // 4.4 Personnel Requirements
  // ─────────────────────────────────────────────────────────────────────────
  setText("Personnel Requirements",
    "No special certifications or licenses required. Contractor personnel must wear " +
    "appropriate PPE including safety vests, gloves, and closed-toe footwear at all times " +
    "during work operations."
  );
  setRadio("Are a specific number of personnel being requested", "Yes_4");
  setText("Specific Number", "3–5");

  // ─────────────────────────────────────────────────────────────────────────
  // 4.5 Lodging — never required
  // ─────────────────────────────────────────────────────────────────────────
  setRadio("Will the contractor require lodging as part of the contract", "No_5");
  setCheck("Individual Lodging",  false);
  setCheck("Group Lodging",       false);
  setCheck("Vehicle Storage",     false);
  setCheck("Equipment Storage",   false);
  setCheck("Base Access",         false);  // not on base
  setCheck("Escort",              true);   // always required

  // ─────────────────────────────────────────────────────────────────────────
  // 4.6 Expectation
  // ─────────────────────────────────────────────────────────────────────────
  setText("Expectation",
    "The contractor shall provide a crew to perform litter and trash removal along " +
    "the entire perimeter fence line of the Veterans Memorial Golf Course property " +
    "located at 2821 Great Lakes Dr, Great Lakes, IL 60088.\n\n" +
    "The contractor shall:\n" +
    "1. Collect all trash, litter, and loose debris along both sides of the full " +
    "perimeter fence line.\n" +
    "2. Bag and contain all collected materials using contractor-furnished trash bags " +
    "and collection equipment.\n" +
    "3. Remove and dispose of all collected materials off site.\n" +
    "4. Leave all work areas clean and debris-free upon completion.\n" +
    "5. Coordinate work to avoid interference with active golf course operations " +
    "and patron safety.\n\n" +
    "Contractor shall furnish all labor, trash bags, gloves, hand tools, and " +
    "transportation for debris removal and disposal. No government-furnished equipment " +
    "will be provided."
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Contingency Plan
  // ─────────────────────────────────────────────────────────────────────────
  setRadio("Could inclement weather interrupt services to be provided If no skip to Section 6", "Yes_6");
  setRadio("or event be rescheduled in the event of inclement weather", "Yes_7");
  setText("Reschedule Date",
    "Rescheduled date to be coordinated between contractor and Course Superintendent " +
    "within 5 business days of weather cancellation."
  );
  // No amendments to base entry documents — not on base
  setRadio("Will the contractor need amendments to base entry documents", "No_8");

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Location of Service
  // ─────────────────────────────────────────────────────────────────────────
  setText("BldgNo", "Golf Course Maintenance Facility, BLDG 8400");
  setText("RoomNo", "N/A");
  setText("Specific Directions",
    "Contractor shall proceed to the Veterans Memorial Golf Course at " +
    "2821 Great Lakes Dr, Great Lakes, IL 60088. Upon arrival, the contractor " +
    "shall contact the Course Superintendent or designated representative for " +
    "escort to the work area. No special gate, base access, or government-issued " +
    "ID is required — the facility is accessible directly from the public road."
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Description of Goods (page 4)
  // ─────────────────────────────────────────────────────────────────────────
  setText("Description of Goods Requested",
    "LABOR SERVICES — LITTER AND DEBRIS REMOVAL\n" +
    "Veterans Memorial Golf Course, 2821 Great Lakes Dr, Great Lakes, IL 60088\n\n" +
    "The contractor shall furnish all labor, tools, equipment, and materials necessary " +
    "to perform litter and trash collection along the complete perimeter fence line of " +
    "the Veterans Memorial Golf Course.\n\n" +
    "SCOPE:\n" +
    "A. Walk the full perimeter fence line (interior and exterior sides) and remove " +
    "all accumulated trash, litter, and debris.\n" +
    "B. Bag all collected materials in contractor-furnished heavy-duty trash bags.\n" +
    "C. Transport and dispose of all collected debris off site.\n" +
    "D. Confirm with Course Superintendent upon completion that all designated areas " +
    "are clean and debris-free.\n\n" +
    "CONTRACTOR-FURNISHED ITEMS:\n" +
    "- All labor (minimum 3 personnel recommended)\n" +
    "- Heavy-duty trash bags\n" +
    "- PPE (safety vests, gloves, safety footwear)\n" +
    "- Hand tools (grabbers, rakes as needed)\n" +
    "- Transportation for debris removal and off-site disposal\n\n" +
    "GOVERNMENT-FURNISHED ITEMS: None.\n\n" +
    "PERIOD OF PERFORMANCE: Single event, scheduled upon contract award."
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Requestor Information (page 5)
  // ─────────────────────────────────────────────────────────────────────────
  setText("Name of Requestor", "Tyson Bruce");
  setText("Position or Title",  "Course Superintendent");
  setText("DirectPhone",        "(847) 688-4593");
  setText("CellPhone",          "");
  setText("Email",              "tysonstechsolutions@gmail.com");
  setText("Supv Name",          "Joseph Caprez");
  setText("SupvPhone",          "262-510-9514");
  // Signature and Date Signed left blank for manual completion
  setText("Date Signed", "");

  // ─────────────────────────────────────────────────────────────────────────
  // Save — keep fields editable (no flatten)
  // ─────────────────────────────────────────────────────────────────────────
  const out = await pdf.save();
  fs.writeFileSync(OUTPUT, out);
  console.log("Saved:", OUTPUT);
}

main().catch(e => { console.error(e); process.exit(1); });
