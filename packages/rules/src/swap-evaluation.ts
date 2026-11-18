// The swap evaluation: the fatigue-policy rules (§ 3.1 off-duty period, § 3.2 seven-day hours,
// § 3.3 qualification) applied to the schedule each employee would have after the swap, plus the
// § 4.2 supervisor-review triggers ((a) off-duty under 12 h, (b) over 60 h in a seven-date
// window), and the classification of the swap: cannot-be-approved (any finding), else
// review-required (any trigger), else approved-without-review.
// Pure: no I/O, no clock, no framework. Meant to run after `assessDeterminability` returned
// `determinable: true`. If a fact the gate guarantees does not hold, it returns
// `{ kind: "not-evaluable" }` rather than throw. Output carries no employee number.

import type { Party } from "./determinability";
import {
  buildShiftSet,
  findSwappedShifts,
  firstOperatorWithNumber,
  isPlainObject,
  isWellFormedQualificationEntry,
  type PlainObject,
  type ShiftSetEntry,
} from "./roster-records";
import {
  addDays,
  elapsedMinutes,
  isLocalDate,
  isLocalWallTime,
  isValidTimeZone,
  resolveLocalTime,
} from "./site-time";

/** The procedure a supervisor follows to approve a swap the rules do not allow. */
export const EXCEPTION_PROCEDURE = "VE-HSSE-PRC-021";

/** § 3.1: the shortest off-duty period between two shifts, in hours. */
const MINIMUM_OFF_DUTY_HOURS = 11;
const MINIMUM_OFF_DUTY_MINUTES = MINIMUM_OFF_DUTY_HOURS * 60;

/** § 3.2: the most scheduled hours in any seven consecutive site-local dates. */
const MAXIMUM_WINDOW_HOURS = 72;
const MAXIMUM_WINDOW_MINUTES = MAXIMUM_WINDOW_HOURS * 60;
/** The number of consecutive site-local dates in a § 3.2 window. */
const WINDOW_DAYS = 7;

/** § 4.2(a): an off-duty period under this many hours needs supervisor review. */
const REVIEW_OFF_DUTY_HOURS = 12;
const REVIEW_OFF_DUTY_MINUTES = REVIEW_OFF_DUTY_HOURS * 60;

/** § 4.2(b): more than this many hours in a seven-date window needs supervisor review. */
const REVIEW_WINDOW_HOURS = 60;
const REVIEW_WINDOW_MINUTES = REVIEW_WINDOW_HOURS * 60;

/** The off-duty period between two consecutive shifts. */
export interface OffDutyPeriod {
  fromShiftId: string;
  toShiftId: string;
  /** End of the previous shift, site-local wall time. */
  from: string;
  /** Start of the next shift, site-local wall time. */
  to: string;
  hours: number;
  /** 0 to 59. */
  minutes: number;
}

export interface OffDutyFinding extends OffDutyPeriod {
  rule: "3.1";
  code: "off-duty-under-minimum";
  changedBySwap: boolean;
  minimumHours: 11;
  /** Present only when the next shift starts before the previous one ends. */
  overlap?: true;
}

/**
 * The scheduled hours in seven consecutive site-local dates, `from` to `to` inclusive. A shift's
 * elapsed time counts wholly on the date it starts, so the 13 Mar night shift is 11 h.
 */
export interface SevenDayWindow {
  /** First site-local date, YYYY-MM-DD. */
  from: string;
  /** Last site-local date, inclusive, YYYY-MM-DD. */
  to: string;
  hours: number;
  /** 0 to 59. */
  minutes: number;
  /** True if the window contains the start date of the shift the employee gave or took. */
  changedBySwap: boolean;
}

/** § 3.2: more than 72 hours in one seven-day window. Exactly 72 hours passes. */
export interface SevenDayHoursFinding {
  rule: "3.2";
  code: "seven-day-hours-over-maximum";
  changedBySwap: boolean;
  maximumHours: 72;
  from: string;
  to: string;
  hours: number;
  /** 0 to 59. */
  minutes: number;
}

/** § 4.2(a): an off-duty period under 12 hours. Exactly 12 hours is no trigger. */
export interface OffDutyReviewTrigger extends OffDutyPeriod {
  rule: "4.2(a)";
  code: "off-duty-under-review-threshold";
  changedBySwap: boolean;
  thresholdHours: 12;
  /** Present only when the next shift starts before the previous one ends. */
  overlap?: true;
}

