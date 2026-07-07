/**
 * SF-52 personnel-action catalog + the mapping from an employee record +
 * a few typed-in fields to the filled form (Sf52Data).
 *
 * Per the SF-52 Desk Guide each action drives which side of Part B is filled
 * (FROM = current position, TO = new position) and which extra section is used
 * (D = recruitment, E = resignation, F = remarks for everything else).
 * Formatting conventions (dates, name commas, plain titles) follow the
 * office's own filled SF-52s.
 */
import type { PersonnelDetails } from "@/types/database";
import type { Sf52Data } from "@/lib/reports/sf52-report";
import { SF52_FACILITY } from "./constants";

export type Sf52Extra = "D" | "E" | "F" | "none";

export interface Sf52ActionDef {
  key: string;
  label: string;
  /** Default Part A box-1 text ("Actions Requested"). */
  box1: string;
  /** Fill the FROM (current) position from the employee record. */
  fillFrom: boolean;
  /** Fill the TO (new) position from the editable "new values" inputs. */
  fillTo: boolean;
  extra: Sf52Extra;
  /** Recruitment: the departing employee's name goes in box 43 ("Vice"). */
  usesVice?: boolean;
  effectiveDateHint: string;
}

export const SF52_ACTIONS: Sf52ActionDef[] = [
  { key: "recruitment", label: "Recruitment (fill a vacancy)", box1: "Recruitment", fillFrom: false, fillTo: true, extra: "D", usesVice: true, effectiveDateHint: "Start of the next pay period" },
  { key: "resignation", label: "Resignation", box1: "Resignation", fillFrom: true, fillTo: false, extra: "E", effectiveDateHint: "Employee's last day of work" },
  { key: "pay_increase", label: "Pay Increase", box1: "Pay Increase", fillFrom: true, fillTo: true, extra: "F", effectiveDateHint: "Start of the next pay period" },
  { key: "temp_promote", label: "Temporary Promotion", box1: "Temporary Promotion", fillFrom: true, fillTo: true, extra: "F", effectiveDateHint: "Start of the next pay period" },
  { key: "term_temp_promote", label: "Termination of Temp Promotion", box1: "Termination of Temporary Promotion", fillFrom: true, fillTo: true, extra: "F", effectiveDateHint: "Start of the next pay period" },
  { key: "transfer", label: "Transfer", box1: "Transfer", fillFrom: true, fillTo: true, extra: "F", effectiveDateHint: "Start of the next pay period" },
  { key: "lwop", label: "Leave Without Pay (LWOP)", box1: "Leave Without Pay (LWOP)", fillFrom: true, fillTo: true, extra: "F", effectiveDateHint: "First day of LWOP" },
  { key: "return_to_duty", label: "Return to Duty", box1: "Return to Duty", fillFrom: true, fillTo: true, extra: "F", effectiveDateHint: "Date returning to duty" },
  { key: "award", label: "On-the-Spot Award", box1: "On-the-Spot Award", fillFrom: false, fillTo: true, extra: "F", effectiveDateHint: "Date of the award" },
  { key: "change_cost_center", label: "Change of Home Cost Center", box1: "Change of Home Cost Center", fillFrom: true, fillTo: true, extra: "F", effectiveDateHint: "Start of the next pay period" },
];

export function getSf52Action(key: string): Sf52ActionDef {
  return SF52_ACTIONS.find((a) => a.key === key) ?? SF52_ACTIONS[0];
}

/** All the fields a user types in when creating an SF-52. */
export interface Sf52FormInputs {
  proposedEffectiveDate: string; // yyyy-mm-dd from the date input
  requestedBy: string;
  authorizedBy: string;
  preparerName: string;
  preparerPhone: string;
  box1: string;
  vice: string;
  // TO (new) position — defaults to a copy of the employee's current values.
  toPositionTitle: string;
  toPositionNumber: string;
  toPayPlan: string;
  toOccSeries: string;
  toPayBand: string;
  toStep: string;
  toHourlyRate: string;
  // Part D (recruitment)
  numRecruitments: string;
  areasOfConsideration: string;
  proposedSalaryRange: string;
  relocationAuth: string;
  otherNotes: string;
  conflictingReasons: string; // "" | "yes" | "no"
  // Part E (resignation)
  reasonForResign: string;
  dateSigned: string; // yyyy-mm-dd
  forwardingAddress: string;
  // Part F (other actions)
  partFRemarks: string;
}

