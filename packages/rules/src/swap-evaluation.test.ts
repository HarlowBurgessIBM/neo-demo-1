import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { EXCEPTION_PROCEDURE, checkQualifications, evaluateSwap } from "./swap-evaluation";
import type {
  EmployeeEvaluation,
  Finding,
  OffDutyFinding,
  QualificationFinding,
  SevenDayHoursFinding,
  SevenDayWindow,
  SwapEvaluation,
} from "./swap-evaluation";
import {
  BYSTANDER,
  GIVE_OWNER,
  GIVE_SHIFT_ID,
  TAKE_OWNER,
  TAKE_SHIFT_ID,
  buildRoster,
  makeShift,
  plusDays,
  replaceShift,
  setQualifications,
  withCoverage,
} from "./test-rosters";
import type { RosterFixture, RosterQualification, RosterShift } from "./test-rosters";

const MINUTE_MS = 60_000;
const GIVE_NAME = "Alex Example";
const TAKE_NAME = "Blair Sample";
/** buildRoster's coverage, for the default export date: 2027-03-01 to 2027-03-28. */
const COVERAGE_FROM = "2027-03-01";
const COVERAGE_TO = "2027-03-28";

/**
 * `wall` (YYYY-MM-DDTHH:mm) plus `minutes`, as plain calendar arithmetic with no time zone.
 * Independent of site-time.ts. Only used on dates with no clock change, where wall and real
 * time agree.
 */
function wallPlus(wall: string, minutes: number): string {
  return new Date(Date.parse(`${wall}:00Z`) + minutes * MINUTE_MS).toISOString().slice(0, 16);
}

/** The builder roster with `shifts` in place of its own. Coverage is 2027-03-01 to 2027-03-28. */
function rosterOf(shifts: RosterShift[], base: RosterFixture = buildRoster()): RosterFixture {
  return { ...base, shifts };
}

function evaluate(roster: unknown): SwapEvaluation {
  return evaluateSwap(roster, { giveShiftId: GIVE_SHIFT_ID, takeShiftId: TAKE_SHIFT_ID });
}

/** The two employees' evaluations, give owner first. Fails if the swap is not evaluable. */
function evaluated(roster: unknown): [EmployeeEvaluation, EmployeeEvaluation] {
  const result = evaluate(roster);
  if (result.kind !== "evaluated") {
    throw new Error("expected the swap to be evaluable");
  }
  return result.employees;
}

function isOffDuty(finding: Finding): finding is OffDutyFinding {
  return finding.rule === "3.1";
}

function isQualification(finding: Finding): finding is QualificationFinding {
  return finding.rule === "3.3";
}

/**
 * The 22 windows of the builder roster (2027-03-01 to 2027-03-28) for an employee whose only
 * shift in coverage starts on `worked` and lasts `workedMinutes`. A window changed by the swap
 * contains the date of the shift given or taken.
 */
function windowsForOneShift(
  worked: string,
  workedMinutes: number,
  swapDates: [string, string],
): SevenDayWindow[] {
  const windows: SevenDayWindow[] = [];
  for (let i = 0; i < 22; i += 1) {
    const from = plusDays(COVERAGE_FROM, i);
    const to = plusDays(from, 6);
    const total = from <= worked && worked <= to ? workedMinutes : 0;
    windows.push({
      from,
      to,
      hours: Math.floor(total / 60),
      minutes: total % 60,
      changedBySwap: swapDates.some((date) => from <= date && date <= to),
    });
  }
  return windows;
}

function offDutyFindings(employee: EmployeeEvaluation): OffDutyFinding[] {
  return employee.findings.filter(isOffDuty);
}

function qualificationFindings(employee: EmployeeEvaluation): QualificationFinding[] {
  return employee.findings.filter(isQualification);
}

function isSevenDay(finding: Finding): finding is SevenDayHoursFinding {
  return finding.rule === "3.2";
}

function sevenDayFindings(employee: EmployeeEvaluation): SevenDayHoursFinding[] {
  return employee.findings.filter(isSevenDay);
}

/** § 3.2 maximum, written out here so the tests do not depend on the code's constant. */
const MAXIMUM_WINDOW_MINUTES = 72 * 60;
const DAY_MS = 86_400_000;

function totalMinutes(amount: { hours: number; minutes: number }): number {
  return amount.hours * 60 + amount.minutes;
}