/** § 4.2(b): more than 60 hours in one seven-day window. Exactly 60 hours is no trigger. */
export interface SevenDayReviewTrigger {
  rule: "4.2(b)";
  code: "seven-day-hours-over-review-threshold";
  changedBySwap: boolean;
  thresholdHours: 60;
  from: string;
  to: string;
  hours: number;
  /** 0 to 59. */
  minutes: number;
}

export type ReviewTrigger = OffDutyReviewTrigger | SevenDayReviewTrigger;

export interface QualificationFinding {
  rule: "3.3";
  code: "qualification-expired" | "no-qualification-for-unit-and-role";
  changedBySwap: boolean;
  shiftId: string;
  unit: string;
  role: string;
  /** Site-local date the shift starts on. */
  shiftStartDate: string;
  /** The latest valid-through date among matching qualifications, or null if none match. */
  validThrough: string | null;
}

export type Finding = OffDutyFinding | SevenDayHoursFinding | QualificationFinding;

export interface EmployeeEvaluation {
  party: Party;
  name: string | null;
  gaveShiftId: string;
  tookShiftId: string;
  offDutyBefore: OffDutyPeriod | null;
  offDutyAfter: OffDutyPeriod | null;
  /** Every seven-date window fully inside coverage, in date order; empty if coverage is shorter. */
  windows: SevenDayWindow[];
  findings: Finding[];
  /** § 4.2 supervisor-review triggers: every (a) trigger in schedule order, then every (b). */
  triggers: ReviewTrigger[];
}

/** The classification of an evaluated swap; see `classifySwap`. */
export type SwapOutcome = "cannot-be-approved" | "review-required" | "approved-without-review";

export type SwapEvaluation =
  | { kind: "evaluated"; outcome: SwapOutcome; employees: [EmployeeEvaluation, EmployeeEvaluation] }
  | { kind: "not-evaluable" };

interface Context {
  zone: string;
  coverage: { from: string; to: string };
  shifts: readonly unknown[];
  operators: readonly unknown[];
}

function readContext(roster: unknown): Context | undefined {
  if (!isPlainObject(roster)) {
    return undefined;
  }
  const site = roster["site"];
  const zone = isPlainObject(site) ? site["timeZone"] : undefined;
  const coverage = roster["coverage"];
  const from = isPlainObject(coverage) ? coverage["from"] : undefined;
  const to = isPlainObject(coverage) ? coverage["to"] : undefined;
  const shifts = roster["shifts"];
  const operators = roster["operators"];
  if (
    !isValidTimeZone(zone) ||
    !isLocalDate(from) ||
    !isLocalDate(to) ||
    from > to ||
    !Array.isArray(shifts) ||
    !Array.isArray(operators)
  ) {
    return undefined;
  }
  return { zone, coverage: { from, to }, shifts, operators };
}

interface Qualification {
  unit: string;
  role: string;
  validThrough: string;
}

/** The operator's qualification entries, or `undefined` if there are none or one is malformed. */
function readQualifications(operator: PlainObject): Qualification[] | undefined {
  const raw = operator["qualifications"];
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const qualifications: Qualification[] = [];
  for (const entry of raw as unknown[]) {
    if (!isWellFormedQualificationEntry(entry)) {
      return undefined;
    }
    const { unit, role, validThrough } = entry;
    qualifications.push({ unit, role, validThrough });
  }
  return qualifications;
}

/** A shift within coverage, with its times resolved to instants. */
interface ScheduleShift {
  shiftId: string;
  unit: string;
  role: string;
  start: string;
  end: string;
  startMs: number;
  endMs: number;
  index: number;
  record: PlainObject;
}

type Resolved = { kind: "in-coverage"; shift: ScheduleShift } | { kind: "outside-coverage" };

/** Start order: by start instant, then by position in the roster. */
function compareByStart(a: ScheduleShift, b: ScheduleShift): number {
  return a.startMs - b.startMs || a.index - b.index;
}

function startsBefore(a: ScheduleShift, b: ScheduleShift): boolean {
  return compareByStart(a, b) < 0;
}

/**
 * A shift set entry as a schedule shift. A shift whose start date is outside coverage is
 * `outside-coverage`; `undefined` when a shift within coverage has unusable data.
 */
