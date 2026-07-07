/**
 * Standard VMGC recruitment packages (provided by N92, 2026-07): one tap
 * fills the TO-side position/pay boxes (17/18/19/20 on the SF-52) and the
 * Part D salary line.
 *
 * Mechanic and Laborer rates equal the 2026 Great Lakes NAF schedule
 * (NA-08 step 1 / NA-03 step 1). Restaurant Manager is NF (pay band, no
 * step) with a salary range instead of an hourly rate.
 */

export interface RecruitmentPreset {
  key: string;
  label: string;
  title: string;
  payPlan: string;
  occSeries: string;
  grade: string;
  step: string;
  hourlyRate: string;
  /** Part D "Proposed Hourly Salary Range" text. */
  salaryRange: string;
  /** Last line of the box 22 organization block. */
  orgUnit: string;
}

export const RECRUITMENT_PRESETS: RecruitmentPreset[] = [
  {
    key: "mechanic",
    label: "Mechanic — NA-5823-08",
    title: "Mechanic",
    payPlan: "NA",
    occSeries: "5823",
    grade: "08",
    step: "01",
    hourlyRate: "23.37",
    salaryRange: "$23.37",
    orgUnit: "Maintenance",
  },
  {
    key: "laborer",
    label: "Laborer — NA-3502-03",
    title: "Laborer",
    payPlan: "NA",
    occSeries: "3502",
    grade: "03",
    step: "01",
    hourlyRate: "19.05",
    salaryRange: "$19.05",
    orgUnit: "Maintenance",
  },
  {
    key: "restaurant_manager",
    label: "Restaurant Manager — NF-1101-03",
    title: "Restaurant Manager",
    payPlan: "NF",
    occSeries: "1101",
    grade: "03",
    step: "",
    hourlyRate: "",
    salaryRange: "$55K-$60K",
    orgUnit: "Restaurant",
  },
];
