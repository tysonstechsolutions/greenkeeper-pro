// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  describeChanges,
  displayNameFor,
  firstNameMatches,
  hrDateToIso,
  inviteRoleFor,
  matchHrRows,
  mergePersonnelDetails,
  parseHrRoster,
  parsePayPlan,
  placementFill,
  placementFor,
  splitHrName,
  titleCaseName,
  workScheduleFor,
} from "@/lib/staff/hr-roster";

const HEADER = [
  "Personnel subarea", "Employee Name", "Position", "Employment Status", "Employee subgroup",
  "Activity Start Date", "Pay Plan, Series, Grade", "Cost ctr", "Cost Center", "Personnel area",
  "Start Date", "Supervisor Position",
].join("\t");

// The October 2026 HR export, exactly as Excel copies it (tab-separated).
const ROSTER = [
  "NS GREAT LAKES	BRACKETT ANIYA LESHELL	Recreation Aid	Active	Flex Continuing	08/11/2025	NF 0189 01	20087	GLK VM GOLF PROGRAM	MWR NAVY REGION MID-ATLANTIC	08/11/2025	No",
  "NS GREAT LAKES	BRUCE TYSON KYLE	Golf Course Manager	Active	Reg Full Time	04/01/2026	NF 1101 04	20087	GLK VM GOLF PROGRAM	MWR NAVY REGION MID-ATLANTIC	06/28/2026	Yes",
  "NS GREAT LAKES	DIAZ BART NMN	Laborer	Active	Flex Continuing	09/08/2025	NA 3502 03	25581	GLK VETS GOLF MAINT	MWR NAVY REGION MID-ATLANTIC	07/27/2026	No",
  "NS GREAT LAKES	DUPONT NATHAN A	Food Service Worker	Active	Flex Continuing	05/05/2024	NA 7408 03	20091	GLK BUCKLEY'S F&B	MWR NAVY REGION MID-ATLANTIC	12/02/2025	No",
  "NS GREAT LAKES	GONZALEZ OSCAR NMN	Laborer	Active	Flex Continuing	06/08/2004	NA 3502 03	25581	GLK VETS GOLF MAINT	MWR NAVY REGION MID-ATLANTIC	03/14/2022	No",
  "NS GREAT LAKES	HERRERA CORNELIO C	Laborer	Active	Flex Continuing	05/08/2007	NA 3502 03	25581	GLK VETS GOLF MAINT	MWR NAVY REGION MID-ATLANTIC	04/18/2022	No",
  "NS GREAT LAKES	LLOYD ROSALBA KARINA	Cook (Short Order Cook)	Active	Flex Continuing	08/01/2022	NA 7404 04	20091	GLK BUCKLEY'S F&B	MWR NAVY REGION MID-ATLANTIC	06/24/2025	No",
  "NS GREAT LAKES	LUDWICK THOMAS ROBERT	Golf Course Superintendent	Active	Reg Full Time	06/07/2018	NF 1601 03	20087	GLK VM GOLF PROGRAM	MWR NAVY REGION MID-ATLANTIC	08/31/2026	No",
  "NS GREAT LAKES	MARTINEZ DEVIN MICHAEL	Recreation Aid (Golf)	Active	Flex Continuing	05/16/2024	NF 0189 01	20087	GLK VM GOLF PROGRAM	MWR NAVY REGION MID-ATLANTIC	05/16/2024	No",
  "NS GREAT LAKES	MORALES TONY NMN	Recreation Aid (Golf)	Active	Flex Continuing	05/16/2024	NF 0189 01	20087	GLK VM GOLF PROGRAM	MWR NAVY REGION MID-ATLANTIC	05/16/2024	No",
  "NS GREAT LAKES	O'NEILL COLIN GRANT	Recreation Aid (Golf)	Active	Flex Continuing	06/01/2026	NF 0189 01	20087	GLK VM GOLF PROGRAM	MWR NAVY REGION MID-ATLANTIC	06/01/2026	No",
  "NS GREAT LAKES	PELLETIER MICHAEL PAUL	Golf Operations Asst	Active	Flex - Medical elig	05/01/2003	NF 0303 02	20087	GLK VM GOLF PROGRAM	MWR NAVY REGION MID-ATLANTIC	03/09/2012	No",
  "NS GREAT LAKES	ROSALES JORGE NMN	Laborer	Active	Flex Continuing	08/03/2018	NA 3502 03	25581	GLK VETS GOLF MAINT	MWR NAVY REGION MID-ATLANTIC	04/18/2022	No",
  "NS GREAT LAKES	SKINNER DAVID JAMES	Golf Operations Asst	Active	Flex Continuing	08/15/2024	NF 0303 02	20087	GLK VM GOLF PROGRAM	MWR NAVY REGION MID-ATLANTIC	08/15/2024	No",
  "NS GREAT LAKES	SORDYL JOSEPH G	Recreation Aid	Active	Flex Continuing	03/26/2023	NF 0189 01	20087	GLK VM GOLF PROGRAM	MWR NAVY REGION MID-ATLANTIC	03/26/2023	No",
  "NS GREAT LAKES	SORDYL MARTIN E	Golf Operations Asst	Active	Flex Continuing	04/29/2022	NF 0303 02	20087	GLK VM GOLF PROGRAM	MWR NAVY REGION MID-ATLANTIC	10/22/2023	No",
  "NS GREAT LAKES	VILLALOBOS RUBEN MABUEL	Food Service Worker	Active	Flex Continuing	09/15/2025	NA 7408 03	20091	GLK BUCKLEY'S F&B	MWR NAVY REGION MID-ATLANTIC	09/15/2025	No",
  "NS GREAT LAKES	WASHINGTON BILLY RAY	Cook (Short Order Cook)	Active	Flex Continuing	04/18/2002	NA 7404 04	20091	GLK BUCKLEY'S F&B	MWR NAVY REGION MID-ATLANTIC	08/24/2026	No",
].join("\n");

