import { describe, it, expect } from "vitest";
import { generateSowReport, type SowFormData } from "@/lib/reports/sow-report";

const sample: SowFormData = {
  date: "06/24/2026",
  from: "Tyson Bruce, Course Superintendent, Veterans Memorial Golf Course",
  activityName: "Veterans Memorial Golf Course",
  requisitionType: "New Procurement",
  requisitionReason: "New Requirement",
  hasReferences: false,
  referencesText: "",
  projectedStartDate: "2026-07-01",
  desiredCompletionDate: "2026-07-15",
  facilityHours: "Open daily, including Sundays and holidays: 0700-2000",
  appointmentTime: "",
  servicesInterrupted: false,
  patronsInDanger: false,
  personnelCertifications:
    "Contractor shall hold a valid Illinois irrigation contractor license and provide proof of general liability insurance.",
  specificPersonnelRequired: false,
  personnelCount: "",
  lodgingRequired: false,
  individualLodging: false,
  groupLodging: false,
  vehicleStorage: false,
  equipmentStorage: false,
  baseAccess: false,
  escort: true,
  expectationText:
    "1. The contractor shall mobilize to the site and coordinate the start of work with the COR.\n" +
    "2. The contractor shall furnish all labor, materials, and equipment to replace the failed irrigation pump and two control valves.\n" +
    "3. The contractor shall comply with all applicable OSHA and Navy safety requirements.\n" +
    "4. The contractor shall remove and dispose of all old materials and debris, leaving the site clean.\n" +
    "5. The contractor shall provide completion documentation to the COR.",
  weatherInterrupt: false,
  rescheduleIfWeather: false,
  rescheduleDate: "",
  baseEntryAmendments: false,
  buildingNameNumber: "Golf Course Maintenance Facility, BLDG 8400",
  roomNumber: "",
  accessDirections:
    "Contractor shall proceed to the Veterans Memorial Golf Course and report to the Course Superintendent for escort to the work area. No base access or government-issued ID is required.",
  descriptionOfGoods:
    "This procurement provides one replacement irrigation pump and two control valves for the course irrigation system, including installation and testing.",
  requestorName: "Tyson Bruce",
  requestorTitle: "Course Superintendent",
  directPhone: "847-555-0123",
  cellPhone: "",
  email: "tyson@vmgc.app",
  supervisorName: "Tyson Bruce",
  supervisorPhone: "847-555-0123",
};

describe("generateSowReport", () => {
  it("produces a valid, tight PDF without overflow pages", async () => {
    const { blob, filename } = await generateSowReport(sample);
    const buf = Buffer.from(await blob.arrayBuffer());
    const s = buf.toString("latin1");

    expect(s.startsWith("%PDF")).toBe(true);
    expect(filename).toMatch(/^SOW-.*\.pdf$/);

    // The flow layout keeps the whole FRSC form to a handful of pages. This
    // guards against a regression that reintroduces the old fixed
    // one-section-per-page layout or separate "(continued)" overflow pages.
    const pages = (s.match(/\/Type\s*\/Page(?![s])/g) || []).length;
    expect(pages).toBeGreaterThan(0);
    expect(pages).toBeLessThanOrEqual(5);
  });
});
