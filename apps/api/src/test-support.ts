import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RosterShift } from "./roster";

// Helpers shared by API tests. Not a test file.
// `readSampleRoster` parses the file afresh on each call, so the roster builders below mutate a
// private deep copy, never the file or another test's roster.

/** Absolute path to the repo root, independent of the working directory. */
export const repoRoot: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const SAMPLE_ROSTER_PATH: string = path.join(repoRoot, "data", "roster.sample.json");

export interface RosterQualification {
  unit: string;
  role: string;
  validThrough: string;
}

export interface RosterOperator {
  employeeNumber: string;
  name: string;
  qualifications: RosterQualification[];
}

export interface RosterSupervisor {
  employeeNumber: string;
  name: string;
  units: string[];
}

/** The sample roster, typed. The API itself reads the roster as raw JSON. */
export interface Roster {
  site: { name: string; timeZone: string };
  /** A UTC instant, as exported. */
  exportedAt: string;
  /** The first and last site-local dates the export is complete for. */
  coverage: { from: string; to: string };
  operators: RosterOperator[];
  supervisors: RosterSupervisor[];
  shifts: RosterShift[];
}

// Error messages name the field path only, never a value.

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`roster: ${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`roster: ${field} must be a string`);
  }
  return value;
}

function mapArray<T>(
  value: unknown,
  field: string,
  parseItem: (item: unknown, itemField: string) => T,
): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`roster: ${field} must be an array`);
  }
  return value.map((item: unknown, index) => parseItem(item, `${field}[${index}]`));
}

function parseQualification(value: unknown, field: string): RosterQualification {
  const record = asRecord(value, field);
  return {
    unit: asString(record["unit"], `${field}.unit`),
    role: asString(record["role"], `${field}.role`),
    validThrough: asString(record["validThrough"], `${field}.validThrough`),
  };
}

function parseOperator(value: unknown, field: string): RosterOperator {
  const record = asRecord(value, field);
  return {
    employeeNumber: asString(record["employeeNumber"], `${field}.employeeNumber`),
    name: asString(record["name"], `${field}.name`),
    qualifications: mapArray(record["qualifications"], `${field}.qualifications`, parseQualification),
  };
}

function parseSupervisor(value: unknown, field: string): RosterSupervisor {
  const record = asRecord(value, field);
  return {
    employeeNumber: asString(record["employeeNumber"], `${field}.employeeNumber`),
    name: asString(record["name"], `${field}.name`),
    units: mapArray(record["units"], `${field}.units`, (unit, unitField) => asString(unit, unitField)),
  };
}

function parseShift(value: unknown, field: string): RosterShift {
  const record = asRecord(value, field);
  return {
    shiftId: asString(record["shiftId"], `${field}.shiftId`),
    unit: asString(record["unit"], `${field}.unit`),
    role: asString(record["role"], `${field}.role`),
    start: asString(record["start"], `${field}.start`),
    end: asString(record["end"], `${field}.end`),
    employeeNumber: asString(record["employeeNumber"], `${field}.employeeNumber`),
  };
}

function parseRoster(value: unknown): Roster {
  const record = asRecord(value, "roster");
  const site = asRecord(record["site"], "site");
  const coverage = asRecord(record["coverage"], "coverage");
  return {
    site: {
      name: asString(site["name"], "site.name"),
      timeZone: asString(site["timeZone"], "site.timeZone"),
    },
    exportedAt: asString(record["exportedAt"], "exportedAt"),
    coverage: {
      from: asString(coverage["from"], "coverage.from"),
      to: asString(coverage["to"], "coverage.to"),
    },
    operators: mapArray(record["operators"], "operators", parseOperator),
    supervisors: mapArray(record["supervisors"], "supervisors", parseSupervisor),
    shifts: mapArray(record["shifts"], "shifts", parseShift),
  };
}

/** The sample roster, parsed straight from the file. Keeps `coverage`. */
export function readSampleRoster(): Roster {
  const parsed: unknown = JSON.parse(readFileSync(SAMPLE_ROSTER_PATH, "utf8"));
  return parseRoster(parsed);
}

/** The sample roster as raw JSON: a fresh deep clone of the file, nothing dropped. */
export function readSampleRosterRaw(): unknown {
  const parsed: unknown = JSON.parse(readFileSync(SAMPLE_ROSTER_PATH, "utf8"));
  return parsed;
}

/** A shared response fixture: `<repoRoot>/fixtures/responses/<name>`. */
export function readFixture(name: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(path.join(repoRoot, "fixtures", "responses", name), "utf8"));
  return parsed;
}

/** A clock reading after the sample roster's export (2027-03-07T08:00:00Z) and well within 26 hours of it. */
export const SAMPLE_NOW_ISO = "2027-03-07T14:00:00Z";

/** A clock fixed at `iso`. Throws on an unparseable value so a bad test fixture fails loudly. */
export function fixedNow(iso: string): () => number {
  const epochMs = Date.parse(iso);
  if (Number.isNaN(epochMs)) {
    throw new Error("fixedNow: not a valid date-time");
  }
  return () => epochMs;
}

/** One swap request: who asks, the shift they give, and the shift they take. */
export interface SwapPick {
  caller: string;
  give: string;
  take: string;
}

// The verification steps' picks against the sample roster (clock SAMPLE_NOW_ISO).
/** Step 1: 104417 gives CDU-CON1-0318-N and takes CDU-CON1-0319-N. No § 3.1 or § 3.3 failure. */
export const STEP_1: SwapPick = { caller: "104417", give: "CDU-CON1-0318-N", take: "CDU-CON1-0319-N" };
/** Step 2: 106640 gives HCU-CON2-0312-N and takes HCU-CON1-0310-D. */
export const STEP_2: SwapPick = { caller: "106640", give: "HCU-CON2-0312-N", take: "HCU-CON1-0310-D" };
/** Step 3: 104417 gives CDU-CON1-0310-D and takes CDU-CON1-0312-D. */
export const STEP_3: SwapPick = { caller: "104417", give: "CDU-CON1-0310-D", take: "CDU-CON1-0312-D" };
/** Step 4 (clock change on 2027-03-14): 104417 gives CDU-CON1-0310-D and takes HCU-CON1-0314-D. */
export const STEP_4: SwapPick = { caller: "104417", give: "CDU-CON1-0310-D", take: "HCU-CON1-0314-D" };
/** Step 6: 107903 gives HCU-CON1-0308-D and takes HCU-CON1-0317-D. */
export const STEP_6: SwapPick = { caller: "107903", give: "HCU-CON1-0308-D", take: "HCU-CON1-0317-D" };
/** Step 5: 103078 gives CDU-FLD1-0309-D and takes CDU-FLD1-0318-D. */
export const STEP_5: SwapPick = { caller: "103078", give: "CDU-FLD1-0309-D", take: "CDU-FLD1-0318-D" };

/** The sample roster with `added` appended to its shifts. Nothing in the sample is changed. */
function sampleRosterWith(...added: RosterShift[]): Roster {
  const roster = readSampleRoster();
  roster.shifts.push(...added);
  return roster;
}

/**
 * For the Step 6 pick: adds a Dwayne (101152) shift ending 2027-03-07T20:00, nine hours before
 * HCU-CON1-0308-D. Dwayne gets a § 3.1 finding, and Priya (107903) a § 3.3 finding.
 */
export function failListingRoster(): Roster {
  return sampleRosterWith({
    shiftId: "HCU-CON1-0307-D",
    unit: "HCU",
    role: "CONSOLE",
    start: "2027-03-07T08:00",
    end: "2027-03-07T20:00",
    employeeNumber: "101152",
  });
}

/**
 * For the Step 1 pick: adds a Luis (102286) shift ending 2027-03-25T20:00, ten hours before his
 * CDU-CON1-0326-D. The § 3.1 finding is not changed by the swap.
 */
export function unchangedRestRoster(): Roster {
  return sampleRosterWith({
    shiftId: "CDU-CON1-0325-D",
    unit: "CDU",
    role: "CONSOLE",
    start: "2027-03-25T08:00",
    end: "2027-03-25T20:00",
    employeeNumber: "102286",
  });
}

/**
 * For the Step 2 pick: adds a Priya (107903) HCU/CONSOLE shift her qualification (valid through
 * 2027-03-15) does not cover. It is on 2027-03-23, inside coverage, unless `outsideCoverage` puts
 * it on 2027-03-29, after the last covered date. The shift is not part of the swap.
 */
export function unchangedShiftQualificationRoster(
  options: { outsideCoverage?: boolean } = {},
): Roster {
  const day = options.outsideCoverage === true ? "29" : "23";
  return sampleRosterWith({
    shiftId: `HCU-CON1-03${day}-D`,
    unit: "HCU",
    role: "CONSOLE",
    start: `2027-03-${day}T05:00`,
    end: `2027-03-${day}T17:00`,
    employeeNumber: "107903",
  });
}

/**
 * For the Step 3 pick: the sample roster with one shift of the take-shift owner (102286) changed
 * so its `end` equals its `start`. The shift starts within coverage and is not one of the swapped
 * shifts. Returns the roster and the id of that shift.
 */
export function shiftEndNotAfterStartRoster(): { roster: Roster; shiftId: string } {
  const roster = readSampleRoster();
  const shift = roster.shifts.find(
    (candidate) =>
      candidate.employeeNumber === "102286" &&
      candidate.shiftId !== STEP_3.give &&
      candidate.shiftId !== STEP_3.take &&
      candidate.start.slice(0, 10) >= roster.coverage.from &&
      candidate.start.slice(0, 10) <= roster.coverage.to,
  );
  if (shift === undefined) {
    throw new Error("sample roster has no unswapped in-coverage shift for the take-shift owner");
  }
  shift.end = shift.start;
  return { roster, shiftId: shift.shiftId };
}

/** The two identity headers the site access gateway sets. */
export function headersFor(employeeNumber: string, roles = "operator"): Record<string, string> {
  return { "x-employee-number": employeeNumber, "x-roles": roles };
}