describe("parseHrRoster", () => {
  it("reads all 18 rows with or without the header row", () => {
    const withHeader = parseHrRoster(`${HEADER}\n${ROSTER}\n`);
    const without = parseHrRoster(ROSTER);
    expect(withHeader.errors).toEqual([]);
    expect(without.errors).toEqual([]);
    expect(withHeader.rows).toHaveLength(18);
    expect(without.rows.map((r) => ({ ...r, line: 0 }))).toEqual(
      withHeader.rows.map((r) => ({ ...r, line: 0 })),
    );
  });

  it("splits names, pay plan, dates and cost center", () => {
    const { rows } = parseHrRoster(ROSTER);
    const tyson = rows[1];
    expect(tyson).toMatchObject({
      nameLast: "Bruce",
      nameFirst: "Tyson",
      nameMiddle: "Kyle",
      position: "Golf Course Manager",
      employmentStatus: "Active",
      employeeSubgroup: "Reg Full Time",
      activityStartDate: "2026-04-01",
      payPlan: "NF",
      occSeries: "1101",
      grade: "04",
      costCenter: "20087",
      costCenterName: "GLK VM GOLF PROGRAM",
      startDate: "2026-06-28",
      supervisor: true,
    });
    const diaz = rows[2];
    expect(diaz).toMatchObject({ nameLast: "Diaz", nameFirst: "Bart", nameMiddle: "", payPlan: "NA", occSeries: "3502", grade: "03", supervisor: false });
    expect(rows[10]).toMatchObject({ nameLast: "O'Neill", nameFirst: "Colin", nameMiddle: "Grant" });
    expect(rows[3].costCenterName).toBe("GLK BUCKLEY'S F&B");
  });

  it("follows a header row in a different column order", () => {
    const { rows, errors } = parseHrRoster(
      "Employee Name\tPay Plan, Series, Grade\tPosition\nSMITH JANE Q\tNF 0189 02\tRecreation Aid",
    );
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ nameLast: "Smith", nameFirst: "Jane", payPlan: "NF", grade: "02", position: "Recreation Aid" });
  });

  it("reports unreadable lines instead of guessing", () => {
    const { rows, errors } = parseHrRoster("NS GREAT LAKES\tCHER\tRecreation Aid\nNS GREAT LAKES\tDOE JOHN\tAid\tActive\tFlex\t01/01/2025\tGARBAGE");
    expect(rows).toHaveLength(1);
    expect(errors.map((e) => e.line)).toEqual([1, 2]);
  });
});