function resolveShift(entry: ShiftSetEntry, context: Context): Resolved | undefined {
  const { shift, shiftId, index } = entry;
  const { start, end, unit, role } = shift;
  if (!isLocalWallTime(start)) {
    return undefined;
  }
  const date = start.slice(0, 10);
  if (date < context.coverage.from || date > context.coverage.to) {
    return { kind: "outside-coverage" };
  }
  if (!isLocalWallTime(end) || typeof unit !== "string" || typeof role !== "string") {
    return undefined;
  }
  const startResolution = resolveLocalTime(start, context.zone);
  const endResolution = resolveLocalTime(end, context.zone);
  if (startResolution.kind !== "ok" || endResolution.kind !== "ok") {
    return undefined;
  }
  // A shift that ends at or before it starts is unusable data, as in the determinability gate.
  if (endResolution.epochMs <= startResolution.epochMs) {
    return undefined;
  }
  return {
    kind: "in-coverage",
    shift: {
      shiftId,
      unit,
      role,
      start,
      end,
      startMs: startResolution.epochMs,
      endMs: endResolution.epochMs,
      index,
      record: shift,
    },
  };
}

/**
 * § 3.3: a shift passes if some qualification for its unit and role is valid through the
 * shift's start date. Otherwise it fails as expired (a matching qualification exists) or as
 * missing for that unit and role.
 */
function checkShiftQualification(
  shift: { shiftId: string; unit: string; role: string; start: string },
  qualifications: readonly Qualification[],
  changedBySwap: boolean,
): QualificationFinding | undefined {
  const shiftStartDate = shift.start.slice(0, 10);
  let latest: string | null = null;
  for (const qualification of qualifications) {
    if (qualification.unit !== shift.unit || qualification.role !== shift.role) {
      continue;
    }
    if (qualification.validThrough >= shiftStartDate) {
      return undefined;
    }
    if (latest === null || qualification.validThrough > latest) {
      latest = qualification.validThrough;
    }
  }
  return {
    rule: "3.3",
    code: latest === null ? "no-qualification-for-unit-and-role" : "qualification-expired",
    changedBySwap,
    shiftId: shift.shiftId,
    unit: shift.unit,
    role: shift.role,
    shiftStartDate,
    validThrough: latest,
  };
}

/**
 * § 3.3 over one employee's own shifts that start within coverage, as rostered (nothing
 * swapped, so every finding has `changedBySwap: false`).
 */
export function checkQualifications(
  roster: unknown,
  employeeNumber: string,
): { shiftsChecked: number; findings: QualificationFinding[] } | { kind: "not-evaluable" } {
  const notEvaluable = { kind: "not-evaluable" } as const;
  const context = readContext(roster);
  if (context === undefined) {
    return notEvaluable;
  }
  const operator = firstOperatorWithNumber(context.operators, employeeNumber);
  const qualifications = operator === undefined ? undefined : readQualifications(operator);
  if (qualifications === undefined) {
    return notEvaluable;
  }
  const findings: QualificationFinding[] = [];
  let shiftsChecked = 0;
  for (const candidate of context.shifts) {
    if (!isPlainObject(candidate) || candidate["employeeNumber"] !== employeeNumber) {
      continue;
    }
    const { shiftId, start, unit, role } = candidate;
    if (!isLocalWallTime(start)) {
      return notEvaluable;
    }
    const date = start.slice(0, 10);
    if (date < context.coverage.from || date > context.coverage.to) {
      continue;
    }
    if (typeof shiftId !== "string" || typeof unit !== "string" || typeof role !== "string") {
      return notEvaluable;
    }
    shiftsChecked += 1;
    const finding = checkShiftQualification({ shiftId, unit, role, start }, qualifications, false);
    if (finding !== undefined) {
      findings.push(finding);
    }
  }
  return { shiftsChecked, findings };
}

function offDutyPeriod(
  previous: ScheduleShift,
  next: ScheduleShift,
  zone: string,
): { period: OffDutyPeriod; elapsed: number } | undefined {
  const elapsed = elapsedMinutes(previous.end, next.start, zone);
  if (elapsed === undefined) {
    return undefined;
  }
  const positive = Math.max(elapsed, 0);
  return {
    period: {
      fromShiftId: previous.shiftId,
      toShiftId: next.shiftId,
      from: previous.end,
      to: next.start,
      hours: Math.floor(positive / 60),
      minutes: positive % 60,
    },
    elapsed,
  };
}

/**
 * True when the swap changed this rest: it touches the shift taken, or the shift given sat
 * between these two neighbours before the swap, in start order (start instant, then roster
 * index, the order the schedule is sorted in).
 */
