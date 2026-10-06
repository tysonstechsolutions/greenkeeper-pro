/**
 * HR roster import — turn the HR system's staff export (copied straight out
 * of Excel) into updates for existing staff and new staff records.
 *
 * The export lists one person per row:
 *   Personnel subarea | Employee Name | Position | Employment Status |
 *   Employee subgroup | Activity Start Date | Pay Plan, Series, Grade |
 *   Cost ctr | Cost Center | Personnel area | Start Date | Supervisor Position
 *
 * Names are "LAST FIRST MIDDLE" in capitals ("NMN" = no middle name). Staff
 * profiles use everyday names ("DJ Skinner", "Mike Pelletier"), so matching
 * goes by last name and then first name, nickname, or initials. Everything
 * here is pure — the import sheet does the fetching and saving.
 */
import type { DutyDepartment, DutyRoleGroup } from "@/lib/operations/types";
import type { InviteRole, PersonnelDetails } from "@/types/database";

export interface HrRosterRow {
  /** 1-based line in the pasted text, for error messages. */
  line: number;
  rawName: string;
  nameLast: string;
  nameFirst: string;
  nameMiddle: string;
  position: string;
  employmentStatus: string;
  employeeSubgroup: string;
  /** yyyy-mm-dd; HR "Activity Start Date" (stored as the hire date). */
  activityStartDate: string;
  payPlan: string;
  occSeries: string;
  grade: string;
  costCenter: string;
  costCenterName: string;
  /** yyyy-mm-dd; HR "Start Date". */
  startDate: string;
  supervisor: boolean | null;
}

export interface HrRosterParseResult {
  rows: HrRosterRow[];
  errors: { line: number; message: string }[];
}

type ColumnKey =
  | "subarea"
  | "name"
  | "position"
  | "status"
  | "subgroup"
  | "activityStart"
  | "payPlan"
  | "costCtr"
  | "costCenterName"
  | "area"
  | "startDate"
  | "supervisor";

/** Column order of the HR export when the header row isn't pasted. */
const DEFAULT_ORDER: ColumnKey[] = [
  "subarea",
  "name",
  "position",
  "status",
  "subgroup",
  "activityStart",
  "payPlan",
  "costCtr",
  "costCenterName",
  "area",
  "startDate",
  "supervisor",
];

/** Header text -> column. Checked in order, so specific labels come first. */
function headerKey(h: string): ColumnKey | null {
  const t = h.trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith("personnel subarea")) return "subarea";
  if (t.startsWith("personnel area")) return "area";
  if (t.startsWith("employee name")) return "name";
  if (t.startsWith("employee subgroup")) return "subgroup";
  if (t.startsWith("employment stat")) return "status";
  if (t.startsWith("activity start")) return "activityStart";
  if (t.startsWith("pay plan")) return "payPlan";
  if (t.startsWith("supervisor")) return "supervisor";
  if (t.startsWith("start dat")) return "startDate";
  if (t === "cost center" || t.startsWith("cost center ")) return "costCenterName";
  if (t.startsWith("cost c")) return "costCtr";
  if (t.startsWith("position")) return "position";
  return null;
}

/** Excel copies as tabs; fall back to runs of 2+ spaces for retyped text. */
function splitCells(line: string): string[] {
  const cells = line.includes("\t") ? line.split("\t") : line.split(/ {2,}/);
  return cells.map((c) => c.trim());
}