describe("small parsers", () => {
  it("hrDateToIso", () => {
    expect(hrDateToIso("08/11/2025")).toBe("2025-08-11");
    expect(hrDateToIso("4/1/26")).toBe("2026-04-01");
    expect(hrDateToIso("02/30/2025")).toBe("");
    expect(hrDateToIso("")).toBe("");
  });
  it("parsePayPlan", () => {
    expect(parsePayPlan("NF 0189 01")).toEqual({ payPlan: "NF", occSeries: "0189", grade: "01" });
    expect(parsePayPlan("na-7404-4")).toEqual({ payPlan: "NA", occSeries: "7404", grade: "04" });
    expect(parsePayPlan("nope")).toBeNull();
  });
  it("names", () => {
    expect(titleCaseName("O'NEILL")).toBe("O'Neill");
    expect(titleCaseName("SMITH-JONES")).toBe("Smith-Jones");
    expect(splitHrName("WASHINGTON BILLY RAY")).toEqual({ last: "Washington", first: "Billy", middle: "Ray" });
    expect(splitHrName("ROSALES JORGE NMN")).toEqual({ last: "Rosales", first: "Jorge", middle: "" });
  });
  it("first-name matching handles nicknames and initials", () => {
    expect(firstNameMatches("Mike", "Michael")).toBe(true);
    expect(firstNameMatches("Marty", "Martin")).toBe(true);
    expect(firstNameMatches("Joe", "Joseph")).toBe(true);
    expect(firstNameMatches("DJ", "David", "James")).toBe(true);
    expect(firstNameMatches("Joe", "Martin")).toBe(false);
    expect(firstNameMatches("Marty", "Joseph")).toBe(false);
  });
  it("work schedule, placement, role", () => {
    expect(workScheduleFor("Flex Continuing")).toBe("FLEX");
    expect(workScheduleFor("Flex - Medical elig")).toBe("FLEX");
    expect(workScheduleFor("Reg Full Time")).toBe("RFT");
    expect(workScheduleFor("Reg Part Time")).toBe("RPT");
    const { rows } = parseHrRoster(ROSTER);
    expect(placementFor(rows[2])).toEqual({ department: "maintenance", roleGroup: "maintenance_staff" });
    expect(placementFor(rows[3])).toEqual({ department: "food_and_beverage", roleGroup: "restaurant_staff" });
    expect(placementFor(rows[0])).toEqual({ department: "golf_operations", roleGroup: "recreation_aide" });
    expect(placementFor(rows[11])).toEqual({ department: "golf_operations", roleGroup: "golf_operations_assistant" });
    expect(inviteRoleFor(rows[0])).toBe("seasonal");
    expect(inviteRoleFor(rows[1])).toBe("crew");
    expect(displayNameFor(rows[16])).toBe("Ruben Villalobos");
  });
});

describe("matchHrRows", () => {
  const { rows } = parseHrRoster(ROSTER);
  const idx = (last: string, first: string) => rows.findIndex((r) => r.nameLast === last && r.nameFirst === first);

  it("matches everyday names to HR names, including the two Sordyls", () => {
    const staff = [
      { id: "p-tyson", full_name: "Tyson Bruce" },
      { id: "p-dj", full_name: "DJ Skinner" },
      { id: "p-marty", full_name: "Marty Sordyl" },
      { id: "p-joe", full_name: "Joe Sordyl" },
      { id: "p-mike", full_name: "Mike Pelletier" },
      { id: "p-tom", full_name: "Tom Ludwick" },
      { id: "p-colin", full_name: "Colin O'Neill" },
      { id: "p-aniya", full_name: "aniya brackett" },
      { id: "p-other", full_name: "Casey Lee" },
    ];
    const m = matchHrRows(rows, staff);
    expect(m[idx("Bruce", "Tyson")]).toEqual({ candidateId: "p-tyson", reason: "name" });
    expect(m[idx("Skinner", "David")]).toEqual({ candidateId: "p-dj", reason: "name" });
    expect(m[idx("Sordyl", "Martin")]).toEqual({ candidateId: "p-marty", reason: "name" });
    expect(m[idx("Sordyl", "Joseph")]).toEqual({ candidateId: "p-joe", reason: "name" });
    expect(m[idx("Pelletier", "Michael")]).toEqual({ candidateId: "p-mike", reason: "name" });
    expect(m[idx("Ludwick", "Thomas")]).toEqual({ candidateId: "p-tom", reason: "name" });
    expect(m[idx("O'Neill", "Colin")]).toEqual({ candidateId: "p-colin", reason: "name" });
    expect(m[idx("Brackett", "Aniya")]).toEqual({ candidateId: "p-aniya", reason: "name" });
    expect(m[idx("Villalobos", "Ruben")]).toEqual({ candidateId: null, reason: "none" });
    expect(m.filter((x) => x.candidateId).length).toBe(8);
  });

  it("uses saved SF-52 names when the profile name is a nickname nobody could guess", () => {
    const staff = [{ id: "p1", full_name: "Neo", personnel_details: { name_last: "Herrera", name_first: "Cornelio" } }];
    expect(matchHrRows(rows, staff)[idx("Herrera", "Cornelio")]).toEqual({ candidateId: "p1", reason: "name" });
  });

  it("falls back to a unique last name, but not when HR has two people with it", () => {
    const staff = [
      { id: "p-gonz", full_name: "Ozzy Gonzalez" },
      { id: "p-sord", full_name: "Sam Sordyl" },
    ];
    const m = matchHrRows(rows, staff);
    expect(m[idx("Gonzalez", "Oscar")]).toEqual({ candidateId: "p-gonz", reason: "last_name_only" });
    expect(m[idx("Sordyl", "Joseph")].candidateId).toBeNull();
    expect(m[idx("Sordyl", "Martin")].candidateId).toBeNull();
  });

  it("never pairs one profile with two rows", () => {
    const twoMikes = parseHrRoster("X\tSMITH MICHAEL A\nX\tSMITH MIKE B").rows;
    const m = matchHrRows(twoMikes, [{ id: "p", full_name: "Mike Smith" }]);
    expect(m).toEqual([
      { candidateId: null, reason: "ambiguous" },
      { candidateId: null, reason: "ambiguous" },
    ]);
  });
});