/** Number of calendar dates from `from` to `to` inclusive. Independent of site-time.ts. */
function daysInclusive(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** `wall` (YYYY-MM-DDTHH:mm) as whole minutes on a plain calendar, with no time zone. */
function wallMinutes(wall: string): number {
  return Date.parse(`${wall}:00Z`) / MINUTE_MS;
}

/** The `from`/`to` of every seven-date window that fits inside `coverage`, in date order. */
function expectedWindowDates(coverage: { from: string; to: string }): [string, string][] {
  const count = Math.max(0, daysInclusive(coverage.from, coverage.to) - 6);
  return Array.from({ length: count }, (_, i): [string, string] => [
    plusDays(coverage.from, i),
    plusDays(coverage.from, i + 6),
  ]);
}

/**
 * The minutes each window starting at `coverageFrom`, `coverageFrom`+1 … (`count` of them)
 * should hold, given `contributions` of [start date, elapsed minutes].
 */
function expectedTotals(
  coverageFrom: string,
  count: number,
  contributions: readonly [string, number][],
): number[] {
  return Array.from({ length: count }, (_, i) => {
    const from = plusDays(coverageFrom, i);
    const to = plusDays(from, 6);
    return contributions
      .filter(([date]) => from <= date && date <= to)
      .reduce((sum, [, minutes]) => sum + minutes, 0);
  });
}

function windowTotals(employee: EmployeeEvaluation): number[] {
  return employee.windows.map(totalMinutes);
}

function windowStarting(employee: EmployeeEvaluation, from: string): SevenDayWindow | undefined {
  return employee.windows.find((window) => window.from === from);
}

/** Checks the shape of an employee's windows and § 3.2 findings against the coverage. */
function expectWellFormedWindows(
  employee: EmployeeEvaluation,
  coverage: { from: string; to: string },
): void {
  const { windows } = employee;
  expect(windows.map(({ from, to }) => [from, to])).toEqual(expectedWindowDates(coverage));
  for (const window of windows) {
    expect(Number.isInteger(window.hours) && window.hours >= 0).toBe(true);
    expect(Number.isInteger(window.minutes) && window.minutes >= 0 && window.minutes <= 59).toBe(
      true,
    );
    expect(typeof window.changedBySwap).toBe("boolean");
  }
  const findings = sevenDayFindings(employee);
  // One finding for each window over the maximum, in window order, and no others.
  expect(findings.map(({ from, to }) => [from, to])).toEqual(
    windows.filter((window) => totalMinutes(window) > MAXIMUM_WINDOW_MINUTES).map(({ from, to }) => [from, to]),
  );
  for (const finding of findings) {
    expect(finding.maximumHours).toBe(72);
    expect(totalMinutes(finding)).toBeGreaterThan(MAXIMUM_WINDOW_MINUTES);
    expect(windows.find((window) => window.from === finding.from && window.to === finding.to)).toEqual({
      from: finding.from,
      to: finding.to,
      hours: finding.hours,
      minutes: finding.minutes,
      changedBySwap: finding.changedBySwap,
    });
  }
}

/** A shift of an owner that gives no § 3.1 or § 3.3 trouble on its own. */
const GIVE_DEFAULT = makeShift(GIVE_SHIFT_ID, GIVE_OWNER, "2027-03-10T06:00", "2027-03-10T18:00");
const TAKE_DEFAULT = makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-11T06:00", "2027-03-11T18:00");

/** The give owner gives GIVE-A1 (20 Mar) and takes TAKE-B1; `others` are the give owner's other shifts. */
function giveOwnerRoster(takeShift: RosterShift, others: RosterShift[]): RosterFixture {
  return rosterOf([
    ...others,
    makeShift(GIVE_SHIFT_ID, GIVE_OWNER, "2027-03-20T06:00", "2027-03-20T18:00"),
    takeShift,
  ]);
}

describe("EXCEPTION_PROCEDURE", () => {
  test("names the procedure a supervisor follows", () => {
    expect(EXCEPTION_PROCEDURE).toBe("VE-HSSE-PRC-021");
  });
});

describe("the evaluation result", () => {
  test("a swap with no problem is evaluated, with no findings and each party named", () => {
    const [give, take] = evaluated(rosterOf([GIVE_DEFAULT, TAKE_DEFAULT]));
    expect(give).toEqual({
      party: "give-shift-owner",
      name: GIVE_NAME,
      gaveShiftId: GIVE_SHIFT_ID,
      tookShiftId: TAKE_SHIFT_ID,
      offDutyBefore: null,
      offDutyAfter: null,
      windows: windowsForOneShift("2027-03-11", 720, ["2027-03-10", "2027-03-11"]),
      findings: [],
    });
    expect(take).toEqual({
      party: "take-shift-owner",
      name: TAKE_NAME,
      gaveShiftId: TAKE_SHIFT_ID,
      tookShiftId: GIVE_SHIFT_ID,
      offDutyBefore: null,
      offDutyAfter: null,
      windows: windowsForOneShift("2027-03-10", 720, ["2027-03-10", "2027-03-11"]),
      findings: [],
    });
  });

  test("an operator whose name is missing or not text has a null name", () => {
    const roster = rosterOf([GIVE_DEFAULT, TAKE_DEFAULT]);
    const operators = roster.operators.map((operator) => {
      if (operator.employeeNumber === GIVE_OWNER) {
        return { employeeNumber: operator.employeeNumber, qualifications: operator.qualifications };
      }
      return { ...operator, name: 42 };
    });
    const [give, take] = evaluated({ ...roster, operators });
    expect(give.name).toBeNull();
    expect(take.name).toBeNull();
  });

  test("the output carries no employee number", () => {
    const roster = giveOwnerRoster(
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-10T20:00", "2027-03-11T08:00"),
      [makeShift("A-PREV", GIVE_OWNER, "2027-03-10T06:00", "2027-03-10T18:00")],
    );
    const bystander = makeShift("OTHER-C1", BYSTANDER, "2027-03-10T19:00", "2027-03-10T23:00");
    const result = evaluate({ ...roster, shifts: [...roster.shifts, bystander] });
    expect(result.kind).toBe("evaluated");
    const text = JSON.stringify(result);
    expect(text).toContain("off-duty-under-minimum");
    for (const number of [GIVE_OWNER, TAKE_OWNER, BYSTANDER]) {
      expect(text).not.toContain(number);
    }
  });

  test("another employee's shifts are not part of either schedule", () => {
    const roster = giveOwnerRoster(
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-11T06:00", "2027-03-11T18:00"),
      [makeShift("A-PREV", GIVE_OWNER, "2027-03-10T06:00", "2027-03-10T18:00")],
    );
    const bystander = makeShift("OTHER-C1", BYSTANDER, "2027-03-10T19:00", "2027-03-11T05:00");
    const [give, take] = evaluated({ ...roster, shifts: [...roster.shifts, bystander] });
    expect(give.findings).toEqual([]);
    expect(take.findings).toEqual([]);
  });
});

describe("§ 3.1 off-duty boundary (criterion 3)", () => {
  /** The give owner's previous shift ends 10 Mar 18:00; the shift they take starts `restMinutes` later. */
  function restRoster(restMinutes: number): RosterFixture {
    const previousEnd = "2027-03-10T18:00";
    const takeStart = wallPlus(previousEnd, restMinutes);
    return giveOwnerRoster(
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, takeStart, wallPlus(takeStart, 12 * 60)),
      [makeShift("A-PREV", GIVE_OWNER, "2027-03-10T06:00", previousEnd)],
    );
  }

  function periodOf(restMinutes: number) {
    return {
      fromShiftId: "A-PREV",
      toShiftId: TAKE_SHIFT_ID,
      from: "2027-03-10T18:00",
      to: wallPlus("2027-03-10T18:00", restMinutes),
      hours: Math.floor(restMinutes / 60),
      minutes: restMinutes % 60,
    };
  }

  test("a rest of exactly 11 h (660 min) passes", () => {
    const [give, take] = evaluated(restRoster(660));
    expect(give.findings).toEqual([]);
    expect(take.findings).toEqual([]);
    expect(give.offDutyBefore).toEqual(periodOf(660));
    expect(give.offDutyBefore).toMatchObject({ hours: 11, minutes: 0 });
  });

  test("a rest of 10 h 59 min (659 min) fails", () => {
    const [give, take] = evaluated(restRoster(659));
    expect(take.findings).toEqual([]);
    expect(give.findings).toStrictEqual([
      {
        rule: "3.1",
        code: "off-duty-under-minimum",
        changedBySwap: true,
        minimumHours: 11,
        ...periodOf(659),
      },
    ]);
    expect(give.findings).toMatchObject([{ hours: 10, minutes: 59 }]);
  });

  test("a rest of 0 h (0 min) fails, and is not reported as an overlap", () => {
    const [give, take] = evaluated(restRoster(0));
    expect(take.findings).toEqual([]);
    expect(give.findings).toStrictEqual([
      {
        rule: "3.1",
        code: "off-duty-under-minimum",
        changedBySwap: true,
        minimumHours: 11,
        ...periodOf(0),
      },
    ]);
  });

  test("the rest is real elapsed time: 18:00 to 05:00 across the spring clock change is 10 h and fails", () => {
    const roster = giveOwnerRoster(
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-14T05:00", "2027-03-14T17:00"),
      [makeShift("A-PREV", GIVE_OWNER, "2027-03-13T06:00", "2027-03-13T18:00")],
    );
    const [give] = evaluated(roster);
    expect(give.findings).toMatchObject([
      { rule: "3.1", hours: 10, minutes: 0, from: "2027-03-13T18:00", to: "2027-03-14T05:00" },
    ]);
  });

  test("the rest is real elapsed time: 18:00 to 06:00 across the spring clock change is 11 h and passes", () => {
    const roster = giveOwnerRoster(
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-14T06:00", "2027-03-14T18:00"),
      [makeShift("A-PREV", GIVE_OWNER, "2027-03-13T06:00", "2027-03-13T18:00")],
    );
    const [give] = evaluated(roster);
    expect(give.findings).toEqual([]);
    expect(give.offDutyBefore).toMatchObject({ hours: 11, minutes: 0 });
  });

  test("the take owner's rest is checked the same way", () => {
    // B gives TAKE-B1 and takes GIVE-A1 (20 Mar 06:00); B's previous shift ends 19 Mar 19:01.
    const roster = rosterOf([
      makeShift("B-PREV", TAKE_OWNER, "2027-03-19T07:01", "2027-03-19T19:01"),
      makeShift(GIVE_SHIFT_ID, GIVE_OWNER, "2027-03-20T06:00", "2027-03-20T18:00"),
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-25T06:00", "2027-03-25T18:00"),
    ]);
    const [give, take] = evaluated(roster);
    expect(give.findings).toEqual([]);
    expect(take.findings).toStrictEqual([
      {
        rule: "3.1",
        code: "off-duty-under-minimum",
        changedBySwap: true,
        minimumHours: 11,
        fromShiftId: "B-PREV",
        toShiftId: GIVE_SHIFT_ID,
        from: "2027-03-19T19:01",
        to: "2027-03-20T06:00",
        hours: 10,
        minutes: 59,
      },
    ]);
  });

  test("property: for any rest of 0 to 1,500 min the give owner has a finding exactly when it is under 660, with its length as hours and minutes", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ min: 0, max: 1500 }), fc.integer({ min: 655, max: 665 })),
        (restMinutes) => {
          const [give, take] = evaluated(restRoster(restMinutes));
          expect(offDutyFindings(take)).toEqual([]);
          const findings = offDutyFindings(give);
          if (restMinutes < 660) {
            expect(findings).toHaveLength(1);
            expect(findings[0]).toMatchObject({
              code: "off-duty-under-minimum",
              hours: Math.floor(restMinutes / 60),
              minutes: restMinutes % 60,
            });
          } else {
            expect(findings).toEqual([]);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("§ 3.3 qualification (criterion 4)", () => {
  const parties = [
    { party: "give-shift-owner", owner: GIVE_OWNER, index: 0, takenShiftId: TAKE_SHIFT_ID },
    { party: "take-shift-owner", owner: TAKE_OWNER, index: 1, takenShiftId: GIVE_SHIFT_ID },
  ] as const;

  describe.each(parties)("the $party", ({ owner, index, takenShiftId }) => {
    /** Both swapped shifts start and end at the given times; `owner` has `qualifications`. */
    function qualificationRoster(
      start: string,
      end: string,
      qualifications: RosterQualification[],
    ): RosterFixture {
      const roster = rosterOf([
        makeShift(GIVE_SHIFT_ID, GIVE_OWNER, start, end),
        makeShift(TAKE_SHIFT_ID, TAKE_OWNER, start, end),
      ]);
      return setQualifications(roster, owner, qualifications);
    }

    const consoleThrough = (validThrough: string): RosterQualification[] => [
      { unit: "CDU", role: "CONSOLE", validThrough },
    ];

    test("a shift starting on the validThrough date passes", () => {
      const roster = qualificationRoster("2027-03-12T06:00", "2027-03-12T18:00", consoleThrough("2027-03-12"));
      expect(evaluated(roster)[index].findings).toEqual([]);
    });

    test("an 18:00 night shift starting on the validThrough date and ending the next day passes", () => {
      const roster = qualificationRoster("2027-03-12T18:00", "2027-03-13T06:00", consoleThrough("2027-03-12"));
      expect(evaluated(roster)[index].findings).toEqual([]);
    });

    test("a shift starting the day after validThrough fails as expired", () => {
      const roster = qualificationRoster("2027-03-13T06:00", "2027-03-13T18:00", consoleThrough("2027-03-12"));
      expect(evaluated(roster)[index].findings).toStrictEqual([
        {
          rule: "3.3",
          code: "qualification-expired",
          changedBySwap: true,
          shiftId: takenShiftId,
          unit: "CDU",
          role: "CONSOLE",
          shiftStartDate: "2027-03-13",
          validThrough: "2027-03-12",
        },
      ]);
    });

    test("a night shift starting the day after validThrough fails", () => {
      const roster = qualificationRoster("2027-03-13T00:00", "2027-03-13T08:00", consoleThrough("2027-03-12"));
      expect(evaluated(roster)[index].findings).toMatchObject([
        { rule: "3.3", code: "qualification-expired", shiftStartDate: "2027-03-13" },
      ]);
    });

    test("a unit match with a role mismatch fails, with no validThrough", () => {
      const roster = qualificationRoster("2027-03-12T06:00", "2027-03-12T18:00", [
        { unit: "CDU", role: "FIELD", validThrough: "2030-12-31" },
      ]);
      expect(evaluated(roster)[index].findings).toStrictEqual([
        {
          rule: "3.3",
          code: "no-qualification-for-unit-and-role",
          changedBySwap: true,
          shiftId: takenShiftId,
          unit: "CDU",
          role: "CONSOLE",
          shiftStartDate: "2027-03-12",
          validThrough: null,
        },
      ]);
    });

    test("a unit mismatch with a matching role fails, with no validThrough", () => {
      const roster = qualificationRoster("2027-03-12T06:00", "2027-03-12T18:00", [
        { unit: "HCU", role: "CONSOLE", validThrough: "2030-12-31" },
      ]);
      expect(evaluated(roster)[index].findings).toMatchObject([
        { rule: "3.3", code: "no-qualification-for-unit-and-role", validThrough: null },
      ]);
    });

    test("with several expired matches the latest validThrough is reported", () => {
      const roster = qualificationRoster("2027-03-12T06:00", "2027-03-12T18:00", [
        { unit: "CDU", role: "CONSOLE", validThrough: "2027-03-01" },
        { unit: "CDU", role: "CONSOLE", validThrough: "2027-03-10" },
        { unit: "HCU", role: "CONSOLE", validThrough: "2030-12-31" },
        { unit: "CDU", role: "FIELD", validThrough: "2030-12-31" },
      ]);
      expect(evaluated(roster)[index].findings).toMatchObject([
        { code: "qualification-expired", validThrough: "2027-03-10" },
      ]);
    });

    test("one valid entry among expired and mismatched ones is enough", () => {
      const roster = qualificationRoster("2027-03-12T06:00", "2027-03-12T18:00", [
        { unit: "CDU", role: "CONSOLE", validThrough: "2027-03-01" },
        { unit: "HCU", role: "CONSOLE", validThrough: "2030-12-31" },
        { unit: "CDU", role: "CONSOLE", validThrough: "2027-03-12" },
      ]);
      expect(evaluated(roster)[index].findings).toEqual([]);
    });
  });

  test("property: for any validThrough the shift has an expiry finding exactly when validThrough is before its start date", () => {
    const startDate = fc.integer({ min: 0, max: 24 }).map((days) => plusDays("2027-03-02", days));
    const offsetFromStart = fc.integer({ min: -3, max: 3 });
    const farOffset = fc.integer({ min: -60, max: 60 });
    fc.assert(
      fc.property(
        fc.constantFrom(...parties),
        startDate,
        fc.oneof(offsetFromStart, farOffset),
        ({ owner, index, takenShiftId }, start, offset) => {
          const validThrough = plusDays(start, offset);
          const roster = rosterOf([
            makeShift(GIVE_SHIFT_ID, GIVE_OWNER, `${start}T06:00`, `${start}T18:00`),
            makeShift(TAKE_SHIFT_ID, TAKE_OWNER, `${start}T06:00`, `${start}T18:00`),
          ]);
          const result = evaluated(
            setQualifications(roster, owner, [{ unit: "CDU", role: "CONSOLE", validThrough }]),
          );
          const findings = qualificationFindings(result[index]);
          if (validThrough < start) {
            expect(findings).toStrictEqual([
              {
                rule: "3.3",
                code: "qualification-expired",
                changedBySwap: true,
                shiftId: takenShiftId,
                unit: "CDU",
                role: "CONSOLE",
                shiftStartDate: start,
                validThrough,
              },
            ]);
          } else {
            expect(findings).toEqual([]);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("all failures are listed (criterion 8)", () => {
  // The give owner fails § 3.1 (takes a shift 2 h after a shift of theirs ends). The take owner
  // fails § 3.3 (takes GIVE-A1 on 15 Mar, after their CDU CONSOLE qualification ran out).
  const roster = setQualifications(
    rosterOf([
      makeShift("A-PREV", GIVE_OWNER, "2027-03-10T06:00", "2027-03-10T18:00"),
      makeShift(GIVE_SHIFT_ID, GIVE_OWNER, "2027-03-15T06:00", "2027-03-15T18:00"),
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-10T20:00", "2027-03-11T08:00"),
    ]),
    TAKE_OWNER,
    [{ unit: "CDU", role: "CONSOLE", validThrough: "2027-03-11" }],
  );

  test("lists the § 3.1 finding under the give owner and the § 3.3 finding under the take owner", () => {
    const [give, take] = evaluated(roster);
    expect([give, take].map(({ party, name }) => ({ party, name }))).toEqual([
      { party: "give-shift-owner", name: GIVE_NAME },
      { party: "take-shift-owner", name: TAKE_NAME },
    ]);
    expect(give.findings).toStrictEqual([
      {
        rule: "3.1",
        code: "off-duty-under-minimum",
        changedBySwap: true,
        minimumHours: 11,
        fromShiftId: "A-PREV",
        toShiftId: TAKE_SHIFT_ID,
        from: "2027-03-10T18:00",
        to: "2027-03-10T20:00",
        hours: 2,
        minutes: 0,
      },
    ]);
    expect(take.findings).toStrictEqual([
      {
        rule: "3.3",
        code: "qualification-expired",
        changedBySwap: true,
        shiftId: GIVE_SHIFT_ID,
        unit: "CDU",
        role: "CONSOLE",
        shiftStartDate: "2027-03-15",
        validThrough: "2027-03-11",
      },
    ]);
  });

  test("each employee carries only their own failure", () => {
    const [give, take] = evaluated(roster);
    expect(qualificationFindings(give)).toEqual([]);
    expect(offDutyFindings(take)).toEqual([]);
  });
});

describe("a rest that was not changed by the swap (criterion 9)", () => {
  test("a rest under 11 h elsewhere in the schedule is a finding with changedBySwap false", () => {
    const roster = giveOwnerRoster(
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-24T06:00", "2027-03-24T18:00"),
      [
        makeShift("A-S1", GIVE_OWNER, "2027-03-08T06:00", "2027-03-08T18:00"),
        makeShift("A-S2", GIVE_OWNER, "2027-03-08T22:00", "2027-03-09T06:00"),
      ],
    );
    const [give, take] = evaluated(roster);
    expect(take.findings).toEqual([]);
    expect(give.findings).toStrictEqual([
      {
        rule: "3.1",
        code: "off-duty-under-minimum",
        changedBySwap: false,
        minimumHours: 11,
        fromShiftId: "A-S1",
        toShiftId: "A-S2",
        from: "2027-03-08T18:00",
        to: "2027-03-08T22:00",
        hours: 4,
        minutes: 0,
      },
    ]);
  });
});

describe("changedBySwap for § 3.1 when the given shift is removed", () => {
  const takeFar = makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-20T06:00", "2027-03-20T18:00");
  const previous = makeShift("A-P", GIVE_OWNER, "2027-03-10T06:00", "2027-03-10T18:00");
  const next = makeShift("A-N", GIVE_OWNER, "2027-03-11T04:00", "2027-03-11T12:00");

  test("a rest made adjacent by removing the given shift is changed by the swap", () => {
    const given = makeShift(GIVE_SHIFT_ID, GIVE_OWNER, "2027-03-10T19:00", "2027-03-11T03:00");
    const [give] = evaluated(rosterOf([previous, given, next, takeFar]));
    expect(give.findings).toMatchObject([
      {
        rule: "3.1",
        changedBySwap: true,
        fromShiftId: "A-P",
        toShiftId: "A-N",
        hours: 10,
        minutes: 0,
      },
    ]);
    expect(give.findings).toHaveLength(1);
  });

  test("the same rest with the given shift after both neighbours is not changed by the swap", () => {
    const given = makeShift(GIVE_SHIFT_ID, GIVE_OWNER, "2027-03-12T06:00", "2027-03-12T18:00");
    const [give] = evaluated(rosterOf([previous, next, given, takeFar]));
    expect(give.findings).toMatchObject([
      { rule: "3.1", changedBySwap: false, fromShiftId: "A-P", toShiftId: "A-N" },
    ]);
  });

  test("a given shift that started inside the previous shift (an overlap) still sits between its neighbours", () => {
    const overlapping = makeShift(GIVE_SHIFT_ID, GIVE_OWNER, "2027-03-10T10:00", "2027-03-10T22:00");
    const quickNext = makeShift("A-N", GIVE_OWNER, "2027-03-11T02:00", "2027-03-11T10:00");
    const [give] = evaluated(rosterOf([previous, overlapping, quickNext, takeFar]));
    expect(give.findings).toMatchObject([
      {
        rule: "3.1",
        changedBySwap: true,
        fromShiftId: "A-P",
        toShiftId: "A-N",
        hours: 8,
        minutes: 0,
      },
    ]);
    expect(give.findings).toHaveLength(1);
  });

  describe("a given shift that starts at the same instant as a neighbour is ordered by roster position", () => {
    const sameStartPrevious = makeShift("A-P", GIVE_OWNER, "2027-03-10T06:00", "2027-03-10T18:00");
    const sameStartGiven = makeShift(GIVE_SHIFT_ID, GIVE_OWNER, "2027-03-10T06:00", "2027-03-10T14:00");
    const quickNext = makeShift("A-N", GIVE_OWNER, "2027-03-11T02:00", "2027-03-11T10:00");

    test("listed after the previous shift: it sat between, so the rest is changed", () => {
      const [give] = evaluated(rosterOf([sameStartPrevious, sameStartGiven, quickNext, takeFar]));
      expect(give.findings).toMatchObject([{ rule: "3.1", changedBySwap: true, hours: 8 }]);
    });

    test("listed before the previous shift: it did not sit between, so the rest is not changed", () => {
      const [give] = evaluated(rosterOf([sameStartGiven, sameStartPrevious, quickNext, takeFar]));
      expect(give.findings).toMatchObject([{ rule: "3.1", changedBySwap: false, hours: 8 }]);
    });
  });
});

describe("an overlapping taken shift", () => {
  const roster = giveOwnerRoster(
    makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-10T17:00", "2027-03-11T05:00"),
    [makeShift("A-PREV", GIVE_OWNER, "2027-03-10T06:00", "2027-03-10T18:00")],
  );

  test("gives a § 3.1 finding of 0 h 0 min with overlap true", () => {
    const [give] = evaluated(roster);
    expect(give.findings).toStrictEqual([
      {
        rule: "3.1",
        code: "off-duty-under-minimum",
        changedBySwap: true,
        minimumHours: 11,
        fromShiftId: "A-PREV",
        toShiftId: TAKE_SHIFT_ID,
        from: "2027-03-10T18:00",
        to: "2027-03-10T17:00",
        hours: 0,
        minutes: 0,
        overlap: true,
      },
    ]);
  });

  test("shows the period before the taken shift as 0 h 0 min", () => {
    const [give] = evaluated(roster);
    expect(give.offDutyBefore).toStrictEqual({
      fromShiftId: "A-PREV",
      toShiftId: TAKE_SHIFT_ID,
      from: "2027-03-10T18:00",
      to: "2027-03-10T17:00",
      hours: 0,
      minutes: 0,
    });
  });
});

describe("offDutyBefore and offDutyAfter", () => {
  test("are null when the taken shift has no neighbour", () => {
    const [give, take] = evaluated(rosterOf([GIVE_DEFAULT, TAKE_DEFAULT]));
    expect(give.offDutyBefore).toBeNull();
    expect(give.offDutyAfter).toBeNull();
    expect(take.offDutyBefore).toBeNull();
    expect(take.offDutyAfter).toBeNull();
  });

  test("are null on the side with no neighbour", () => {
    const onlyBefore = giveOwnerRoster(
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-12T06:00", "2027-03-12T18:00"),
      [makeShift("A-PREV", GIVE_OWNER, "2027-03-10T06:00", "2027-03-10T18:00")],
    );
    const [givesBefore] = evaluated(onlyBefore);
    expect(givesBefore.offDutyBefore).not.toBeNull();
    expect(givesBefore.offDutyAfter).toBeNull();

    const onlyAfter = giveOwnerRoster(
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-12T06:00", "2027-03-12T18:00"),
      [makeShift("A-NEXT", GIVE_OWNER, "2027-03-14T06:00", "2027-03-14T18:00")],
    );
    const [givesAfter] = evaluated(onlyAfter);
    expect(givesAfter.offDutyBefore).toBeNull();
    expect(givesAfter.offDutyAfter).not.toBeNull();
  });

  test("are the periods around the taken shift, even when they pass", () => {
    const roster = giveOwnerRoster(
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-12T06:00", "2027-03-12T18:00"),
      [
        makeShift("A-PREV", GIVE_OWNER, "2027-03-10T06:00", "2027-03-10T18:00"),
        makeShift("A-NEXT", GIVE_OWNER, "2027-03-14T08:30", "2027-03-14T18:00"),
      ],
    );
    const [give] = evaluated(roster);
    expect(give.findings).toEqual([]);
    expect(give.offDutyBefore).toEqual({
      fromShiftId: "A-PREV",
      toShiftId: TAKE_SHIFT_ID,
      from: "2027-03-10T18:00",
      to: "2027-03-12T06:00",
      hours: 36,
      minutes: 0,
    });
    // 12 Mar 18:00 to 14 Mar 08:30: the clocks change on 14 Mar, so 38 h 30 min of clock is 37 h 30 min.
    expect(give.offDutyAfter).toEqual({
      fromShiftId: TAKE_SHIFT_ID,
      toShiftId: "A-NEXT",
      from: "2027-03-12T18:00",
      to: "2027-03-14T08:30",
      hours: 37,
      minutes: 30,
    });
  });
});

describe("shifts outside coverage", () => {
  describe("§ 3.1: only shifts that start within coverage are considered", () => {
    test.each([
      {
        label: "starting on the first coverage date",
        firstStart: "2027-03-01T00:00",
        firstEnd: "2027-03-01T04:00",
        secondStart: "2027-03-01T05:00",
        secondEnd: "2027-03-01T13:00",
        counted: true,
      },
      {
        label: "starting the day before the first coverage date",
        firstStart: "2027-02-28T22:00",
        firstEnd: "2027-03-01T04:00",
        secondStart: "2027-03-01T05:00",
        secondEnd: "2027-03-01T13:00",
        counted: false,
      },
      {
        label: "starting on the last coverage date",
        firstStart: "2027-03-28T06:00",
        firstEnd: "2027-03-28T18:00",
        secondStart: "2027-03-28T19:00",
        secondEnd: "2027-03-29T03:00",
        counted: true,
      },
      {
        label: "starting the day after the last coverage date",
        firstStart: "2027-03-28T06:00",
        firstEnd: "2027-03-28T18:00",
        secondStart: "2027-03-29T00:00",
        secondEnd: "2027-03-29T04:00",
        counted: false,
      },
    ])("a short rest involving a shift $label", ({ firstStart, firstEnd, secondStart, secondEnd, counted }) => {
      const roster = giveOwnerRoster(
        makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-15T06:00", "2027-03-15T18:00"),
        [
          makeShift("A-X1", GIVE_OWNER, firstStart, firstEnd),
          makeShift("A-X2", GIVE_OWNER, secondStart, secondEnd),
        ],
      );
      const [give] = evaluated(roster);
      if (counted) {
        expect(give.findings).toMatchObject([
          { rule: "3.1", changedBySwap: false, fromShiftId: "A-X1", toShiftId: "A-X2", hours: 1 },
        ]);
        expect(give.findings).toHaveLength(1);
      } else {
        expect(give.findings).toEqual([]);
      }
    });

    test("a shift outside coverage need not have a usable end, unit or role", () => {
      const outside = { ...makeShift("A-OUT", GIVE_OWNER, "2027-04-02T06:00", "garbage"), unit: 7, role: null };
      const roster = giveOwnerRoster(
        makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-15T06:00", "2027-03-15T18:00"),
        [],
      );
      const [give] = evaluated({ ...roster, shifts: [...roster.shifts, outside] });
      expect(give.findings).toEqual([]);
    });
  });

  describe("§ 3.3: criterion 15, a shift neither given nor taken", () => {
    // The give owner is qualified for CDU CONSOLE through 9 Mar, takes TAKE-B1 on 8 Mar and
    // gives GIVE-A1 on 12 Mar (after the qualification ends, but no longer in their schedule).
    function keptShiftRoster(keptStart: string): RosterFixture {
      const roster = rosterOf([
        makeShift("A-KEEP", GIVE_OWNER, keptStart, wallPlus(keptStart, 12 * 60)),
        makeShift(GIVE_SHIFT_ID, GIVE_OWNER, "2027-03-12T06:00", "2027-03-12T18:00"),
        makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-08T06:00", "2027-03-08T18:00"),
      ]);
      return setQualifications(roster, GIVE_OWNER, [
        { unit: "CDU", role: "CONSOLE", validThrough: "2027-03-09" },
      ]);
    }

    test("an expired kept shift within coverage is a finding naming it, with changedBySwap false", () => {
      const [give, take] = evaluated(keptShiftRoster("2027-03-10T06:00"));
      expect(take.findings).toEqual([]);
      expect(give.findings).toStrictEqual([
        {
          rule: "3.3",
          code: "qualification-expired",
          changedBySwap: false,
          shiftId: "A-KEEP",
          unit: "CDU",
          role: "CONSOLE",
          shiftStartDate: "2027-03-10",
          validThrough: "2027-03-09",
        },
      ]);
    });

    test("an expired kept shift on the last coverage date is still a finding", () => {
      const [give] = evaluated(keptShiftRoster("2027-03-28T06:00"));
      expect(give.findings).toMatchObject([
        { rule: "3.3", changedBySwap: false, shiftId: "A-KEEP", shiftStartDate: "2027-03-28" },
      ]);
    });

    test.each([
      ["the day before the first coverage date", "2027-02-28T06:00"],
      ["the day after the last coverage date", "2027-03-29T06:00"],
    ])("the same expired shift %s gives no finding", (_label, keptStart) => {
      const [give, take] = evaluated(keptShiftRoster(keptStart));
      expect(give.findings).toEqual([]);
      expect(take.findings).toEqual([]);
    });

    test("an expired given shift is not a finding, because it leaves the schedule", () => {
      const [give] = evaluated(keptShiftRoster("2027-03-02T06:00"));
      expect(qualificationFindings(give)).toEqual([]);
    });
  });
});

describe("ordering", () => {
  // The take owner is listed first in the roster and in operators. The give owner's shifts are
  // listed latest first, so a result in roster order would come out reversed.
  const roster = ((): RosterFixture => {
    const base = rosterOf([
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-20T06:00", "2027-03-20T18:00"),
      { ...makeShift("A-S3", GIVE_OWNER, "2027-03-09T06:00", "2027-03-09T14:00"), unit: "HCU" },
      makeShift("A-S2", GIVE_OWNER, "2027-03-08T20:00", "2027-03-09T04:00"),
      { ...makeShift("A-S1", GIVE_OWNER, "2027-03-08T06:00", "2027-03-08T18:00"), unit: "HCU" },
      makeShift(GIVE_SHIFT_ID, GIVE_OWNER, "2027-03-25T06:00", "2027-03-25T18:00"),
    ]);
    return { ...base, operators: [...base.operators].reverse() };
  })();

  test("the give owner comes first and the take owner second", () => {
    const [first, second] = evaluated(roster);
    expect(first.party).toBe("give-shift-owner");
    expect(first.name).toBe(GIVE_NAME);
    expect(second.party).toBe("take-shift-owner");
    expect(second.name).toBe(TAKE_NAME);
  });

  test("an employee's § 3.1 findings come before their § 3.3 findings, each in time order", () => {
    const [give] = evaluated(roster);
    const summary = give.findings.map((finding) => {
      if (isOffDuty(finding)) {
        return [finding.rule, finding.fromShiftId, finding.toShiftId];
      }
      return finding.rule === "3.3" ? [finding.rule, finding.shiftId] : [finding.rule];
    });
    expect(summary).toEqual([
      ["3.1", "A-S1", "A-S2"],
      ["3.1", "A-S2", "A-S3"],
      ["3.3", "A-S1"],
      ["3.3", "A-S3"],
    ]);
  });

  test("the taken shift is evaluated in its place in time", () => {
    const [give] = evaluated(roster);
    expect(give.offDutyBefore).toMatchObject({ fromShiftId: "A-S3", toShiftId: TAKE_SHIFT_ID });
    expect(give.offDutyAfter).toBeNull();
  });
});

describe("§ 3.2 seven-day hours", () => {
  const runs = { numRuns: 300 };

  // No clock change anywhere near this date in America/Chicago.
  const QUIET_FROM = "2027-05-03";

  /**
   * A roster whose coverage is `days` dates from QUIET_FROM. The swapped shifts start on its
   * first and (if there is one) second date, 12 h each.
   */
  function coverageRoster(days: number): RosterFixture {
    const second = days > 1 ? plusDays(QUIET_FROM, 1) : QUIET_FROM;
    return withCoverage(
      rosterOf([
        makeShift(GIVE_SHIFT_ID, GIVE_OWNER, `${QUIET_FROM}T06:00`, `${QUIET_FROM}T18:00`),
        makeShift(TAKE_SHIFT_ID, TAKE_OWNER, `${second}T06:00`, `${second}T18:00`),
      ]),
      QUIET_FROM,
      plusDays(QUIET_FROM, days - 1),
    );
  }

  /**
   * The give owner's schedule after the swap: six shifts starting 06:00 on 1 to 6 Mar with the
   * given `durations` (minutes), and the shift taken on 24 Mar. The shift given starts on
   * `givenDate`.
   */
  function sixShiftRoster(durations: readonly number[], givenDate: string): RosterFixture {
    return rosterOf([
      ...durations.map((duration, i) => {
        const start = `2027-03-0${i + 1}T06:00`;
        return makeShift(`A-D${i + 1}`, GIVE_OWNER, start, wallPlus(start, duration));
      }),
      makeShift(GIVE_SHIFT_ID, GIVE_OWNER, `${givenDate}T06:00`, `${givenDate}T18:00`),
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-24T06:00", "2027-03-24T18:00"),
    ]);
  }

  describe("windows in coverage (criterion 1)", () => {
    test("coverage 1 to 28 Mar has 22 windows, starting 1 to 22 Mar, the last ending on coverage.to", () => {
      for (const employee of evaluated(rosterOf([GIVE_DEFAULT, TAKE_DEFAULT]))) {
        expect(employee.windows).toHaveLength(22);
        expect(employee.windows.map((window) => window.from)).toEqual(
          Array.from({ length: 22 }, (_, i) => plusDays("2027-03-01", i)),
        );
        for (const window of employee.windows) {
          expect(window.to).toBe(plusDays(window.from, 6));
        }
        expect(employee.windows[0]?.from).toBe("2027-03-01");
        expect(employee.windows[21]?.from).toBe("2027-03-22");
        expect(employee.windows[21]?.to).toBe(COVERAGE_TO);
      }
    });

    test.each([
      [1, 0],
      [6, 0],
      [7, 1],
      [8, 2],
    ])("coverage of %i dates has %i windows", (days, count) => {
      for (const employee of evaluated(coverageRoster(days))) {
        expect(employee.windows).toHaveLength(count);
      }
    });

    test("coverage shorter than seven dates gives empty windows and no § 3.2 finding", () => {
      for (const employee of evaluated(coverageRoster(6))) {
        expect(employee.windows).toEqual([]);
        expect(sevenDayFindings(employee)).toEqual([]);
      }
    });

    test("a coverage of exactly seven dates has one window, the whole coverage", () => {
      for (const employee of evaluated(coverageRoster(7))) {
        expect(employee.windows).toEqual([
          {
            from: QUIET_FROM,
            to: plusDays(QUIET_FROM, 6),
            hours: 12,
            minutes: 0,
            changedBySwap: true,
          },
        ]);
      }
    });

    test("property: n dates of coverage give max(0, n − 6) consecutive windows inside coverage, holding the right hours", () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 45 }), (days) => {
          const roster = coverageRoster(days);
          const [give, take] = evaluated(roster);
          const count = Math.max(0, days - 6);
          const second = days > 1 ? plusDays(QUIET_FROM, 1) : QUIET_FROM;
          for (const employee of [give, take]) {
            expect(employee.windows).toHaveLength(count);
            expect(employee.windows.map(({ from, to }) => [from, to])).toEqual(
              Array.from({ length: count }, (_, i) => [
                plusDays(QUIET_FROM, i),
                plusDays(QUIET_FROM, i + 6),
              ]),
            );
            for (const window of employee.windows) {
              expect(window.from >= roster.coverage.from).toBe(true);
              expect(window.to <= roster.coverage.to).toBe(true);
            }
            if (count > 0) {
              expect(employee.windows[count - 1]?.to).toBe(roster.coverage.to);
            }
          }
          // The give owner ends with the shift starting on `second`; the take owner with the first.
          expect(windowTotals(give)).toEqual(expectedTotals(QUIET_FROM, count, [[second, 720]]));
          expect(windowTotals(take)).toEqual(expectedTotals(QUIET_FROM, count, [[QUIET_FROM, 720]]));
        }),
        runs,
      );
    });
  });

  describe("hours count wholly on the site-local start date (criterion 2)", () => {
    test("a night shift 6 Mar 18:00 to 7 Mar 06:00 is 12 h in the windows holding 6 Mar and 0 h in the window starting 7 Mar", () => {
      const roster = giveOwnerRoster(
        makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-24T06:00", "2027-03-24T18:00"),
        [makeShift("A-NIGHT", GIVE_OWNER, "2027-03-06T18:00", "2027-03-07T06:00")],
      );
      const [give] = evaluated(roster);
      // Windows starting 1 to 6 Mar contain 6 Mar; the take (24 Mar) is in the windows starting 18 to 22 Mar.
      for (const from of ["2027-03-01", "2027-03-02", "2027-03-03", "2027-03-04", "2027-03-05", "2027-03-06"]) {
        expect(windowStarting(give, from)).toMatchObject({ hours: 12, minutes: 0 });
      }
      expect(windowStarting(give, "2027-03-07")).toMatchObject({ hours: 0, minutes: 0 });
      expect(windowTotals(give)).toEqual(
        expectedTotals(COVERAGE_FROM, 22, [
          ["2027-03-06", 720],
          ["2027-03-24", 720],
        ]),
      );
    });

    // The oracle is plain calendar arithmetic on the wall-clock strings. In UTC wall and real
    // time are the same. In America/Chicago the only clock change in 1 to 28 Mar 2027 is
    // 14 Mar 02:00 → 03:00 (CST, UTC−6, to CDT, UTC−5), so a shift that starts before 02:00
    // and ends at or after 03:00 on that date has one wall hour that never happened. Shifts
    // that start or end inside the skipped hour are not generated (the engine rejects them).
    const GAP_START = "2027-03-14T02:00";
    const GAP_END = "2027-03-14T03:00";
    const inGap = (wall: string): boolean => wall >= GAP_START && wall < GAP_END;
    const MARCH_START = "2027-03-01T00:00";

    const shiftSpec = fc
      .record({
        startMinute: fc.integer({ min: 0, max: 28 * 24 * 60 - 1 }),
        duration: fc.integer({ min: 1, max: 20 * 60 }),
      })
      .filter(
        ({ startMinute, duration }) =>
          !inGap(wallPlus(MARCH_START, startMinute)) &&
          !inGap(wallPlus(MARCH_START, startMinute + duration)),
      );
    type ShiftSpec = { startMinute: number; duration: number };

    function shiftOf(shiftId: string, owner: string, spec: ShiftSpec): RosterShift {
      const start = wallPlus(MARCH_START, spec.startMinute);
      return makeShift(shiftId, owner, start, wallPlus(start, spec.duration));
    }

    /** [start date, elapsed minutes] by calendar arithmetic, less the lost hour if the shift spans the gap. */
    function oracleContribution(shift: RosterShift, zoneHasGap: boolean): [string, number] {
      const spansGap = zoneHasGap && shift.start < GAP_START && shift.end >= GAP_END;
      const minutes = wallMinutes(shift.end) - wallMinutes(shift.start) - (spansGap ? 60 : 0);
      return [shift.start.slice(0, 10), minutes];
    }

    test.each([
      ["UTC", false],
      ["America/Chicago", true],
    ])(
      "property in %s: the windows starting 1, 8, 15 and 22 Mar sum to the hours of the shifts starting in coverage",
      (zone, zoneHasGap) => {
        fc.assert(
          fc.property(
            shiftSpec,
            shiftSpec,
            fc.array(
              fc.record({
                owner: fc.constantFrom(GIVE_OWNER, TAKE_OWNER, BYSTANDER),
                spec: shiftSpec,
              }),
              { maxLength: 12 },
            ),
            (giveSpec, takeSpec, extras) => {
              const give = shiftOf(GIVE_SHIFT_ID, GIVE_OWNER, giveSpec);
              const take = shiftOf(TAKE_SHIFT_ID, TAKE_OWNER, takeSpec);
              const others = extras.map(({ owner, spec }, i) => shiftOf(`X${i}`, owner, spec));
              const roster = {
                ...rosterOf([give, take, ...others]),
                site: { name: "Test Harbor Works", timeZone: zone },
              };
              const [giveEmployee, takeEmployee] = evaluated(roster);
              // After the swap each owner has their other shifts plus the shift they took.
              const schedules: [EmployeeEvaluation, RosterShift[]][] = [
                [giveEmployee, [...others.filter((s) => s.employeeNumber === GIVE_OWNER), take]],
                [takeEmployee, [...others.filter((s) => s.employeeNumber === TAKE_OWNER), give]],
              ];
              const starts = [0, 7, 14, 21].map((offset) => plusDays(COVERAGE_FROM, offset));
              for (const [employee, schedule] of schedules) {
                const contributions = schedule.map((shift) => oracleContribution(shift, zoneHasGap));
                const observed = starts.map((from) => {
                  const window = windowStarting(employee, from);
                  return window === undefined ? undefined : totalMinutes(window);
                });
                expect(observed).toEqual(
                  expectedTotals(COVERAGE_FROM, 22, contributions).filter((_, i) => i % 7 === 0),
                );
                const all = contributions.reduce((sum, [, minutes]) => sum + minutes, 0);
                expect(observed.reduce<number>((sum, minutes) => sum + (minutes ?? 0), 0)).toBe(all);
              }
            },
          ),
          runs,
        );
      },
    );
  });

  describe("the 72 h boundary (criterion 3)", () => {
    const twelveHours = [720, 720, 720, 720, 720, 720];

    test("six 12 h shifts in one window are 72 h 0 m and no § 3.2 finding", () => {
      const [give, take] = evaluated(sixShiftRoster(twelveHours, "2027-03-07"));
      expect(windowStarting(give, "2027-03-01")).toEqual({
        from: "2027-03-01",
        to: "2027-03-07",
        hours: 72,
        minutes: 0,
        changedBySwap: true,
      });
      expect(give.findings).toEqual([]);
      expect(take.findings).toEqual([]);
    });

    test("one of them 12 h 1 m is 72 h 1 m and exactly one § 3.2 finding", () => {
      const [give, take] = evaluated(sixShiftRoster([720, 720, 720, 720, 720, 721], "2027-03-07"));
      expect(windowStarting(give, "2027-03-01")).toEqual({
        from: "2027-03-01",
        to: "2027-03-07",
        hours: 72,
        minutes: 1,
        changedBySwap: true,
      });
      expect(give.findings).toEqual([
        {
          rule: "3.2",
          code: "seven-day-hours-over-maximum",
          changedBySwap: true,
          maximumHours: 72,
          from: "2027-03-01",
          to: "2027-03-07",
          hours: 72,
          minutes: 1,
        },
      ]);
      expect(take.findings).toEqual([]);
    });

    test("the finding's keys are in the documented order", () => {
      const [give] = evaluated(sixShiftRoster([720, 720, 720, 720, 720, 721], "2027-03-07"));
      expect(Object.keys(give.findings[0] ?? {})).toEqual([
        "rule",
        "code",
        "changedBySwap",
        "maximumHours",
        "from",
        "to",
        "hours",
        "minutes",
      ]);
    });

    test("property: for a window total of 4200 to 4440 minutes there is a finding exactly when it is over 4320", () => {
      // The extra choices put the boundary and its neighbours in every run.
      const total = fc.oneof(
        fc.integer({ min: 4200, max: 4440 }),
        fc.constantFrom(4319, 4320, 4321),
      );
      // Five shifts of 10 to 13 h and a sixth that makes up the total (3 h 20 m to 24 h).
      const firstFive = fc.array(fc.integer({ min: 600, max: 800 }), { minLength: 5, maxLength: 5 });
      fc.assert(
        fc.property(total, firstFive, (minutes, five) => {
          const last = minutes - five.reduce((sum, duration) => sum + duration, 0);
          const [give] = evaluated(sixShiftRoster([...five, last], "2027-03-07"));
          const window = windowStarting(give, "2027-03-01");
          expect(window && totalMinutes(window)).toBe(minutes);
          const findings = sevenDayFindings(give).filter((finding) => finding.from === "2027-03-01");
          if (minutes > 4320) {
            expect(findings).toEqual([
              {
                rule: "3.2",
                code: "seven-day-hours-over-maximum",
                changedBySwap: true,
                maximumHours: 72,
                from: "2027-03-01",
                to: "2027-03-07",
                hours: Math.floor(minutes / 60),
                minutes: minutes % 60,
              },
            ]);
          } else {
            expect(findings).toEqual([]);
          }
        }),
        runs,
      );
    });
  });

  describe("DST hours (criterion 4)", () => {
    function nightRoster(nightDate: string): RosterFixture {
      return rosterOf([
        makeShift("A-NIGHT", GIVE_OWNER, `${nightDate}T18:00`, wallPlus(`${nightDate}T18:00`, 720)),
        makeShift(GIVE_SHIFT_ID, GIVE_OWNER, "2027-03-25T06:00", "2027-03-25T18:00"),
        makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-26T06:00", "2027-03-26T18:00"),
      ]);
    }

    test("in America/Chicago the 13 Mar 18:00 to 14 Mar 06:00 shift is 11 h in each window holding 13 Mar", () => {
      const [give] = evaluated(nightRoster("2027-03-13"));
      for (const from of ["2027-03-07", "2027-03-08", "2027-03-09", "2027-03-10", "2027-03-11", "2027-03-12", "2027-03-13"]) {
        expect(windowStarting(give, from)).toMatchObject({ hours: 11, minutes: 0 });
      }
      expect(windowTotals(give)).toEqual(
        expectedTotals(COVERAGE_FROM, 22, [
          ["2027-03-13", 660],
          ["2027-03-26", 720],
        ]),
      );
    });

    test.each(["2027-03-04", "2027-03-12", "2027-03-14", "2027-03-20"])(
      "a same-shaped night shift starting %s is 12 h",
      (nightDate) => {
        const [give] = evaluated(nightRoster(nightDate));
        expect(windowTotals(give)).toEqual(
          expectedTotals(COVERAGE_FROM, 22, [
            [nightDate, 720],
            ["2027-03-26", 720],
          ]),
        );
      },
    );
  });

  describe("changedBySwap on a window", () => {
    /** Where in its start date a shift starts, and how long it lasts. */
    interface Shape {
      minuteOfDay: number;
      minutes: number;
    }
    const DAY: Shape = { minuteOfDay: 6 * 60, minutes: 720 };
    /** 18:00 to 06:00 the next date. */
    const NIGHT: Shape = { minuteOfDay: 18 * 60, minutes: 720 };

    function walls(date: string, shape: Shape): [string, string] {
      const start = wallPlus(`${date}T00:00`, shape.minuteOfDay);
      return [start, wallPlus(start, shape.minutes)];
    }

    function swapRoster(
      givenDate: string,
      takenDate: string,
      givenShape: Shape = DAY,
      takenShape: Shape = DAY,
    ): RosterFixture {
      return rosterOf([
        makeShift(GIVE_SHIFT_ID, GIVE_OWNER, ...walls(givenDate, givenShape)),
        makeShift(TAKE_SHIFT_ID, TAKE_OWNER, ...walls(takenDate, takenShape)),
      ]);
    }

    test("is true exactly when the window holds the start date of the shift given or taken", () => {
      const [give, take] = evaluated(swapRoster("2027-03-05", "2027-03-17"));
      // Windows starting 1 to 5 Mar hold 5 Mar; those starting 11 to 17 Mar hold 17 Mar.
      const changedStarts = [1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 16, 17].map((day) =>
        plusDays("2027-03-01", day - 1),
      );
      for (const employee of [give, take]) {
        expect(employee.windows).toHaveLength(22);
        for (const window of employee.windows) {
          expect(window.changedBySwap).toBe(changedStarts.includes(window.from));
        }
      }
    });

    test("is true for a window holding only the given shift's date, and for one holding only the taken shift's date", () => {
      const [give, take] = evaluated(swapRoster("2027-03-02", "2027-03-27"));
      for (const employee of [give, take]) {
        expect(windowStarting(employee, "2027-03-01")?.changedBySwap).toBe(true);
        expect(windowStarting(employee, "2027-03-08")?.changedBySwap).toBe(false);
        expect(windowStarting(employee, "2027-03-22")?.changedBySwap).toBe(true);
      }
    });

    test.each([
      ["given", NIGHT, DAY],
      ["taken", DAY, NIGHT],
    ])(
      "a %s night shift that starts on a window's last date and ends on the next does not change the windows starting the next date",
      (_which, givenShape, takenShape) => {
        // The night shift starts 10 Mar and ends 11 Mar; the other swapped shift is a day shift on 20 Mar.
        const nightOnGiven = givenShape === NIGHT;
        const givenDate = nightOnGiven ? "2027-03-10" : "2027-03-20";
        const takenDate = nightOnGiven ? "2027-03-20" : "2027-03-10";
        expect(walls("2027-03-10", NIGHT)[1].slice(0, 10)).toBe("2027-03-11");
        // Windows starting 4 to 10 Mar hold 10 Mar; those starting 14 to 20 Mar hold 20 Mar.
        const changedStarts = [4, 5, 6, 7, 8, 9, 10, 14, 15, 16, 17, 18, 19, 20].map((day) =>
          plusDays("2027-03-01", day - 1),
        );
        for (const employee of evaluated(swapRoster(givenDate, takenDate, givenShape, takenShape))) {
          expect(employee.windows).toHaveLength(22);
          // The window starting 11 Mar holds the night shift's end, not its start.
          expect(windowStarting(employee, "2027-03-11")?.changedBySwap).toBe(false);
          for (const window of employee.windows) {
            expect(window.changedBySwap).toBe(changedStarts.includes(window.from));
          }
        }
      },
    );

    test("property: changedBySwap is (from ≤ g ≤ to) or (from ≤ t ≤ to) for the dates g, t of the shifts given and taken", () => {
      const offset = fc.integer({ min: 0, max: 27 });
      fc.assert(
        fc.property(offset, offset, (givenOffset, takenOffset) => {
          const g = plusDays(COVERAGE_FROM, givenOffset);
          const t = plusDays(COVERAGE_FROM, takenOffset);
          for (const employee of evaluated(swapRoster(g, t))) {
            expect(employee.windows).toHaveLength(22);
            for (const { from, to, changedBySwap } of employee.windows) {
              expect(changedBySwap).toBe((from <= g && g <= to) || (from <= t && t <= to));
            }
          }
        }),
        runs,
      );
    });

    test("property: it is keyed on the start date, whatever time the shifts start and however long they last", () => {
      // A shift that starts or ends in the skipped hour of 14 Mar 02:00 to 03:00 is not evaluable.
      const inSkippedHour = (wall: string): boolean =>
        wall >= "2027-03-14T02:00" && wall < "2027-03-14T03:00";
      const usable = (date: string, shape: Shape): boolean =>
        walls(date, shape).every((wall) => !inSkippedHour(wall));
      const offset = fc.integer({ min: 0, max: 27 });
      const shape = fc.record({
        minuteOfDay: fc.integer({ min: 0, max: 24 * 60 - 1 }),
        minutes: fc.integer({ min: 1, max: 36 * 60 }),
      });
      fc.assert(
        fc.property(
          fc
            .record({ givenOffset: offset, givenShape: shape, takenOffset: offset, takenShape: shape })
            .filter(
              ({ givenOffset, givenShape, takenOffset, takenShape }) =>
                usable(plusDays(COVERAGE_FROM, givenOffset), givenShape) &&
                usable(plusDays(COVERAGE_FROM, takenOffset), takenShape),
            ),
          ({ givenOffset, givenShape, takenOffset, takenShape }) => {
            const g = plusDays(COVERAGE_FROM, givenOffset);
            const t = plusDays(COVERAGE_FROM, takenOffset);
            for (const employee of evaluated(swapRoster(g, t, givenShape, takenShape))) {
              expect(employee.windows).toHaveLength(22);
              for (const { from, to, changedBySwap } of employee.windows) {
                expect(changedBySwap).toBe((from <= g && g <= to) || (from <= t && t <= to));
              }
            }
          },
        ),
        runs,
      );
    });
  });

  describe("an existing breach in a window the swap does not change (criterion 6, rules half)", () => {
    test("is still a § 3.2 finding, with changedBySwap false", () => {
      // The shift given starts 20 Mar and the one taken 24 Mar, both outside 1 to 7 Mar.
      const roster = sixShiftRoster([720, 720, 720, 720, 720, 721], "2027-03-20");
      expect(evaluate(roster).kind).toBe("evaluated");
      const [give, take] = evaluated(roster);
      expect(give.findings).toEqual([
        {
          rule: "3.2",
          code: "seven-day-hours-over-maximum",
          changedBySwap: false,
          maximumHours: 72,
          from: "2027-03-01",
          to: "2027-03-07",
          hours: 72,
          minutes: 1,
        },
      ]);
      expect(windowStarting(give, "2027-03-01")?.changedBySwap).toBe(false);
      expect(take.findings).toEqual([]);
    });
  });

  describe("ordering of one employee's findings", () => {
    // The give owner works twelve hours on each of 1 to 8 Mar (84 h in the windows starting 1 and
    // 2 Mar), and 12 h then 8 h on 10 Mar after a 4 h rest (80 h in the window starting 4 Mar). Their
    // 1 Mar shift is in a unit they are not qualified for. The shifts are listed latest first, so
    // an order taken from the roster would be wrong.
    const eightDays = [8, 7, 6, 5, 4, 3, 2, 1].map((day) => {
      const shift = makeShift(
        `A-D${day}`,
        GIVE_OWNER,
        `2027-03-0${day}T06:00`,
        `2027-03-0${day}T18:00`,
      );
      return day === 1 ? { ...shift, unit: "HCU" } : shift;
    });
    const roster = rosterOf([
      makeShift(TAKE_SHIFT_ID, TAKE_OWNER, "2027-03-26T06:00", "2027-03-26T18:00"),
      makeShift(GIVE_SHIFT_ID, GIVE_OWNER, "2027-03-25T06:00", "2027-03-25T18:00"),
      makeShift("A-Y", GIVE_OWNER, "2027-03-10T22:00", "2027-03-11T06:00"),
      makeShift("A-X", GIVE_OWNER, "2027-03-10T06:00", "2027-03-10T18:00"),
      ...eightDays,
    ]);

    const over = (from: string, to: string, hours: number) => ({
      rule: "3.2",
      code: "seven-day-hours-over-maximum",
      changedBySwap: false,
      maximumHours: 72,
      from,
      to,
      hours,
      minutes: 0,
    });

    test("§ 3.1, then § 3.2 by window start, then § 3.3", () => {
      const [give] = evaluated(roster);
      expect(give.findings).toEqual([
        {
          rule: "3.1",
          code: "off-duty-under-minimum",
          changedBySwap: false,
          minimumHours: 11,
          fromShiftId: "A-X",
          toShiftId: "A-Y",
          from: "2027-03-10T18:00",
          to: "2027-03-10T22:00",
          hours: 4,
          minutes: 0,
        },
        over("2027-03-01", "2027-03-07", 84),
        over("2027-03-02", "2027-03-08", 84),
        over("2027-03-04", "2027-03-10", 80),
        {
          rule: "3.3",
          code: "no-qualification-for-unit-and-role",
          changedBySwap: false,
          shiftId: "A-D1",
          unit: "HCU",
          role: "CONSOLE",
          shiftStartDate: "2027-03-01",
          validThrough: null,
        },
      ]);
    });
  });
});

describe("a swap that cannot be evaluated", () => {
  const base = rosterOf([GIVE_DEFAULT, TAKE_DEFAULT]);

  function withShiftField(shiftId: string, field: string, value: unknown): unknown {
    return {
      ...base,
      shifts: base.shifts.map((shift) => (shift.shiftId === shiftId ? { ...shift, [field]: value } : shift)),
    };
  }

  test("the base roster is evaluable", () => {
    expect(evaluate(base).kind).toBe("evaluated");
  });

  test.each([
    ["a null roster", null],
    ["a string", "roster"],
    ["an array", []],
    ["an empty object", {}],
    ["a time zone that is not valid", { ...base, site: { name: "x", timeZone: "Mars/Olympus" } }],
    ["a coverage from after to", withCoverage(base, COVERAGE_TO, COVERAGE_FROM)],
    ["a coverage date that is not a date", withCoverage(base, "soon", COVERAGE_TO)],
    ["shifts that are not an array", { ...base, shifts: {} }],
    ["operators that are not an array", { ...base, operators: "none" }],
    ["a give shift outside coverage", replaceShift(base, GIVE_SHIFT_ID, { start: "2027-03-29T06:00", end: "2027-03-29T18:00" })],
    ["a take shift outside coverage", replaceShift(base, TAKE_SHIFT_ID, { start: "2027-02-28T06:00", end: "2027-02-28T18:00" })],
    ["an owner shift with a malformed end", replaceShift(base, TAKE_SHIFT_ID, { end: "2027-03-11 18:00" })],
    ["a shift on a skipped local time", replaceShift(base, GIVE_SHIFT_ID, { start: "2027-03-14T02:30", end: "2027-03-14T10:00" })],
    [
      "a shift on a repeated local time",
      withCoverage(
        replaceShift(base, GIVE_SHIFT_ID, { start: "2027-11-07T01:30", end: "2027-11-07T10:00" }),
        "2027-11-01",
        "2027-11-30",
      ),
    ],
    ["a shift unit that is not text", withShiftField(TAKE_SHIFT_ID, "unit", 3)],
    ["a shift role that is not text", withShiftField(GIVE_SHIFT_ID, "role", null)],
    ["an owner with no qualifications", setQualifications(base, GIVE_OWNER, undefined)],
    ["an owner with empty qualifications", setQualifications(base, TAKE_OWNER, [])],
  ])("is not evaluable for %s", (_label, roster) => {
    expect(evaluate(roster)).toEqual({ kind: "not-evaluable" });
  });

  test.each([
    ["a give shift id that is not in the roster", "NOPE-1", TAKE_SHIFT_ID],
    ["a take shift id that is not in the roster", GIVE_SHIFT_ID, "NOPE-2"],
  ])("is not evaluable for %s", (_label, giveShiftId, takeShiftId) => {
    expect(evaluateSwap(base, { giveShiftId, takeShiftId })).toEqual({ kind: "not-evaluable" });
  });

  describe("a shift that does not end after it starts", () => {
    const otherShifts = [
      ["the give owner's other shift", GIVE_OWNER],
      ["the take owner's other shift", TAKE_OWNER],
    ] as const;

    test.each([
      ["the give shift ending when it starts", GIVE_SHIFT_ID, "2027-03-10T06:00"],
      ["the give shift ending before it starts", GIVE_SHIFT_ID, "2027-03-10T05:59"],
      ["the take shift ending when it starts", TAKE_SHIFT_ID, "2027-03-11T06:00"],
      ["the take shift ending before it starts", TAKE_SHIFT_ID, "2027-03-11T05:00"],
    ])("is not evaluable for %s", (_label, shiftId, end) => {
      expect(evaluate(replaceShift(base, shiftId, { end }))).toEqual({ kind: "not-evaluable" });
    });

    test.each(otherShifts)("is not evaluable for %s, ending at its start", (_label, owner) => {
      const roster = rosterOf([
        ...base.shifts,
        makeShift("OTHER-1", owner, "2027-03-15T06:00", "2027-03-15T06:00"),
      ]);
      expect(evaluate(roster)).toEqual({ kind: "not-evaluable" });
    });

    test.each(otherShifts)("is not evaluable for %s, ending before its start", (_label, owner) => {
      const roster = rosterOf([
        ...base.shifts,
        makeShift("OTHER-1", owner, "2027-03-15T18:00", "2027-03-15T06:00"),
      ]);
      expect(evaluate(roster)).toEqual({ kind: "not-evaluable" });
    });

    test("is evaluable when the reversed shift starts outside coverage", () => {
      const roster = rosterOf([
        ...base.shifts,
        makeShift("OTHER-1", GIVE_OWNER, "2027-02-28T18:00", "2027-02-28T06:00"),
      ]);
      expect(evaluate(roster).kind).toBe("evaluated");
    });

    test("is evaluable when the reversed shift belongs to a bystander", () => {
      const roster = rosterOf([
        ...base.shifts,
        makeShift("OTHER-1", BYSTANDER, "2027-03-15T18:00", "2027-03-15T06:00"),
      ]);
      expect(evaluate(roster).kind).toBe("evaluated");
    });
  });

  test("is not evaluable for an owner whose qualification entry is malformed", () => {
    const roster = {
      ...base,
      operators: base.operators.map((operator) =>
        operator.employeeNumber === GIVE_OWNER
          ? { ...operator, qualifications: [{ unit: "CDU", role: "CONSOLE", validThrough: "2030-02-30" }] }
          : operator,
      ),
    };
    expect(evaluate(roster)).toEqual({ kind: "not-evaluable" });
  });
});

describe("checkQualifications", () => {
  const shifts = [
    makeShift("Q-1", GIVE_OWNER, "2027-03-05T06:00", "2027-03-05T18:00"),
    makeShift("Q-2", GIVE_OWNER, "2027-03-12T06:00", "2027-03-12T18:00"),
    makeShift("Q-3", GIVE_OWNER, "2027-03-20T06:00", "2027-03-20T18:00"),
    makeShift("Q-OUT", GIVE_OWNER, "2027-03-29T06:00", "2027-03-29T18:00"),
    makeShift("Q-B", TAKE_OWNER, "2027-03-21T06:00", "2027-03-21T18:00"),
  ];
  const roster = setQualifications(rosterOf(shifts), GIVE_OWNER, [
    { unit: "CDU", role: "CONSOLE", validThrough: "2027-03-10" },
  ]);

  test("checks the employee's own shifts within coverage, as rostered, with changedBySwap false", () => {
    expect(checkQualifications(roster, GIVE_OWNER)).toStrictEqual({
      shiftsChecked: 3,
      findings: [
        {
          rule: "3.3",
          code: "qualification-expired",
          changedBySwap: false,
          shiftId: "Q-2",
          unit: "CDU",
          role: "CONSOLE",
          shiftStartDate: "2027-03-12",
          validThrough: "2027-03-10",
        },
        {
          rule: "3.3",
          code: "qualification-expired",
          changedBySwap: false,
          shiftId: "Q-3",
          unit: "CDU",
          role: "CONSOLE",
          shiftStartDate: "2027-03-20",
          validThrough: "2027-03-10",
        },
      ],
    });
  });

  test("another employee's shifts are not checked", () => {
    expect(checkQualifications(roster, TAKE_OWNER)).toEqual({ shiftsChecked: 1, findings: [] });
  });

  test.each([
    ["an employee who is not an operator", roster, "999999"],
    ["an operator with empty qualifications", setQualifications(roster, GIVE_OWNER, []), GIVE_OWNER],
    ["an operator with no qualifications", setQualifications(roster, GIVE_OWNER, undefined), GIVE_OWNER],
    ["a roster that is not an object", null, GIVE_OWNER],
    ["an unusable coverage", withCoverage(roster, COVERAGE_TO, COVERAGE_FROM), GIVE_OWNER],
  ])("is not evaluable for %s", (_label, input, employeeNumber) => {
    expect(checkQualifications(input, employeeNumber)).toEqual({ kind: "not-evaluable" });
  });

  test("is not evaluable when one of the employee's shifts has a start that is not a wall time", () => {
    const broken = replaceShift(roster, "Q-2", { start: "garbage" });
    expect(checkQualifications(broken, GIVE_OWNER)).toEqual({ kind: "not-evaluable" });
  });
});

describe("evaluateSwap robustness properties", () => {
  const evaluationKinds = ["evaluated", "not-evaluable"];

  test("never throws on arbitrary JSON", () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.string(), fc.string(), (roster, giveShiftId, takeShiftId) => {
        expect(evaluationKinds).toContain(evaluateSwap(roster, { giveShiftId, takeShiftId }).kind);
      }),
      { numRuns: 300 },
    );
  });

  test("never throws on arbitrary values", () => {
    fc.assert(
      fc.property(fc.anything(), fc.string(), fc.string(), (roster, giveShiftId, takeShiftId) => {
        expect(evaluationKinds).toContain(evaluateSwap(roster, { giveShiftId, takeShiftId }).kind);
      }),
      { numRuns: 300 },
    );
  });

  // A roster with the right shape and fields that are now and then replaced by arbitrary JSON,
  // so the draws get past the first checks.
  const sometimesJunk = <T>(valid: fc.Arbitrary<T>): fc.Arbitrary<T | fc.JsonValue> =>
    fc.oneof({ weight: 12, arbitrary: valid }, { weight: 1, arbitrary: fc.jsonValue() });

  const wallTime = fc
    .integer({ min: 0, max: 36 * 24 * 60 })
    .map((minutes) => wallPlus("2027-02-27T00:00", minutes));
  const calendarDate = fc.integer({ min: 0, max: 40 }).map((days) => plusDays("2027-02-25", days));
  const owner = fc.constantFrom(GIVE_OWNER, TAKE_OWNER, BYSTANDER);

  const fuzzShift = (shiftId: fc.Arbitrary<unknown>) =>
    fc.record({
      shiftId,
      employeeNumber: sometimesJunk(owner),
      unit: sometimesJunk(fc.constantFrom("CDU", "HCU")),
      role: sometimesJunk(fc.constantFrom("CONSOLE", "FIELD")),
      start: sometimesJunk(wallTime),
      end: sometimesJunk(wallTime),
    });

  const fuzzOperator = fc.record({
    employeeNumber: owner,
    name: sometimesJunk(fc.string()),
    qualifications: sometimesJunk(
      fc.array(
        fc.record({
          unit: sometimesJunk(fc.constantFrom("CDU", "HCU")),
          role: sometimesJunk(fc.constantFrom("CONSOLE", "FIELD")),
          validThrough: sometimesJunk(calendarDate),
        }),
        { maxLength: 3 },
      ),
    ),
  });

  const goodOperators = buildRoster().operators;

  const fuzzRoster = fc.record({
    shifts: fc.tuple(
      fuzzShift(fc.constant(GIVE_SHIFT_ID)),
      fuzzShift(fc.constant(TAKE_SHIFT_ID)),
      fc.array(fuzzShift(fc.constantFrom("X1", "X2", "X3")), { maxLength: 6 }),
    ),
    operators: fc.oneof(
      { weight: 3, arbitrary: fc.constant(goodOperators) },
      { weight: 1, arbitrary: fc.array(fuzzOperator, { maxLength: 4 }) },
    ),
  });

  test("never throws on a roster of the right shape with fields now and then replaced, and what it returns is well formed", () => {
    let evaluatedCount = 0;
    // Seeded, so the draws and the evaluatedCount guard below are the same on every run.
    fc.assert(
      fc.property(fuzzRoster, ({ shifts: [give, take, others], operators }) => {
        const roster = { ...buildRoster(), shifts: [give, take, ...others], operators };
        const result = evaluate(roster);
        if (result.kind === "not-evaluable") {
          return;
        }
        evaluatedCount += 1;
        const [first, second] = result.employees;
        expect([first.party, second.party]).toEqual(["give-shift-owner", "take-shift-owner"]);
        expect([first.gaveShiftId, first.tookShiftId]).toEqual([GIVE_SHIFT_ID, TAKE_SHIFT_ID]);
        expect([second.gaveShiftId, second.tookShiftId]).toEqual([TAKE_SHIFT_ID, GIVE_SHIFT_ID]);
        for (const employee of result.employees) {
          for (const finding of offDutyFindings(employee)) {
            expect(Number.isInteger(finding.hours) && finding.hours >= 0).toBe(true);
            expect(Number.isInteger(finding.minutes) && finding.minutes >= 0 && finding.minutes < 60).toBe(true);
            expect(finding.hours * 60 + finding.minutes).toBeLessThan(660);
            if (finding.overlap === true) {
              expect([finding.hours, finding.minutes]).toEqual([0, 0]);
            }
          }
          // § 3.1 findings come before § 3.2 findings, and those before § 3.3 findings.
          const rules = employee.findings.map((finding) => finding.rule);
          expect(rules).toEqual([...rules].sort());
          expectWellFormedWindows(employee, roster.coverage);
        }
      }),
      { numRuns: 1000, seed: 20270307 },
    );
    expect(evaluatedCount).toBeGreaterThan(0);
  });
});
