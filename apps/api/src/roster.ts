import { readFileSync } from "node:fs";
import { renderExportedAt } from "@shiftswap/rules";

// Read-only view of the nightly roster export. ShiftSwap never writes to it.
//
// The roster is read on every request, so it can be absent, unreadable or malformed at any time.
// The source never reports why a read failed: an fs error or a JSON SyntaxError can quote the
// path or the file content, and neither may reach a log or a response (NFR-PRIV-001).
// The extractors below are tolerant: they are pure, never throw on any JSON value, and where an
// id or number occurs more than once the first occurrence wins.

/** One read of the roster: the parsed JSON value, or a failure that carries no detail. */
export type RosterRead = { ok: true; raw: unknown } | { ok: false };

/** Reads the roster. Called once per request, with no cache. */
export type RosterSource = () => RosterRead;

/** Reads and parses the roster file on every call. Any failure is `{ ok: false }`. */
export function fileRosterSource(path: string): RosterSource {
  return () => {
    try {
      const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
      return { ok: true, raw };
    } catch {
      return { ok: false };
    }
  };
}

/** Serves the same JSON value on every call. For tests. */
export function fixedRosterSource(raw: unknown): RosterSource {
  return () => ({ ok: true, raw });
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function recordsIn(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** A shift whose six fields are all strings. */
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

/**
 * A shift as the refusal checks see it: known to exist by its string `shiftId`. `unit` and
 * `employeeNumber` are kept as the roster has them, so they may be missing or not strings.
 */
export interface RefusalShift {
  shiftId: string;
  unit: unknown;
  employeeNumber: unknown;
}

/** Every shift object with a string `shiftId`, by id. The first occurrence of an id wins. */
function shiftRecords(raw: unknown): Map<string, JsonRecord> {
  const byId = new Map<string, JsonRecord>();
  for (const record of recordsIn(field(raw, "shifts"))) {
    const shiftId = record["shiftId"];
    if (typeof shiftId === "string" && !byId.has(shiftId)) {
      byId.set(shiftId, record);
    }
  }
  return byId;
}

/**
 * The refusal-lookup index. Existence is tested by `shiftId` alone, apart from completeness, so a
 * shift with a missing or non-string owner or unit is still found: the caller must not report it
 * as unknown. Callers compare `employeeNumber` by strict equality with a string, and treat a
 * `unit` that is not a string as not outside the pilot, so that it falls through to later checks.
 */
export function refusalShifts(raw: unknown): Map<string, RefusalShift> {
  const index = new Map<string, RefusalShift>();
  for (const [shiftId, record] of shiftRecords(raw)) {
    index.set(shiftId, { shiftId, unit: record["unit"], employeeNumber: record["employeeNumber"] });
  }
  return index;
}

/** The shifts whose six fields are all strings, in roster order. */
export function listedShifts(raw: unknown): RosterShift[] {
  const shifts: RosterShift[] = [];
  for (const [shiftId, record] of shiftRecords(raw)) {
    const { unit, role, start, end, employeeNumber } = record;
    if (
      typeof unit === "string" &&
      typeof role === "string" &&
      typeof start === "string" &&
      typeof end === "string" &&
      typeof employeeNumber === "string"
    ) {
      shifts.push({ shiftId, unit, role, start, end, employeeNumber });
    }
  }
  return shifts;
}

/**
 * The employee numbers of the roster operators, or undefined when `operators` is absent or not an
 * array, which means identity cannot be established. An operator without a string
 * `employeeNumber` is skipped.
 */
export function operatorNumbers(raw: unknown): Set<string> | undefined {
  const operators = field(raw, "operators");
  if (!Array.isArray(operators)) {
    return undefined;
  }
  const numbers = new Set<string>();
  for (const operator of recordsIn(operators)) {
    const employeeNumber = operator["employeeNumber"];
    if (typeof employeeNumber === "string") {
      numbers.add(employeeNumber);
    }
  }
  return numbers;
}

/**
 * Operator names by employee number, for naming the holder of a take shift. The first operator
 * with a string `employeeNumber` and `name` wins; anything else is skipped.
 */
export function operatorNames(raw: unknown): Map<string, string> {
  return new Map(peopleIn(field(raw, "operators"), "operator").map((person) => [person.employeeNumber, person.name]));
}
/** A roster person the development-only user switcher can act as. */
export interface DevUser {
  employeeNumber: string;
  name: string;
  roles: string[];
}

function peopleIn(value: unknown, role: string): DevUser[] {
  const seen = new Set<string>();
  const people: DevUser[] = [];
  for (const record of recordsIn(value)) {
    const employeeNumber = record["employeeNumber"];
    const name = record["name"];
    if (typeof employeeNumber === "string" && typeof name === "string" && !seen.has(employeeNumber)) {
      seen.add(employeeNumber);
      people.push({ employeeNumber, name, roles: [role] });
    }
  }
  return people;
}

/** Operators then supervisors, each with a string `employeeNumber` and `name`. */
export function devUsers(raw: unknown): DevUser[] {
  return [
    ...peopleIn(field(raw, "operators"), "operator"),
    ...peopleIn(field(raw, "supervisors"), "shift-supervisor"),
  ];
}

/** The export time as shown to the caller. All four fields are strings, or all four are null. */
export interface ExportStamp {
  exportedAt: string | null;
  exportedAtUtcMinute: string | null;
  exportedAtSiteLocal: string | null;
  siteTimeZone: string | null;
}

/** The export stamp, or all nulls when `exportedAt` or `site.timeZone` cannot be rendered. */
export function exportStamp(raw: unknown): ExportStamp {
  const none: ExportStamp = {
    exportedAt: null,
    exportedAtUtcMinute: null,
    exportedAtSiteLocal: null,
    siteTimeZone: null,
  };
  const exportedAt = field(raw, "exportedAt");
  const siteTimeZone = field(field(raw, "site"), "timeZone");
  if (typeof exportedAt !== "string" || typeof siteTimeZone !== "string") {
    return none;
  }
  const rendering = renderExportedAt(exportedAt, siteTimeZone);
  if (!rendering.ok) {
    return none;
  }
  return {
    exportedAt,
    exportedAtUtcMinute: rendering.utcMinute,
    exportedAtSiteLocal: rendering.siteLocal,
    siteTimeZone,
  };
}
