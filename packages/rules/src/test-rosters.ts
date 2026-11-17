// Test-only builder for synthetic roster exports shaped like data/roster.sample.json.
// Every value is fictional. Imported by tests only; it is not exported from index.ts.
// Date arithmetic here is deliberately independent of site-time.ts so the tests that use it
// do not depend on the code they check.

export interface RosterQualification {
  unit: string;
  role: string;
  validThrough: string;
}

export interface RosterOperator {
  employeeNumber: string;
  name: string;
  qualifications?: RosterQualification[];
}

export interface RosterShift {
  shiftId: string;
  unit: string;
  role: string;
  start: string;
  end: string;
  employeeNumber: string;
}

export interface RosterFixture {
  exportedAt: string;
  site: { name: string; timeZone: string };
  coverage: { from: string; to: string };
  units: { code: string; name: string }[];
  operators: RosterOperator[];
  supervisors: { employeeNumber: string; name: string; units: string[] }[];
  shifts: RosterShift[];
}

export const SAMPLE_EXPORTED_AT = "2027-03-07T08:00:00Z";
export const SAMPLE_EXPORT_DATE = "2027-03-07";
export const SITE_TIME_ZONE = "America/Chicago";

export const GIVE_SHIFT_ID = "GIVE-A1";
export const TAKE_SHIFT_ID = "TAKE-B1";
/** A second shift of the give owner. */
export const GIVE_OTHER_SHIFT_ID = "GIVE-A2";
/** A second shift of the take owner. */
export const TAKE_OTHER_SHIFT_ID = "TAKE-B2";
/** A shift of an operator who is not part of the swap. */
export const BYSTANDER_SHIFT_ID = "OTHER-C1";

export const GIVE_OWNER = "900001";
export const TAKE_OWNER = "900002";
export const BYSTANDER = "900003";

/** `date` (YYYY-MM-DD) moved by `days` calendar days. */
export function plusDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

export function makeShift(
  shiftId: string,
  employeeNumber: string,
  start: string,
  end: string,
): RosterShift {
  return { shiftId, unit: "CDU", role: "CONSOLE", start, end, employeeNumber };
}

function makeOperator(employeeNumber: string, name: string): RosterOperator {
  return {
    employeeNumber,
    name,
    qualifications: [{ unit: "CDU", role: "CONSOLE", validThrough: "2030-12-31" }],
  };
}

export interface RosterOptions {
  /** UTC instant of the export. Defaults to the sample's. */
  exportedAt?: string;
  /** Site-local date of `exportedAt`. The coverage and every shift are placed relative to it. */
  exportDate?: string;
  timeZone?: string;
}

/**
 * A roster the gate accepts for a swap of GIVE_SHIFT_ID and TAKE_SHIFT_ID: coverage is
 * exportDate-6 to exportDate+21, both swapped shifts start inside the horizon (+3 and +4 days),
 * and both owners are qualified operators.
 */
export function buildRoster(options: RosterOptions = {}): RosterFixture {
  const exportedAt = options.exportedAt ?? SAMPLE_EXPORTED_AT;
  const d = options.exportDate ?? SAMPLE_EXPORT_DATE;
  const day = (offset: number): string => plusDays(d, offset);
  return {
    exportedAt,
    site: { name: "Test Harbor Works", timeZone: options.timeZone ?? SITE_TIME_ZONE },
    coverage: { from: day(-6), to: day(21) },
    units: [{ code: "CDU", name: "Test Distillation Unit" }],
    operators: [
      makeOperator(GIVE_OWNER, "Alex Example"),
      makeOperator(TAKE_OWNER, "Blair Sample"),
      makeOperator(BYSTANDER, "Casey Placeholder"),
    ],
    supervisors: [{ employeeNumber: "900100", name: "Dana Fictional", units: ["CDU"] }],
    shifts: [
      makeShift(GIVE_SHIFT_ID, GIVE_OWNER, `${day(3)}T06:00`, `${day(3)}T18:00`),
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, `${day(4)}T06:00`, `${day(4)}T18:00`),
      makeShift(GIVE_OTHER_SHIFT_ID, GIVE_OWNER, `${day(5)}T06:00`, `${day(5)}T18:00`),
      makeShift(TAKE_OTHER_SHIFT_ID, TAKE_OWNER, `${day(6)}T06:00`, `${day(6)}T18:00`),
      makeShift(BYSTANDER_SHIFT_ID, BYSTANDER, `${day(7)}T06:00`, `${day(7)}T18:00`),
    ],
  };
}

// Mutators return a new roster and leave the input untouched.

export function replaceShift(
  roster: RosterFixture,
  shiftId: string,
  patch: Partial<RosterShift>,
): RosterFixture {
  return {
    ...roster,
    shifts: roster.shifts.map((shift) =>
      shift.shiftId === shiftId ? { ...shift, ...patch } : shift,
    ),
  };
}

export function addShift(roster: RosterFixture, shift: RosterShift): RosterFixture {
  return { ...roster, shifts: [...roster.shifts, shift] };
}

export function removeShift(roster: RosterFixture, shiftId: string): RosterFixture {
  return { ...roster, shifts: roster.shifts.filter((shift) => shift.shiftId !== shiftId) };
}

export function removeOperator(roster: RosterFixture, employeeNumber: string): RosterFixture {
  return {
    ...roster,
    operators: roster.operators.filter((operator) => operator.employeeNumber !== employeeNumber),
  };
}

/** Sets an operator's qualifications; `undefined` leaves the field out of the record. */
export function setQualifications(
  roster: RosterFixture,
  employeeNumber: string,
  qualifications: RosterQualification[] | undefined,
): RosterFixture {
  return {
    ...roster,
    operators: roster.operators.map((operator) => {
      if (operator.employeeNumber !== employeeNumber) {
        return operator;
      }
      return qualifications === undefined
        ? { employeeNumber: operator.employeeNumber, name: operator.name }
        : { ...operator, qualifications };
    }),
  };
}

export function withCoverage(roster: RosterFixture, from: string, to: string): RosterFixture {
  return { ...roster, coverage: { from, to } };
}