/** "08/11/2025" -> "2025-08-11". Returns "" when it isn't a real date. */
export function hrDateToIso(text: string): string {
  const m = (text || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) {
    const iso = (text || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return iso ? iso[0] : "";
  }
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "NF 0189 01" -> { payPlan: "NF", occSeries: "0189", grade: "01" }. */
export function parsePayPlan(text: string): { payPlan: string; occSeries: string; grade: string } | null {
  const m = (text || "").trim().toUpperCase().match(/^([A-Z]{2})[\s-]+(\d{3,4})[\s-]+(\d{1,2})$/);
  if (!m) return null;
  return { payPlan: m[1], occSeries: m[2].padStart(4, "0"), grade: m[3].padStart(2, "0") };
}

/** "O'NEILL" -> "O'Neill", "SMITH-JONES" -> "Smith-Jones". */
export function titleCaseName(text: string): string {
  return (text || "")
    .trim()
    .toLowerCase()
    .replace(/(^|[\s'’-])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** "LUDWICK THOMAS ROBERT" -> last/first/middle, dropping "NMN". */
export function splitHrName(raw: string): { last: string; first: string; middle: string } {
  const parts = (raw || "").trim().split(/\s+/).filter(Boolean);
  const last = titleCaseName(parts[0] || "");
  const first = titleCaseName(parts[1] || "");
  const middle = parts
    .slice(2)
    .filter((p) => p.toUpperCase() !== "NMN")
    .map(titleCaseName)
    .join(" ");
  return { last, first, middle };
}

/** Parse the pasted HR export. Header row is optional; blank lines are skipped. */
export function parseHrRoster(text: string): HrRosterParseResult {
  const rows: HrRosterRow[] = [];
  const errors: { line: number; message: string }[] = [];
  const lines = (text || "").replace(/\r\n?/g, "\n").split("\n");

  let order: string[] = DEFAULT_ORDER;
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    if (!line.trim()) return;
    const cells = splitCells(line);

    // A header row re-maps the columns for the rows after it.
    const keys = cells.map(headerKey);
    if (keys.includes("name") && keys.filter(Boolean).length >= 3) {
      // Unknown headers must not overwrite a known column; mark them.
      order = keys.map((k, ix) => k ?? `unknown${ix}`);
      return;
    }

    const get = (key: ColumnKey): string => {
      const ix = order.indexOf(key);
      return ix >= 0 ? (cells[ix] ?? "").trim() : "";
    };

    const rawName = get("name");
    if (!rawName) {
      errors.push({ line: lineNo, message: "No employee name found on this line." });
      return;
    }
    const name = splitHrName(rawName);
    if (!name.first) {
      errors.push({ line: lineNo, message: `"${rawName}" needs a last and first name.` });
      return;
    }

    const payText = get("payPlan");
    const pay = parsePayPlan(payText);
    if (payText && !pay) {
      errors.push({ line: lineNo, message: `${rawName}: couldn't read pay plan "${payText}".` });
    }

    const supervisorText = get("supervisor").toLowerCase();
    rows.push({
      line: lineNo,
      rawName: rawName.replace(/\s+/g, " "),
      nameLast: name.last,
      nameFirst: name.first,
      nameMiddle: name.middle,
      position: get("position"),
      employmentStatus: get("status"),
      employeeSubgroup: get("subgroup"),
      activityStartDate: hrDateToIso(get("activityStart")),
      payPlan: pay?.payPlan ?? "",
      occSeries: pay?.occSeries ?? "",
      grade: pay?.grade ?? "",
      costCenter: get("costCtr").replace(/\D/g, ""),
      costCenterName: get("costCenterName"),
      startDate: hrDateToIso(get("startDate")),
      supervisor: supervisorText === "yes" ? true : supervisorText === "no" ? false : null,
    });
  });

  return { rows, errors };
}

// ── Matching to existing staff ───────────────────────────────────────────────

/** Lowercase letters only: "O'Neill" -> "oneill". */
function key(text: string | null | undefined): string {
  return (text || "").toLowerCase().replace(/[^a-z]/g, "");
}

/** Common short names, mapped to the formal first name HR uses. */
const NICKNAMES: Record<string, string[]> = {
  michael: ["mike", "mikey", "mick"],
  martin: ["marty", "mart"],
  joseph: ["joe", "joey"],
  thomas: ["tom", "tommy"],
  william: ["bill", "billy", "will", "willie"],
  anthony: ["tony"],
  robert: ["rob", "bob", "bobby"],
  david: ["dave"],
  james: ["jim", "jimmy"],
  bartholomew: ["bart"],
  nathan: ["nate"],
  nathaniel: ["nate"],
  cornelio: ["neo"],
  rosalba: ["rosa"],
  ruben: ["rube"],
  oscar: ["ozzie"],
  jorge: ["george"],
  daniel: ["dan", "danny"],
  christopher: ["chris"],
  matthew: ["matt"],
  richard: ["rick", "rich", "dick"],
  edward: ["ed", "eddie"],
  steven: ["steve"],
  stephen: ["steve"],
  benjamin: ["ben"],
  samuel: ["sam"],
  alexander: ["alex"],
  jonathan: ["jon"],
  andrew: ["andy", "drew"],
  timothy: ["tim"],
  kenneth: ["ken", "kenny"],
  gregory: ["greg"],
  jeffrey: ["jeff"],
  patrick: ["pat"],
  charles: ["charlie", "chuck"],
};

/** Does an everyday first name fit HR's formal first (and middle) name? */
export function firstNameMatches(given: string, hrFirst: string, hrMiddle = ""): boolean {
  const g = key(given);
  const f = key(hrFirst);
  if (!g || !f) return false;
  if (g === f) return true;
  if ((NICKNAMES[f] || []).includes(g)) return true;
  // "DJ" for David James; "TJ" for Thomas J…
  const m = key(hrMiddle);
  if (g.length === 2 && m && g === f[0] + m[0]) return true;
  // Shortened forms: "Nat" for Nathan, "Cornelio" for "Corn"
  if (g.length >= 3 && (f.startsWith(g) || g.startsWith(f))) return true;
  return false;
}

export interface HrMatchCandidate {
  id: string;
  full_name: string | null;
  personnel_details?: PersonnelDetails | null;
}

/** Last and first names a staff profile goes by (its SF-52 names win). */
function candidateNames(c: HrMatchCandidate): { last: string; firsts: string[] } {
  const pd = c.personnel_details;
  const tokens = (c.full_name || "").trim().split(/\s+/).filter(Boolean);
  const pdLast = key(pd?.name_last);
  const last = pdLast || key(tokens[tokens.length - 1]);
  const firsts = [pd?.name_first || "", tokens.length > 1 ? tokens[0] : ""].filter(Boolean);
  return { last, firsts };
}

export type HrMatchReason = "name" | "last_name_only" | "ambiguous" | "none";

export interface HrMatch {
  candidateId: string | null;
  reason: HrMatchReason;
}

/**
 * Pair each HR row with at most one existing staff profile.
 * - Same last name + first name/nickname/initials -> "name".
 * - Only one HR row and one profile share a last name -> "last_name_only"
 *   (likely the same person under a very different everyday name).
 * - A profile never pairs with two rows; ties are left "ambiguous".
 */
export function matchHrRows(rows: HrRosterRow[], candidates: HrMatchCandidate[]): HrMatch[] {
  const named = candidates.map((c) => ({ c, ...candidateNames(c) }));
  const hrLastCount = new Map<string, number>();
  for (const r of rows) hrLastCount.set(key(r.nameLast), (hrLastCount.get(key(r.nameLast)) || 0) + 1);

  const proposals: HrMatch[] = rows.map((r) => {
    const last = key(r.nameLast);
    const sameLast = named.filter((n) => n.last && n.last === last);
    if (sameLast.length === 0) return { candidateId: null, reason: "none" };
    const byFirst = sameLast.filter((n) => n.firsts.some((f) => firstNameMatches(f, r.nameFirst, r.nameMiddle)));
    if (byFirst.length === 1) return { candidateId: byFirst[0].c.id, reason: "name" };
    if (byFirst.length > 1) return { candidateId: null, reason: "ambiguous" };
    if (sameLast.length === 1 && hrLastCount.get(last) === 1) {
      return { candidateId: sameLast[0].c.id, reason: "last_name_only" };
    }
    return { candidateId: null, reason: sameLast.length > 0 ? "ambiguous" : "none" };
  });

  // A profile claimed by two rows is resolved for neither.
  const claims = new Map<string, number>();
  for (const p of proposals) if (p.candidateId) claims.set(p.candidateId, (claims.get(p.candidateId) || 0) + 1);
  return proposals.map((p) =>
    p.candidateId && (claims.get(p.candidateId) || 0) > 1 ? { candidateId: null, reason: "ambiguous" } : p,
  );
}

// ── What gets saved ──────────────────────────────────────────────────────────

/** HR employee subgroup -> the SF-52 work schedule code. */
export function workScheduleFor(subgroup: string): string {
  const t = (subgroup || "").toLowerCase();
  if (t.startsWith("flex")) return "FLEX";
  if (t.includes("part")) return "RPT";
  if (t.includes("full")) return "RFT";
  return "";
}

/** Cost center + position -> where a new person sits in the app. */
export function placementFor(row: Pick<HrRosterRow, "costCenter" | "costCenterName" | "position">): {
  department: DutyDepartment | null;
  roleGroup: DutyRoleGroup | null;
} {
  const pos = row.position.toLowerCase();
  const center = row.costCenterName.toLowerCase();
  if (row.costCenter === "25581" || center.includes("maint")) {
    return { department: "maintenance", roleGroup: "maintenance_staff" };
  }
  if (row.costCenter === "20091" || center.includes("f&b") || /cook|food/.test(pos)) {
    return { department: "food_and_beverage", roleGroup: "restaurant_staff" };
  }
  if (row.costCenter === "20087" || center.includes("golf")) {
    if (pos.startsWith("recreation aid")) return { department: "golf_operations", roleGroup: "recreation_aide" };
    if (pos.startsWith("golf operations")) {
      return { department: "golf_operations", roleGroup: "golf_operations_assistant" };
    }
    if (pos.includes("manager")) return { department: "administration", roleGroup: "general_manager" };
    return { department: "golf_operations", roleGroup: null };
  }
  return { department: null, roleGroup: null };
}

/**
 * For someone already in Staff: the department and role group to fill in
 * from HR, but only where theirs is blank. A department someone picked by
 * hand is never changed. Returns only the fields to set.
 */
export function placementFill(
  existing: { department?: string | null; role_group?: string | null },
  row: Pick<HrRosterRow, "costCenter" | "costCenterName" | "position">,
): { department?: DutyDepartment; role_group?: DutyRoleGroup } {
  const place = placementFor(row);
  const out: { department?: DutyDepartment; role_group?: DutyRoleGroup } = {};
  const hasDept = !!(existing.department ?? "").trim();
  if (!hasDept && place.department) out.department = place.department;
  // A role group only makes sense inside the department it belongs to.
  const dept = hasDept ? existing.department : place.department;
  const groupBlank = !(existing.role_group ?? "").trim() || existing.role_group === "unassigned";
  if (groupBlank && place.roleGroup && dept === place.department) {
    out.role_group = place.roleGroup;
  }
  return out;
}

/** App role for a brand-new account. Flex staff are part-time; others crew. */
export function inviteRoleFor(row: Pick<HrRosterRow, "employeeSubgroup">): InviteRole {
  return workScheduleFor(row.employeeSubgroup) === "FLEX" ? "seasonal" : "crew";
}

/** Everyday name for a new profile: "Ruben Villalobos". */
export function displayNameFor(row: Pick<HrRosterRow, "nameFirst" | "nameLast">): string {
  return `${row.nameFirst} ${row.nameLast}`.trim();
}

/**
 * The person's personnel details with the HR facts laid over them. Fields
 * HR doesn't carry (hourly rate, PD#, FLSA, avg hours…) are kept. Blank HR
 * cells never wipe out what's already saved.
 */
export function mergePersonnelDetails(existing: PersonnelDetails | null | undefined, row: HrRosterRow): PersonnelDetails {
  const hr: PersonnelDetails = {
    name_last: row.nameLast,
    name_first: row.nameFirst,
    name_middle: row.nameMiddle,
    position_title: row.position,
    pay_plan: row.payPlan,
    occ_series: row.occSeries,
    pay_band: row.grade,
    work_schedule: workScheduleFor(row.employeeSubgroup),
    cost_center: row.costCenter,
    cost_center_name: row.costCenterName,
    employee_subgroup: row.employeeSubgroup,
    position_start_date: row.startDate,
    supervisory: row.supervisor === null ? "" : row.supervisor ? "Yes" : "No",
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(existing || {})) {
    const t = (v ?? "").toString().trim();
    if (t) out[k] = t;
  }
  for (const [k, v] of Object.entries(hr)) {
    const t = (v ?? "").toString().trim();
    // A row without a middle name means "no middle name" — clear a stale one.
    if (t) out[k] = t;
    else if (k === "name_middle") delete out[k];
  }
  return out as PersonnelDetails;
}

/** Human-readable list of what an update changes, for the preview. */
export function describeChanges(
  before: { hire_date?: string | null; personnel_details?: PersonnelDetails | null },
  after: { hire_date: string | null; personnel_details: PersonnelDetails },
): string[] {
  const labels: [keyof PersonnelDetails, string][] = [
    ["name_last", "Last name"],
    ["name_first", "First name"],
    ["name_middle", "Middle"],
    ["position_title", "Position"],
    ["pay_plan", "Pay plan"],
    ["occ_series", "Series"],
    ["pay_band", "Grade"],
    ["work_schedule", "Schedule"],
    ["cost_center", "Cost ctr"],
    ["cost_center_name", "Cost center"],
    ["employee_subgroup", "Subgroup"],
    ["position_start_date", "Start date"],
    ["supervisory", "Supervisor"],
  ];
  const out: string[] = [];
  const b = before.personnel_details || {};
  if ((before.hire_date || "") !== (after.hire_date || "")) {
    out.push(`Hire date: ${before.hire_date || "—"} → ${after.hire_date || "—"}`);
  }
  for (const [k, label] of labels) {
    const from = (b[k] ?? "").toString().trim();
    const to = (after.personnel_details[k] ?? "").toString().trim();
    if (from !== to) out.push(`${label}: ${from || "—"} → ${to || "—"}`);
  }
  return out;
}
