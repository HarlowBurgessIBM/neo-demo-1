// The determinability gate: decides whether a swap check can be answered at all from the
// roster export and the application clock, and if not, says why.
// Pure: no I/O, no clock, no framework, no date library. The caller passes `now`.
// Never throws on bad input; every problem is returned as a reason.

import {
  addDays,
  isLocalDate,
  isLocalWallTime,
  isValidTimeZone,
  parseUtcInstant,
  resolveLocalTime,
  siteLocalDate,
} from "./site-time";

/** Which side of the swap a record belongs to. */
export type Party = "give-shift-owner" | "take-shift-owner";

/** A roster export field that can be unusable. */
export type ExportField =
  | "exportedAt"
  | "site.timeZone"
  | "coverage"
  | "coverage.from"
  | "coverage.to"
  | "shifts"
  | "operators";

/** One reason a swap check cannot be determined. Carries no employee number or name. */
export type CannotDetermineReason =
  | { code: "invalid-now" }
  | {
      code: "invalid-export-field";
      field: ExportField;
      problem: "missing" | "malformed" | "unknown-time-zone" | "from-after-to";
    }
  | {
      code: "coverage-mismatch";
      field: "coverage.from" | "coverage.to";
      actual: string;
      expected: string;
    }
  | { code: "now-before-export"; exportedAt: string; now: string }
  | { code: "export-stale"; ageHours: number; ageMinutes: number; limitHours: 26 }
  | { code: "missing-shift"; shiftId: string }
  | { code: "owner-not-operator"; shiftId: string; party: Party }
  | {
      code: "qualifications-missing";
      shiftId: string;
      party: Party;
      problem: "absent" | "empty";
    }
  | { code: "shift-time-malformed"; shiftId: string; field: "start" | "end" }
  | {
      code: "shift-outside-horizon";
      shiftId: string;
      start: string;
      horizonFrom: string;
      horizonTo: string;
    }
  | { code: "nonexistent-local-time"; shiftId: string; field: "start" | "end"; value: string }
  | { code: "ambiguous-local-time"; shiftId: string; field: "start" | "end"; value: string };

/** Whether the swap check can be answered, and if not, every reason it cannot. */
export type Determinability =
  | { determinable: true }
  | { determinable: false; reasons: CannotDetermineReason[] };

/** Largest magnitude of an epoch that `Date` can represent. */
const MAX_EPOCH_MS = 8.64e15;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
/** Longest age of the export, in hours, that is still trusted. */
const EXPORT_STALE_LIMIT_HOURS = 26;
const EXPORT_STALE_LIMIT_MS = 93_600_000;
/** A swapped shift must start within this many days after the export's site-local date. */
const HORIZON_DAYS = 15;
/** The export covers this many days before its site-local date... */
const COVERAGE_DAYS_BEFORE = -6;
/** ...and this many days after it. */
const COVERAGE_DAYS_AFTER = 21;

type PlainObject = Record<string, unknown>;
type TimeField = "start" | "end";

const TIME_FIELDS: readonly TimeField[] = ["start", "end"];

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function problemOf(value: unknown): "missing" | "malformed" {
  return value === undefined || value === null ? "missing" : "malformed";
}

function isValidNow(now: number): boolean {
  return typeof now === "number" && Number.isFinite(now) && Math.abs(now) <= MAX_EPOCH_MS;
}

function firstShiftWithId(shifts: readonly unknown[], id: string): PlainObject | undefined {
  return shifts.find(
    (shift): shift is PlainObject => isPlainObject(shift) && shift["shiftId"] === id,
  );
}

function firstOperatorWithNumber(
  operators: readonly unknown[],
  employeeNumber: string,
): PlainObject | undefined {
  return operators.find(
    (operator): operator is PlainObject =>
      isPlainObject(operator) && operator["employeeNumber"] === employeeNumber,
  );
}

interface SwappedShift {
  party: Party;
  id: string;
  shift: PlainObject | undefined;
}