function restChangedBySwap(
  previous: ScheduleShift,
  next: ScheduleShift,
  given: ScheduleShift,
  taken: ScheduleShift,
): boolean {
  return (
    previous === taken ||
    next === taken ||
    (!startsBefore(given, previous) && startsBefore(given, next))
  );
}

interface Swapper {
  party: Party;
  /** Roster employee number of this party. Never leaves this module. */
  ownerNumber: string;
  gave: PlainObject;
  took: PlainObject;
}

function evaluateEmployee(
  context: Context,
  shiftSet: readonly ShiftSetEntry[],
  swapper: Swapper,
): EmployeeEvaluation | undefined {
  const { party, ownerNumber, gave, took } = swapper;
  const operator = firstOperatorWithNumber(context.operators, ownerNumber);
  const qualifications = operator === undefined ? undefined : readQualifications(operator);
  const gaveEntry = shiftSet.find((entry) => entry.shift === gave);
  if (operator === undefined || qualifications === undefined || gaveEntry === undefined) {
    return undefined;
  }
  const gaveResolved = resolveShift(gaveEntry, context);
  if (gaveResolved?.kind !== "in-coverage") {
    return undefined;
  }
  const given = gaveResolved.shift;

  // The resulting schedule: the owner's shifts without the one given, with the one taken.
  const schedule: ScheduleShift[] = [];
  for (const entry of shiftSet) {
    if (entry.shift !== took && (entry.shift["employeeNumber"] !== ownerNumber || entry.shift === gave)) {
      continue;
    }
    const resolved = resolveShift(entry, context);
    if (resolved === undefined) {
      return undefined;
    }
    if (resolved.kind === "in-coverage") {
      schedule.push(resolved.shift);
    }
  }
  schedule.sort(compareByStart);
  const takenIndex = schedule.findIndex((shift) => shift.record === took);
  const taken = schedule[takenIndex];
  if (taken === undefined) {
    return undefined;
  }

  // A rest is measured between consecutive shifts in start order, from the previous shift's
  // end. A shift nested inside its predecessor (starts after it, ends before it) is unspecified
  // by the standard; the rest after it is still measured from the nested shift's own end.
  const offDutyFindings: OffDutyFinding[] = [];
  const offDutyTriggers: OffDutyReviewTrigger[] = [];
  const rests: OffDutyPeriod[] = [];
  for (let i = 0; i + 1 < schedule.length; i += 1) {
    const previous = schedule[i];
    const next = schedule[i + 1];
    if (previous === undefined || next === undefined) {
      return undefined;
    }
    const rest = offDutyPeriod(previous, next, context.zone);
    if (rest === undefined) {
      return undefined;
    }
    rests.push(rest.period);
    const overlap = rest.elapsed < 0 ? { overlap: true as const } : {};
    if (rest.elapsed < MINIMUM_OFF_DUTY_MINUTES) {
      const changedBySwap = restChangedBySwap(previous, next, given, taken);
      offDutyFindings.push({
        rule: "3.1",
        code: "off-duty-under-minimum",
        changedBySwap,
        minimumHours: MINIMUM_OFF_DUTY_HOURS,
        ...rest.period,
        ...overlap,
      });
    }
    if (rest.elapsed < REVIEW_OFF_DUTY_MINUTES) {
      offDutyTriggers.push({
        rule: "4.2(a)",
        code: "off-duty-under-review-threshold",
        changedBySwap: restChangedBySwap(previous, next, given, taken),
        thresholdHours: REVIEW_OFF_DUTY_HOURS,
        ...rest.period,
        ...overlap,
      });
    }
  }

  // § 3.2: a shift's elapsed minutes count wholly on its site-local start date.
  const minutesByDate = new Map<string, number>();
  for (const shift of schedule) {
    const minutes = elapsedMinutes(shift.start, shift.end, context.zone);
    if (minutes === undefined) {
      return undefined;
    }
    const date = shift.start.slice(0, 10);
    minutesByDate.set(date, (minutesByDate.get(date) ?? 0) + minutes);
  }
  const givenDate = given.start.slice(0, 10);
  const takenDate = taken.start.slice(0, 10);
  const windows: SevenDayWindow[] = [];
  const sevenDayFindings: SevenDayHoursFinding[] = [];
  const sevenDayTriggers: SevenDayReviewTrigger[] = [];
  let from: string | undefined = context.coverage.from;
  for (;;) {
    const to = addDays(from, WINDOW_DAYS - 1);
    if (to === undefined || to > context.coverage.to) {
      break;
    }
    let total = 0;
    for (let offset = 0; offset < WINDOW_DAYS; offset += 1) {
      const date = addDays(from, offset);
      if (date === undefined) {
        return undefined;
      }
      total += minutesByDate.get(date) ?? 0;
    }
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    const changedBySwap =
      (from <= givenDate && givenDate <= to) || (from <= takenDate && takenDate <= to);
    windows.push({ from, to, hours, minutes, changedBySwap });
    if (total > MAXIMUM_WINDOW_MINUTES) {
      sevenDayFindings.push({
        rule: "3.2",
        code: "seven-day-hours-over-maximum",
        changedBySwap,
        maximumHours: MAXIMUM_WINDOW_HOURS,
        from,
        to,
        hours,
        minutes,
      });
    }
    if (total > REVIEW_WINDOW_MINUTES) {
      sevenDayTriggers.push({
        rule: "4.2(b)",
        code: "seven-day-hours-over-review-threshold",
        changedBySwap,
        thresholdHours: REVIEW_WINDOW_HOURS,
        from,
        to,
        hours,
        minutes,
      });
    }
    from = addDays(from, 1);
    if (from === undefined) {
      return undefined;
    }
  }

  const qualificationFindings: QualificationFinding[] = [];
  for (const shift of schedule) {
    const finding = checkShiftQualification(shift, qualifications, shift === taken);
    if (finding !== undefined) {
      qualificationFindings.push(finding);
    }
  }

  const name = operator["name"];
  return {
    party,
    name: typeof name === "string" ? name : null,
    gaveShiftId: given.shiftId,
    tookShiftId: taken.shiftId,
    offDutyBefore: rests[takenIndex - 1] ?? null,
    offDutyAfter: rests[takenIndex] ?? null,
    windows,
    findings: [...offDutyFindings, ...sevenDayFindings, ...qualificationFindings],
    triggers: [...offDutyTriggers, ...sevenDayTriggers],
  };
}

