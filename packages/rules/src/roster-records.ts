// Raw-record helpers shared by the determinability gate and the swap evaluation, so both read
// the roster the same way. Records are returned as they are in the export, unvalidated.
// Pure: no I/O, no clock. Never throws on bad input.

import { isLocalDate } from "./site-time";

export type PlainObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A field of a qualification entry, in the order the gate reports them. */
export type QualificationEntryField = "unit" | "role" | "validThrough";

/**
 * The fields of a qualification entry that are unusable, in the order unit, role, validThrough:
 * `unit` and `role` must be strings, `validThrough` a site-local date. The single definition of
 * entry validity, shared by the gate and the swap evaluation.
 */
export function malformedQualificationFields(entry: PlainObject): QualificationEntryField[] {
  const malformed: QualificationEntryField[] = [];
  if (typeof entry["unit"] !== "string") {
    malformed.push("unit");
  }
  if (typeof entry["role"] !== "string") {
    malformed.push("role");
  }
  if (!isLocalDate(entry["validThrough"])) {
    malformed.push("validThrough");
  }
  return malformed;
}

/** A qualification entry that is an object with a string unit and role and a valid date. */
export function isWellFormedQualificationEntry(
  entry: unknown,
): entry is { unit: string; role: string; validThrough: string } & PlainObject {
  return isPlainObject(entry) && malformedQualificationFields(entry).length === 0;
}

export function firstShiftWithId(shifts: readonly unknown[], id: string): PlainObject | undefined {
  return shifts.find(
    (shift): shift is PlainObject => isPlainObject(shift) && shift["shiftId"] === id,
  );
}

export function firstOperatorWithNumber(
  operators: readonly unknown[],
  employeeNumber: string,
): PlainObject | undefined {
  return operators.find(
    (operator): operator is PlainObject =>
      isPlainObject(operator) && operator["employeeNumber"] === employeeNumber,
  );
}

/** The first shift with each id, give then take. `undefined` where there is none. */
export function findSwappedShifts(
  shifts: readonly unknown[] | undefined,
  giveShiftId: string,
  takeShiftId: string,
): [PlainObject | undefined, PlainObject | undefined] {
  return shifts === undefined
    ? [undefined, undefined]
    : [firstShiftWithId(shifts, giveShiftId), firstShiftWithId(shifts, takeShiftId)];
}

/** A shift in the shift set: its id, the raw record and its position in the roster. */
export interface ShiftSetEntry {
  shiftId: string;
  shift: PlainObject;
  index: number;
}

/**
 * Every shift that belongs to either swapped shift's owner, or is one of the swapped shift
 * records itself, in roster order. Only shifts with a string `shiftId` are kept. Not filtered
 * by coverage or validity.
 */
export function buildShiftSet(
  shifts: readonly unknown[] | undefined,
  swappedShifts: readonly (PlainObject | undefined)[],
): ShiftSetEntry[] {
  const ownerNumbers = new Set<string>();
  const swappedObjects = new Set<PlainObject>();
  for (const shift of swappedShifts) {
    if (shift === undefined) {
      continue;
    }
    swappedObjects.add(shift);
    const employeeNumber = shift["employeeNumber"];
    if (typeof employeeNumber === "string") {
      ownerNumbers.add(employeeNumber);
    }
  }

  const shiftSet: ShiftSetEntry[] = [];
  (shifts ?? []).forEach((candidate, index) => {
    if (!isPlainObject(candidate)) {
      return;
    }
    const employeeNumber = candidate["employeeNumber"];
    const inSet =
      swappedObjects.has(candidate) ||
      (typeof employeeNumber === "string" && ownerNumbers.has(employeeNumber));
    const shiftId = candidate["shiftId"];
    if (inSet && typeof shiftId === "string") {
      shiftSet.push({ shiftId, shift: candidate, index });
    }
  });
  return shiftSet;
}
