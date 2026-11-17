// Raw-record helpers shared by the determinability gate and the swap evaluation, so both read
// the roster the same way. Records are returned as they are in the export, unvalidated.
// Pure: no I/O, no clock. Never throws on bad input.

export type PlainObject = Record<string, unknown>;

export function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
