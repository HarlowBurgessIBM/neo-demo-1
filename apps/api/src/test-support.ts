import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RosterShift } from "./roster";

// Helpers shared by API tests. Not a test file.

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

/** The two identity headers the site access gateway sets. */
export function headersFor(employeeNumber: string, roles = "operator"): Record<string, string> {
  return { "x-employee-number": employeeNumber, "x-roles": roles };
}
