/**
 * SF-52 (Request for Personnel Action) field map.
 *
 * The office's fillable SF-52 (public/templates/sf52-form.pdf — an AES-256
 * encrypted AcroForm) is filled directly via pdf.js, so the download keeps
 * live, editable form fields exactly like an Acrobat-filled copy: the same
 * blue field highlights, and box 5's signature field stays signable with a
 * CAC in Adobe.
 *
 * Keys are our data names; values are the PDF's real field names (from the
 * form's widget annotations). Only the boxes the *requesting office* fills
 * are mapped (per the SF-52 Desk Guide and the office's own filled examples).
 * SSN/DOB, nature-of-action/legal-authority codes, Part C, and every
 * signature field are deliberately omitted — HR/N92 and the signers complete
 * those.
 */

export const SF52_FIELDS = {
  // ── Part A — Requesting Office ──────────────────────────────────────────
  actionsRequested: "ActionsReq",
  requestNumber: "RequestNumber",
  addlInfoName: "AddntlInfo",
  addlInfoPhone: "PhoneNo",
  proposedEffectiveDate: "ProposedEffectiveDate",
  actionReqBy: "ActionReqBy", // box 5 typed name/title (signature stays blank)
  reqDate: "ReqDate",
  actionAuthBy: "ActionAuthBy", // box 6 typed name/title
  authDate: "AuthDate",

  // ── Part B — identity + FROM/TO position ────────────────────────────────
  fullName: "FullName",
  /** Part B box 4. Shares one PDF field with Part E box 2 (same name). */
  effectiveDate: "EffectiveDate",

  fromPositionTitleNo: "FromPositionTitleNo",
  toPositionTitleNo: "ToPositionTitleNo",

  fromPayPlan: "PayPlan1",
  fromOccCode: "OccCode1",
  fromGrade: "GL1",
  fromStep: "STEP-RATE1",
  fromTotalSalary: "TOTALSAL1",

  toPayPlan: "PayPlan2",
  toOccCode: "OccCode2",
  toGrade: "GL2",
  toStep: "Step-Rate2",
  toTotalSalary: "TotalSal2",

  fromPositionLocation: "FromPositionLocation",
  toPositionLocation: "ToPositionLocation",

  // ── Employee / Position data (requesting-office boxes only) ─────────────
  workSchedule: "WorkSchedule",
  ptHours: "PTHours",
  flsa: "FLSA",
  appropriationCode: "AppropriationCode",
  dutyStationCode: "DutyStationCode",
  dutyStation: "DutyStation",
  vice: "Vice",

  // ── Part D — Remarks by Requesting Office (recruitments) ────────────────
  numRecruitments: "#Recruitments",
  areasOfConsideration: "AreasofConsideration",
  proposedSalaryRange: "ProposedSalaryRange",
  relocationAuth: "RelocationAuth",
  otherNotes: "OtherNotes",

  // ── Part E — Employee Resignation/Retirement ────────────────────────────
  reasonForResign: "ReasonforResignRetire",
  dateSigned: "DateSigned",
  forwardingAddress: "ForwardingAddress",

  // ── Part F — Remarks for SF 50 (other actions) ──────────────────────────
  partFRemarks: "PartF-Remarks",
} as const satisfies Record<string, string>;

export type Sf52FieldKey = keyof typeof SF52_FIELDS;

/**
 * Part D Yes/No checkboxes: "Do you know of additional or conflicting
 * reasons…?" The office's examples leave both unchecked, so these are
 * optional. pdf.js checkbox storage takes a boolean value.
 */
export const SF52_CHECKBOX_FIELDS = {
  conflictingReasonsYes: "Check#3",
  conflictingReasonsNo: "Check#4",
} as const;