/**
 * Decides whether a swap between `giveShiftId` and `takeShiftId` can be checked against
 * `roster` at `now` (epoch milliseconds). Never throws and never reads a clock.
 */
export function assessDeterminability(
  roster: unknown,
  input: { now: number; giveShiftId: string; takeShiftId: string },
): Determinability {
  const root: PlainObject = isPlainObject(roster) ? roster : {};
  const { now, giveShiftId, takeShiftId } = input;

  const invalidNow: CannotDetermineReason[] = [];
  const exportedAtReasons: CannotDetermineReason[] = [];
  const zoneReasons: CannotDetermineReason[] = [];
  const coverageReasons: CannotDetermineReason[] = [];
  const fieldReasons: CannotDetermineReason[] = [];
  const ageReasons: CannotDetermineReason[] = [];
  const missingShiftReasons: CannotDetermineReason[] = [];
  const ownerReasons: CannotDetermineReason[] = [];
  const qualificationReasons: CannotDetermineReason[] = [];
  const malformedReasons: CannotDetermineReason[] = [];
  const horizonReasons: CannotDetermineReason[] = [];
  const localTimeReasons: CannotDetermineReason[] = [];

  // now
  const nowIsValid = isValidNow(now);
  if (!nowIsValid) {
    invalidNow.push({ code: "invalid-now" });
  }

  // exportedAt
  const exportedAtRaw = root["exportedAt"];
  let exportedAtMs: number | undefined;
  if (exportedAtRaw === undefined || exportedAtRaw === null) {
    exportedAtReasons.push({
      code: "invalid-export-field",
      field: "exportedAt",
      problem: "missing",
    });
  } else {
    exportedAtMs =
      typeof exportedAtRaw === "string" ? parseUtcInstant(exportedAtRaw) : undefined;
    if (exportedAtMs === undefined) {
      exportedAtReasons.push({
        code: "invalid-export-field",
        field: "exportedAt",
        problem: "malformed",
      });
    }
  }

  // site.timeZone
  const site = root["site"];
  const zoneRaw = isPlainObject(site) ? site["timeZone"] : undefined;
  let zone: string | undefined;
  if (zoneRaw === undefined || zoneRaw === null) {
    zoneReasons.push({ code: "invalid-export-field", field: "site.timeZone", problem: "missing" });
  } else if (typeof zoneRaw !== "string") {
    zoneReasons.push({
      code: "invalid-export-field",
      field: "site.timeZone",
      problem: "malformed",
    });
  } else if (!isValidTimeZone(zoneRaw)) {
    zoneReasons.push({
      code: "invalid-export-field",
      field: "site.timeZone",
      problem: "unknown-time-zone",
    });
  } else {
    zone = zoneRaw;
  }

  // D: the site-local export date
  const siteExportDate =
    exportedAtMs !== undefined && zone !== undefined
      ? siteLocalDate(exportedAtMs, zone)
      : undefined;
  // addDays yields undefined outside the supported years. If any date derived
  // from D falls outside them, the coverage and horizon checks could not run and
  // would silently pass, so the export date is unusable: report exportedAt as
  // malformed and treat D as unknown (those checks are skipped, as for an
  // invalid exportedAt). exportedAt is only reported here when it parsed, so it
  // is never reported twice.
  let exportDate: string | undefined;
  if (siteExportDate !== undefined) {
    if (
      addDays(siteExportDate, COVERAGE_DAYS_BEFORE) === undefined ||
      addDays(siteExportDate, COVERAGE_DAYS_AFTER) === undefined ||
      addDays(siteExportDate, HORIZON_DAYS) === undefined
    ) {
      exportedAtReasons.push({
        code: "invalid-export-field",
        field: "exportedAt",
        problem: "malformed",
      });
    } else {
      exportDate = siteExportDate;
    }
  }

  // coverage
  const coverageRaw = root["coverage"];
  let coverageFrom: string | undefined;
  let coverageTo: string | undefined;
  if (!isPlainObject(coverageRaw)) {
    coverageReasons.push({
      code: "invalid-export-field",
      field: "coverage",
      problem: problemOf(coverageRaw),
    });
  } else {
    const fromRaw = coverageRaw["from"];
    const toRaw = coverageRaw["to"];
    if (isLocalDate(fromRaw)) {
      coverageFrom = fromRaw;
    } else {
      coverageReasons.push({
        code: "invalid-export-field",
        field: "coverage.from",
        problem: problemOf(fromRaw),
      });
    }
    if (isLocalDate(toRaw)) {
      coverageTo = toRaw;
    } else {
      coverageReasons.push({
        code: "invalid-export-field",
        field: "coverage.to",
        problem: problemOf(toRaw),
      });
    }
    if (coverageFrom !== undefined && coverageTo !== undefined && coverageFrom > coverageTo) {
      coverageReasons.push({
        code: "invalid-export-field",
        field: "coverage",
        problem: "from-after-to",
      });
    }
    if (exportDate !== undefined) {
      const expectedFrom = addDays(exportDate, COVERAGE_DAYS_BEFORE);
      if (
        coverageFrom !== undefined &&
        expectedFrom !== undefined &&
        coverageFrom !== expectedFrom
      ) {
        coverageReasons.push({
          code: "coverage-mismatch",
          field: "coverage.from",
          actual: coverageFrom,
          expected: expectedFrom,
        });
      }
      const expectedTo = addDays(exportDate, COVERAGE_DAYS_AFTER);
      if (coverageTo !== undefined && expectedTo !== undefined && coverageTo !== expectedTo) {
        coverageReasons.push({
          code: "coverage-mismatch",
          field: "coverage.to",
          actual: coverageTo,
          expected: expectedTo,
        });
      }
    }
  }
  const usableCoverage =
    coverageFrom !== undefined && coverageTo !== undefined && coverageFrom <= coverageTo
      ? { from: coverageFrom, to: coverageTo }
      : undefined;

  // shifts and operators
  const shiftsRaw = root["shifts"];
  const shifts: readonly unknown[] | undefined = Array.isArray(shiftsRaw) ? shiftsRaw : undefined;
  if (shifts === undefined) {
    fieldReasons.push({
      code: "invalid-export-field",
      field: "shifts",
      problem: problemOf(shiftsRaw),
    });
  }
  const operatorsRaw = root["operators"];
  const operators: readonly unknown[] | undefined = Array.isArray(operatorsRaw)
    ? operatorsRaw
    : undefined;
  if (operators === undefined) {
    fieldReasons.push({
      code: "invalid-export-field",
      field: "operators",
      problem: problemOf(operatorsRaw),
    });
  }

  // age of the export
  if (exportedAtMs !== undefined && nowIsValid) {
    if (now < exportedAtMs) {
      ageReasons.push({
        code: "now-before-export",
        exportedAt: String(exportedAtRaw),
        now: new Date(now).toISOString(),
      });
    } else {
      const age = now - exportedAtMs;
      if (age > EXPORT_STALE_LIMIT_MS) {
        ageReasons.push({
          code: "export-stale",
          ageHours: Math.floor(age / MS_PER_HOUR),
          ageMinutes: Math.floor((age % MS_PER_HOUR) / MS_PER_MINUTE),
          limitHours: EXPORT_STALE_LIMIT_HOURS,
        });
      }
    }
  }

  // The swapped shifts, give then take, and the shift set S.
  const swapped: SwappedShift[] = [
    {
      party: "give-shift-owner",
      id: giveShiftId,
      shift: shifts === undefined ? undefined : firstShiftWithId(shifts, giveShiftId),
    },
    {
      party: "take-shift-owner",
      id: takeShiftId,
      shift: shifts === undefined ? undefined : firstShiftWithId(shifts, takeShiftId),
    },
  ];

  if (shifts !== undefined) {
    for (const { id, shift } of swapped) {
      if (shift === undefined) {
        missingShiftReasons.push({ code: "missing-shift", shiftId: id });
      }
    }
  }

  if (operators !== undefined) {
    for (const { party, id, shift } of swapped) {
      if (shift === undefined) {
        continue;
      }
      const employeeNumber = shift["employeeNumber"];
      const operator =
        typeof employeeNumber === "string"
          ? firstOperatorWithNumber(operators, employeeNumber)
          : undefined;
      if (operator === undefined) {
        ownerReasons.push({ code: "owner-not-operator", shiftId: id, party });
        continue;
      }
      const qualifications = operator["qualifications"];
      if (!Array.isArray(qualifications)) {
        qualificationReasons.push({
          code: "qualifications-missing",
          shiftId: id,
          party,
          problem: "absent",
        });
      } else if (qualifications.length === 0) {
        qualificationReasons.push({
          code: "qualifications-missing",
          shiftId: id,
          party,
          problem: "empty",
        });
      }
    }
  }

  const ownerNumbers = new Set<string>();
  for (const { shift } of swapped) {
    const employeeNumber = shift?.["employeeNumber"];
    if (typeof employeeNumber === "string") {
      ownerNumbers.add(employeeNumber);
    }
  }
  const swappedObjects = new Set<PlainObject>();
  for (const { shift } of swapped) {
    if (shift !== undefined) {
      swappedObjects.add(shift);
    }
  }

  const shiftSet: { shiftId: string; shift: PlainObject }[] = [];
  for (const candidate of shifts ?? []) {
    if (!isPlainObject(candidate)) {
      continue;
    }
    const employeeNumber = candidate["employeeNumber"];
    const inSet =
      swappedObjects.has(candidate) ||
      (typeof employeeNumber === "string" && ownerNumbers.has(employeeNumber));
    const shiftId = candidate["shiftId"];
    if (inSet && typeof shiftId === "string") {
      shiftSet.push({ shiftId, shift: candidate });
    }
  }

  // malformed times
  for (const { shiftId, shift } of shiftSet) {
    for (const field of TIME_FIELDS) {
      if (!isLocalWallTime(shift[field])) {
        malformedReasons.push({ code: "shift-time-malformed", shiftId, field });
      }
    }
  }

  // horizon
  if (exportDate !== undefined) {
    const horizonTo = addDays(exportDate, HORIZON_DAYS);
    if (horizonTo !== undefined) {
      for (const { id, shift } of swapped) {
        const start = shift?.["start"];
        if (isLocalWallTime(start)) {
          const date = start.slice(0, 10);
          if (date < exportDate || date > horizonTo) {
            horizonReasons.push({
              code: "shift-outside-horizon",
              shiftId: id,
              start,
              horizonFrom: exportDate,
              horizonTo,
            });
          }
        }
      }
    }
  }

  // clock changes
  if (zone !== undefined) {
    for (const { shiftId, shift } of shiftSet) {
      const start = shift["start"];
      if (usableCoverage !== undefined) {
        if (!isLocalWallTime(start)) {
          continue;
        }
        const date = start.slice(0, 10);
        if (date < usableCoverage.from || date > usableCoverage.to) {
          continue;
        }
      }
      for (const field of TIME_FIELDS) {
        const value = shift[field];
        if (!isLocalWallTime(value)) {
          continue;
        }
        const resolution = resolveLocalTime(value, zone);
        if (resolution.kind === "nonexistent") {
          localTimeReasons.push({ code: "nonexistent-local-time", shiftId, field, value });
        } else if (resolution.kind === "ambiguous") {
          localTimeReasons.push({ code: "ambiguous-local-time", shiftId, field, value });
        }
      }
    }
  }

  const reasons: CannotDetermineReason[] = [
    ...invalidNow,
    ...exportedAtReasons,
    ...zoneReasons,
    ...coverageReasons,
    ...fieldReasons,
    ...ageReasons,
    ...missingShiftReasons,
    ...ownerReasons,
    ...qualificationReasons,
    ...malformedReasons,
    ...horizonReasons,
    ...localTimeReasons,
  ];
  return reasons.length === 0 ? { determinable: true } : { determinable: false, reasons };
}