export const EMPTY_SF52_INPUTS: Sf52FormInputs = {
  proposedEffectiveDate: "",
  requestedBy: SF52_FACILITY.requestedBy,
  authorizedBy: SF52_FACILITY.authorizedBy,
  preparerName: "",
  preparerPhone: "",
  box1: "",
  vice: "",
  toPositionTitle: "",
  toPositionNumber: "",
  toPayPlan: "",
  toOccSeries: "",
  toPayBand: "",
  toStep: "",
  toHourlyRate: "",
  numRecruitments: "1",
  areasOfConsideration: "All Areas",
  proposedSalaryRange: "",
  relocationAuth: "No",
  otherNotes: "",
  conflictingReasons: "",
  reasonForResign: "",
  dateSigned: "",
  forwardingAddress: "",
  partFRemarks: "",
};

/** "05/29/26" — dates as the office writes them on the form. */
export function toSf52Date(isoOrText: string): string {
  const m = (isoOrText || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return (isoOrText || "").trim();
  return `${m[2]}/${m[3]}/${m[1].slice(2)}`;
}

/** "Last, First, Middle" — comma-separated like the office's copies. */
export function composeSf52Name(pd?: PersonnelDetails | null): string {
  if (!pd) return "";
  return [pd.name_last, pd.name_first, pd.name_middle]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(", ");
}

/** Plain "Title Number" (no PD# prefix — the office writes bare titles). */
function positionTitleNo(title?: string | null, num?: string | null): string {
  return [title, num]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(" ");
}

/** Compose the filled SF-52 from the action, the employee record, and inputs. */
export function buildSf52Data(
  action: Sf52ActionDef,
  pd: PersonnelDetails | null,
  f: Sf52FormInputs,
): Sf52Data {
  const effective = toSf52Date(f.proposedEffectiveDate);
  const d: Sf52Data = {
    actionsRequested: f.box1,
    addlInfoName: f.preparerName,
    addlInfoPhone: f.preparerPhone,
    proposedEffectiveDate: effective,
    actionReqBy: f.requestedBy,
    actionAuthBy: f.authorizedBy,
    // Employee/position data (boxes 32, 33, 35, 36, 38, 39) — always the same
    // regardless of action, drawn from the employee record + facility.
    workSchedule: pd?.work_schedule || "",
    ptHours: pd?.avg_hours || "",
    flsa: pd?.flsa || "",
    appropriationCode: pd?.cost_center || "",
    dutyStationCode: SF52_FACILITY.dutyStationCode,
    dutyStation: SF52_FACILITY.dutyStation,
  };

  // Name box is blank for a recruitment (vacancy); filled otherwise.
  if (action.key !== "recruitment") d.fullName = composeSf52Name(pd);
  if (action.usesVice && f.vice.trim()) d.vice = f.vice.trim();

  if (action.fillFrom && pd) {
    d.fromPositionTitleNo = positionTitleNo(pd.position_title, pd.position_number);
    d.fromPayPlan = pd.pay_plan || "";
    d.fromOccCode = pd.occ_series || "";
    d.fromGrade = pd.pay_band || "";
    d.fromStep = pd.step || "";
    d.fromTotalSalary = pd.hourly_rate || "";
    d.fromPositionLocation = SF52_FACILITY.organization;
  }

  if (action.fillTo) {
    d.toPositionTitleNo = positionTitleNo(f.toPositionTitle, f.toPositionNumber);
    d.toPayPlan = f.toPayPlan;
    d.toOccCode = f.toOccSeries;
    d.toGrade = f.toPayBand;
    d.toStep = f.toStep;
    d.toTotalSalary = f.toHourlyRate;
    d.toPositionLocation = SF52_FACILITY.organization;
  }

  if (action.extra === "D") {
    d.numRecruitments = f.numRecruitments;
    d.areasOfConsideration = f.areasOfConsideration;
    d.proposedSalaryRange = f.proposedSalaryRange;
    d.relocationAuth = f.relocationAuth;
    d.otherNotes = f.otherNotes;
  } else if (action.extra === "E") {
    // Part B box 4 and Part E box 2 are one shared field on the form; the
    // office fills it (= the resignation date) on resignations only.
    d.effectiveDate = effective;
    d.reasonForResign = f.reasonForResign;
    d.dateSigned = toSf52Date(f.dateSigned);
    d.forwardingAddress = f.forwardingAddress;
    if (f.conflictingReasons === "yes" || f.conflictingReasons === "no") {
      d.conflictingReasons = f.conflictingReasons;
    }
  } else if (action.extra === "F") {
    d.partFRemarks = f.partFRemarks;
  }

  return d;
}
