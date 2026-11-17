import { readFileSync } from "node:fs";

// Read-only view of the nightly roster export. ShiftSwap never writes to it.

export interface RosterShift {
  shiftId: string;
  unit: string;
  role: string;
  /** Site-local `YYYY-MM-DDTHH:mm`, no offset. */
  start: string;
  /** Site-local `YYYY-MM-DDTHH:mm`, no offset. */
  end: string;
  employeeNumber: string;
}

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

export interface Roster {
  site: { name: string; timeZone: string };
  /** A UTC instant, as exported. */
  exportedAt: string;
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

function asArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`roster: ${field} must be an array`);
  }
  return value;
}

function mapArray<T>(
  value: unknown,
  field: string,
  parseItem: (item: unknown, itemField: string) => T,
): T[] {
  return asArray(value, field).map((item, index) => parseItem(item, `${field}[${index}]`));
}

function parseQualification(value: unknown, field: string): RosterQualification {
  const record = asRecord(value, field);
  return {
    unit: asString(record.unit, `${field}.unit`),
    role: asString(record.role, `${field}.role`),
    validThrough: asString(record.validThrough, `${field}.validThrough`),
  };
}

function parseOperator(value: unknown, field: string): RosterOperator {
  const record = asRecord(value, field);
  return {
    employeeNumber: asString(record.employeeNumber, `${field}.employeeNumber`),
    name: asString(record.name, `${field}.name`),
    qualifications: mapArray(record.qualifications, `${field}.qualifications`, parseQualification),
  };
}

function parseSupervisor(value: unknown, field: string): RosterSupervisor {
  const record = asRecord(value, field);
  return {
    employeeNumber: asString(record.employeeNumber, `${field}.employeeNumber`),
    name: asString(record.name, `${field}.name`),
    units: mapArray(record.units, `${field}.units`, (unit, unitField) => asString(unit, unitField)),
  };
}

function parseShift(value: unknown, field: string): RosterShift {
  const record = asRecord(value, field);
  return {
    shiftId: asString(record.shiftId, `${field}.shiftId`),
    unit: asString(record.unit, `${field}.unit`),
    role: asString(record.role, `${field}.role`),
    start: asString(record.start, `${field}.start`),
    end: asString(record.end, `${field}.end`),
    employeeNumber: asString(record.employeeNumber, `${field}.employeeNumber`),
  };
}

/** Validates the parts of the roster ShiftSwap uses. Throws an Error naming the field path only. */
export function parseRoster(value: unknown): Roster {
  const record = asRecord(value, "roster");
  const site = asRecord(record.site, "site");
  return {
    site: {
      name: asString(site.name, "site.name"),
      timeZone: asString(site.timeZone, "site.timeZone"),
    },
    exportedAt: asString(record.exportedAt, "exportedAt"),
    operators: mapArray(record.operators, "operators", parseOperator),
    supervisors: mapArray(record.supervisors, "supervisors", parseSupervisor),
    shifts: mapArray(record.shifts, "shifts", parseShift),
  };
}

/** Reads and validates the roster file. Read-only. */
export function loadRoster(path: string): Roster {
  const text = readFileSync(path, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // A SyntaxError message can quote file content, so it is not propagated.
    throw new Error("roster: file is not valid JSON");
  }
  return parseRoster(parsed);
}