/**
 * The outcome of an evaluated swap. Precedence: any finding (§ 3) makes it
 * `cannot-be-approved`; otherwise any review trigger (§ 4.2) makes it `review-required`;
 * otherwise `approved-without-review`. "Cannot determine" is decided earlier, by the
 * determinability gate, and the 422 refusal of a `cannot-be-approved` swap is in the API.
 */
export function classifySwap(
  employees: readonly { findings: readonly unknown[]; triggers: readonly unknown[] }[],
): SwapOutcome {
  if (employees.some((employee) => employee.findings.length > 0)) {
    return "cannot-be-approved";
  }
  if (employees.some((employee) => employee.triggers.length > 0)) {
    return "review-required";
  }
  return "approved-without-review";
}

/**
 * Applies the swap and checks each employee's resulting schedule against §§ 3.1, 3.2 and 3.3,
 * evaluates the § 4.2 review triggers, and classifies the swap. Never throws and never reads a
 * clock.
 */
export function evaluateSwap(
  roster: unknown,
  input: { giveShiftId: string; takeShiftId: string },
): SwapEvaluation {
  const notEvaluable = { kind: "not-evaluable" } as const;
  const context = readContext(roster);
  if (context === undefined) {
    return notEvaluable;
  }
  const [giveShift, takeShift] = findSwappedShifts(
    context.shifts,
    input.giveShiftId,
    input.takeShiftId,
  );
  if (giveShift === undefined || takeShift === undefined) {
    return notEvaluable;
  }
  const giveOwner = giveShift["employeeNumber"];
  const takeOwner = takeShift["employeeNumber"];
  if (typeof giveOwner !== "string" || typeof takeOwner !== "string") {
    return notEvaluable;
  }
  const shiftSet = buildShiftSet(context.shifts, [giveShift, takeShift]);
  const giver = evaluateEmployee(context, shiftSet, {
    party: "give-shift-owner",
    ownerNumber: giveOwner,
    gave: giveShift,
    took: takeShift,
  });
  const taker = evaluateEmployee(context, shiftSet, {
    party: "take-shift-owner",
    ownerNumber: takeOwner,
    gave: takeShift,
    took: giveShift,
  });
  if (giver === undefined || taker === undefined) {
    return notEvaluable;
  }
  const employees: [EmployeeEvaluation, EmployeeEvaluation] = [giver, taker];
  return { kind: "evaluated", outcome: classifySwap(employees), employees };
}