describe("mergePersonnelDetails", () => {
  const { rows } = parseHrRoster(ROSTER);
  const pelletier = rows[11];

  it("lays HR facts over what's saved and keeps fields HR doesn't have", () => {
    const merged = mergePersonnelDetails(
      {
        name_first: "Mike",
        name_last: "Pelletier",
        name_middle: "Old",
        position_title: "Golf Operations Assistant",
        hourly_rate: "17.25",
        position_number: "PD-123",
        flsa: "N",
        avg_hours: "",
      },
      pelletier,
    );
    expect(merged).toEqual({
      name_last: "Pelletier",
      name_first: "Michael",
      name_middle: "Paul",
      position_title: "Golf Operations Asst",
      pay_plan: "NF",
      occ_series: "0303",
      pay_band: "02",
      work_schedule: "FLEX",
      cost_center: "20087",
      cost_center_name: "GLK VM GOLF PROGRAM",
      employee_subgroup: "Flex - Medical elig",
      position_start_date: "2012-03-09",
      supervisory: "No",
      hourly_rate: "17.25",
      position_number: "PD-123",
      flsa: "N",
    });
  });

  it("clears a stale middle name when HR says there is none", () => {
    const merged = mergePersonnelDetails({ name_middle: "X" }, rows[2]);
    expect(merged.name_middle).toBeUndefined();
  });

  it("describes the changes for the preview", () => {
    const after = mergePersonnelDetails({ position_title: "Recreation Aide" }, rows[0]);
    const changes = describeChanges(
      { hire_date: null, personnel_details: { position_title: "Recreation Aide" } },
      { hire_date: "2025-08-11", personnel_details: after },
    );
    expect(changes).toContain("Hire date: — → 2025-08-11");
    expect(changes).toContain("Position: Recreation Aide → Recreation Aid");
    expect(changes).toContain("Pay plan: — → NF");
    expect(describeChanges({ hire_date: "2025-08-11", personnel_details: after }, { hire_date: "2025-08-11", personnel_details: after })).toEqual([]);
  });
});

describe("placementFill", () => {
  const fb = { costCenter: "20091", costCenterName: "GLK BUCKLEY'S F&B", position: "Food Service Worker" };
  it("fills a blank department and crew from HR", () => {
    expect(placementFill({ department: null, role_group: null }, fb)).toEqual({
      department: "food_and_beverage",
      role_group: "restaurant_staff",
    });
    expect(placementFill({ department: "", role_group: "unassigned" }, fb)).toEqual({
      department: "food_and_beverage",
      role_group: "restaurant_staff",
    });
  });
  it("never changes a department someone picked", () => {
    expect(placementFill({ department: "pro_shop", role_group: null }, fb)).toEqual({});
    expect(placementFill({ department: "food_and_beverage", role_group: "general_manager" }, fb)).toEqual({});
  });
  it("fills just the crew when the department already matches", () => {
    expect(placementFill({ department: "food_and_beverage", role_group: null }, fb)).toEqual({ role_group: "restaurant_staff" });
  });
  it("does nothing when HR's cost center isn't one of ours", () => {
    expect(placementFill({}, { costCenter: "99999", costCenterName: "OTHER", position: "Clerk" })).toEqual({});
  });
});
