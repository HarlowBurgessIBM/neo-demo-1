import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { EXCEPTION_PROCEDURE, checkQualifications, evaluateSwap } from "./swap-evaluation";
import type {
  EmployeeEvaluation,
  Finding,
  OffDutyFinding,
  QualificationFinding,
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

function offDutyFindings(employee: EmployeeEvaluation): OffDutyFinding[] {
  return employee.findings.filter(isOffDuty);
}

function qualificationFindings(employee: EmployeeEvaluation): QualificationFinding[] {
  return employee.findings.filter(isQualification);
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
      findings: [],
    });
    expect(take).toEqual({
      party: "take-shift-owner",
      name: TAKE_NAME,
      gaveShiftId: TAKE_SHIFT_ID,
      tookShiftId: GIVE_SHIFT_ID,
      offDutyBefore: null,
      offDutyAfter: null,
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
    const summary = give.findings.map((finding) =>
      isOffDuty(finding)
        ? [finding.rule, finding.fromShiftId, finding.toShiftId]
        : [finding.rule, finding.shiftId],
    );
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
          // § 3.1 findings come before § 3.3 findings.
          const rules = employee.findings.map((finding) => finding.rule);
          expect(rules).toEqual([...rules].sort());
        }
      }),
      { numRuns: 1000 },
    );
    expect(evaluatedCount).toBeGreaterThan(0);
  });
});
