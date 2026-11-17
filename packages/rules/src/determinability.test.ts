import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { assessDeterminability } from "./determinability";
import type { CannotDetermineReason, Determinability } from "./determinability";
import {
  BYSTANDER_SHIFT_ID,
  GIVE_OTHER_SHIFT_ID,
  GIVE_OWNER,
  GIVE_SHIFT_ID,
  SAMPLE_EXPORTED_AT,
  TAKE_OTHER_SHIFT_ID,
  TAKE_OWNER,
  TAKE_SHIFT_ID,
  addShift,
  buildRoster,
  makeShift,
  plusDays,
  removeOperator,
  removeShift,
  replaceShift,
  setQualifications,
  withCoverage,
} from "./test-rosters";
import type { RosterFixture } from "./test-rosters";

const HOUR_MS = 3_600_000;
const EXPORTED_AT_MS = Date.parse(SAMPLE_EXPORTED_AT);
/** A fresh clock for the sample export: six hours after it. */
const FRESH_NOW = EXPORTED_AT_MS + 6 * HOUR_MS;

function check(roster: unknown, now: number): Determinability {
  return assessDeterminability(roster, {
    now,
    giveShiftId: GIVE_SHIFT_ID,
    takeShiftId: TAKE_SHIFT_ID,
  });
}

function checkIds(roster: unknown, now: number, giveShiftId: string, takeShiftId: string) {
  return assessDeterminability(roster, { now, giveShiftId, takeShiftId });
}

function refused(...reasons: CannotDetermineReason[]): Determinability {
  return { determinable: false, reasons };
}

function reasonsOf(result: Determinability): CannotDetermineReason[] {
  return result.determinable ? [] : result.reasons;
}

function codesOf(result: Determinability): string[] {
  return reasonsOf(result).map((reason) => reason.code);
}

/** Moves the give shift to start at `start`, ending the next day at 10:00. */
function startGiveShiftAt(roster: RosterFixture, start: string): RosterFixture {
  const end = `${plusDays(start.slice(0, 10), 1)}T10:00`;
  return replaceShift(roster, GIVE_SHIFT_ID, { start, end });
}

function omit<K extends keyof RosterFixture>(roster: RosterFixture, key: K): Partial<RosterFixture> {
  const copy: Partial<RosterFixture> = { ...roster };
  delete copy[key];
  return copy;
}

function expectNoNaNOrNull(result: Determinability): void {
  expect(JSON.stringify(result)).not.toMatch(/NaN|null/);
}

function numbersIn(value: unknown): number[] {
  if (typeof value === "number") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(numbersIn);
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(numbersIn);
  }
  return [];
}

describe("baseline", () => {
  test("a good pick on the builder roster at a fresh now is determinable", () => {
    expect(check(buildRoster(), FRESH_NOW)).toEqual({ determinable: true });
  });
});

describe("export age (criteria 2 and 14)", () => {
  const roster = buildRoster();

  test("exactly 26 h after the sample export yields no stale reason", () => {
    expect(check(roster, Date.parse("2027-03-08T10:00:00Z"))).toEqual({ determinable: true });
  });

  test.each(["2027-03-08T10:00:00.001Z", "2027-03-08T10:00:01Z"])(
    "%s is one tick past 26 h and yields export-stale",
    (now) => {
      const result = check(roster, Date.parse(now));
      expect(codesOf(result)).toEqual(["export-stale"]);
      expect(reasonsOf(result)[0]).toMatchObject({ ageHours: 26, ageMinutes: 0, limitHours: 26 });
    },
  );

  test("28 h after the export yields exactly the stale reason with hours and minutes", () => {
    expect(check(roster, Date.parse("2027-03-08T12:00:00Z"))).toEqual(
      refused({ code: "export-stale", ageHours: 28, ageMinutes: 0, limitHours: 26 }),
    );
  });

  test("reports the leftover minutes of the age", () => {
    expect(check(roster, EXPORTED_AT_MS + 27 * HOUR_MS + 45 * 60_000 + 59_999)).toEqual(
      refused({ code: "export-stale", ageHours: 27, ageMinutes: 45, limitHours: 26 }),
    );
  });

  test("a now one second before the export gives only now-before-export", () => {
    expect(check(roster, Date.parse("2027-03-07T07:59:59Z"))).toEqual(
      refused({
        code: "now-before-export",
        exportedAt: "2027-03-07T08:00:00Z",
        now: "2027-03-07T07:59:59.000Z",
      }),
    );
  });

  test("a now equal to the export instant gives no now-before-export reason", () => {
    expect(check(roster, EXPORTED_AT_MS)).toEqual({ determinable: true });
  });
});

describe("export age properties (criterion 2)", () => {
  const roster = buildRoster();

  test("export-stale is present if and only if the age exceeds 26 h", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 72 * HOUR_MS }), (offset) => {
        const codes = codesOf(check(roster, EXPORTED_AT_MS + offset));
        expect(codes.includes("export-stale")).toBe(offset > 26 * HOUR_MS);
        expect(codes).not.toContain("now-before-export");
      }),
    );
  });

  test("a now before the export gives now-before-export and never export-stale", () => {
    fc.assert(
      fc.property(fc.integer({ min: -72 * HOUR_MS, max: -1 }), (offset) => {
        const codes = codesOf(check(roster, EXPORTED_AT_MS + offset));
        expect(codes).toContain("now-before-export");
        expect(codes).not.toContain("export-stale");
      }),
    );
  });
});

describe("invalid now (AM4)", () => {
  test.each([
    ["NaN", Number.NaN],
    ["Number.MAX_VALUE", Number.MAX_VALUE],
    ["-Number.MAX_VALUE", -Number.MAX_VALUE],
  ])("now = %s gives only invalid-now", (_label, now) => {
    expect(check(buildRoster(), now)).toEqual(refused({ code: "invalid-now" }));
  });
});

describe("swap horizon (criteria 4, 5 and 6)", () => {
  function horizonReason(start: string, from: string, to: string): CannotDetermineReason {
    return {
      code: "shift-outside-horizon",
      shiftId: GIVE_SHIFT_ID,
      start,
      horizonFrom: from,
      horizonTo: to,
    };
  }

  test.each(["2027-03-07T00:00", "2027-03-22T23:59"])(
    "criterion 4: a shift starting %s is inside the horizon of the 7 March export",
    (start) => {
      const roster = startGiveShiftAt(buildRoster(), start);
      expect(check(roster, FRESH_NOW)).toEqual({ determinable: true });
    },
  );

  test.each(["2027-03-06T23:59", "2027-03-23T00:00"])(
    "criterion 4: a shift starting %s is outside the horizon of the 7 March export",
    (start) => {
      const roster = startGiveShiftAt(buildRoster(), start);
      expect(check(roster, FRESH_NOW)).toEqual(
        refused(horizonReason(start, "2027-03-07", "2027-03-22")),
      );
    },
  );

  describe("criterion 5: the horizon follows the export's weekday", () => {
    const monday = buildRoster({ exportedAt: "2027-03-08T08:00:00Z", exportDate: "2027-03-08" });
    const mondayNow = Date.parse("2027-03-08T14:00:00Z");
    const wednesday = buildRoster({ exportedAt: "2027-03-03T08:00:00Z", exportDate: "2027-03-03" });
    const wednesdayNow = Date.parse("2027-03-03T14:00:00Z");

    test("the Monday export has coverage 2 March to 29 March", () => {
      expect(monday.coverage).toEqual({ from: "2027-03-02", to: "2027-03-29" });
    });

    test.each(["2027-03-08T06:00", "2027-03-15T06:00", "2027-03-23T06:00"])(
      "a Monday export puts a start of %s inside",
      (start) => {
        expect(check(startGiveShiftAt(monday, start), mondayNow)).toEqual({ determinable: true });
      },
    );

    test.each(["2027-03-07T06:00", "2027-03-24T06:00"])(
      "a Monday export puts a start of %s outside",
      (start) => {
        expect(check(startGiveShiftAt(monday, start), mondayNow)).toEqual(
          refused(horizonReason(start, "2027-03-08", "2027-03-23")),
        );
      },
    );

    test("the Wednesday export has coverage 25 February to 24 March", () => {
      expect(wednesday.coverage).toEqual({ from: "2027-02-25", to: "2027-03-24" });
    });

    test.each(["2027-03-03T06:00", "2027-03-10T06:00", "2027-03-18T06:00"])(
      "a Wednesday export puts a start of %s inside",
      (start) => {
        expect(check(startGiveShiftAt(wednesday, start), wednesdayNow)).toEqual({
          determinable: true,
        });
      },
    );

    test.each(["2027-03-02T06:00", "2027-03-19T06:00"])(
      "a Wednesday export puts a start of %s outside",
      (start) => {
        expect(check(startGiveShiftAt(wednesday, start), wednesdayNow)).toEqual(
          refused(horizonReason(start, "2027-03-03", "2027-03-18")),
        );
      },
    );

    test("exportedAt 2027-03-08T03:00:00Z uses the site date 7 March", () => {
      const lateEvening = buildRoster({
        exportedAt: "2027-03-08T03:00:00Z",
        exportDate: "2027-03-07",
      });
      const now = Date.parse("2027-03-08T09:00:00Z");
      expect(lateEvening.coverage).toEqual({ from: "2027-03-01", to: "2027-03-28" });
      // No coverage-mismatch, so D is 7 March; 7 March itself is inside, 23 March is outside.
      expect(check(startGiveShiftAt(lateEvening, "2027-03-07T06:00"), now)).toEqual({
        determinable: true,
      });
      expect(check(startGiveShiftAt(lateEvening, "2027-03-22T06:00"), now)).toEqual({
        determinable: true,
      });
      expect(check(startGiveShiftAt(lateEvening, "2027-03-23T06:00"), now)).toEqual(
        refused(horizonReason("2027-03-23T06:00", "2027-03-07", "2027-03-22")),
      );
    });
  });

  test("criterion 6: one shift out names only that shift and the range", () => {
    const roster = replaceShift(buildRoster(), TAKE_SHIFT_ID, {
      start: "2027-03-23T06:00",
      end: "2027-03-23T18:00",
    });
    const result = check(roster, FRESH_NOW);
    expect(result).toEqual(
      refused({
        code: "shift-outside-horizon",
        shiftId: TAKE_SHIFT_ID,
        start: "2027-03-23T06:00",
        horizonFrom: "2027-03-07",
        horizonTo: "2027-03-22",
      }),
    );
    expect(JSON.stringify(reasonsOf(result))).not.toContain(GIVE_SHIFT_ID);
  });

  test("criterion 6: with only the give shift out, the take shift id appears nowhere", () => {
    const result = check(startGiveShiftAt(buildRoster(), "2027-03-06T06:00"), FRESH_NOW);
    expect(codesOf(result)).toEqual(["shift-outside-horizon"]);
    expect(JSON.stringify(reasonsOf(result))).not.toContain(TAKE_SHIFT_ID);
  });

  test("criterion 6: with both shifts out, both are named, give first", () => {
    let roster = startGiveShiftAt(buildRoster(), "2027-03-06T06:00");
    roster = replaceShift(roster, TAKE_SHIFT_ID, {
      start: "2027-03-23T06:00",
      end: "2027-03-23T18:00",
    });
    expect(check(roster, FRESH_NOW)).toEqual(
      refused(
        horizonReason("2027-03-06T06:00", "2027-03-07", "2027-03-22"),
        {
          code: "shift-outside-horizon",
          shiftId: TAKE_SHIFT_ID,
          start: "2027-03-23T06:00",
          horizonFrom: "2027-03-07",
          horizonTo: "2027-03-22",
        },
      ),
    );
  });

  test("property: the give shift is outside the horizon iff its day offset is below 0 or above 15", () => {
    const base = buildRoster();
    fc.assert(
      fc.property(fc.integer({ min: -30, max: 45 }), (k) => {
        const date = plusDays("2027-03-07", k);
        const roster = replaceShift(base, GIVE_SHIFT_ID, {
          start: `${date}T10:00`,
          end: `${date}T18:00`,
        });
        const reasons = reasonsOf(check(roster, FRESH_NOW));
        const outside = reasons.some(
          (reason) => reason.code === "shift-outside-horizon" && reason.shiftId === GIVE_SHIFT_ID,
        );
        expect(outside).toBe(k < 0 || k > 15);
        const takeNamed = reasons.some(
          (reason) => reason.code === "shift-outside-horizon" && reason.shiftId === TAKE_SHIFT_ID,
        );
        expect(takeNamed).toBe(false);
      }),
    );
  });
});

describe("unusable export fields (criterion 7)", () => {
  const base = buildRoster();

  test.each([
    ["absent", omit(base, "exportedAt"), "missing"],
    ["a number", { ...base, exportedAt: 42 }, "malformed"],
    ["without a Z", { ...base, exportedAt: "2027-03-07T08:00:00" }, "malformed"],
  ])("exportedAt %s names exportedAt", (_label, roster, problem) => {
    const result = check(roster, FRESH_NOW);
    expect(result).toEqual(
      refused({ code: "invalid-export-field", field: "exportedAt", problem } as CannotDetermineReason),
    );
    expectNoNaNOrNull(result);
  });

  test.each([
    ["absent", omit(base, "coverage"), "coverage", "missing"],
    ["not an object", { ...base, coverage: "2027-03-01" }, "coverage", "malformed"],
    ["from absent", { ...base, coverage: { to: "2027-03-28" } }, "coverage.from", "missing"],
    [
      "from malformed",
      { ...base, coverage: { from: "2027-02-30", to: "2027-03-28" } },
      "coverage.from",
      "malformed",
    ],
    ["to absent", { ...base, coverage: { from: "2027-03-01" } }, "coverage.to", "missing"],
    [
      "to malformed",
      { ...base, coverage: { from: "2027-03-01", to: 20270328 } },
      "coverage.to",
      "malformed",
    ],
  ])("coverage %s names %s", (_label, roster, field, problem) => {
    const result = check(roster, FRESH_NOW);
    expect(result).toEqual(
      refused({ code: "invalid-export-field", field, problem } as CannotDetermineReason),
    );
    expectNoNaNOrNull(result);
  });

  test("coverage from later than to is named, with both mismatches", () => {
    const result = check(withCoverage(base, "2027-03-28", "2027-03-01"), FRESH_NOW);
    expect(result).toEqual(
      refused(
        { code: "invalid-export-field", field: "coverage", problem: "from-after-to" },
        {
          code: "coverage-mismatch",
          field: "coverage.from",
          actual: "2027-03-28",
          expected: "2027-03-01",
        },
        {
          code: "coverage-mismatch",
          field: "coverage.to",
          actual: "2027-03-01",
          expected: "2027-03-28",
        },
      ),
    );
    expectNoNaNOrNull(result);
  });

  test("coverage that is not D-6 to D+21 gives a mismatch for each end", () => {
    const result = check(withCoverage(base, "2027-03-02", "2027-03-27"), FRESH_NOW);
    expect(result).toEqual(
      refused(
        {
          code: "coverage-mismatch",
          field: "coverage.from",
          actual: "2027-03-02",
          expected: "2027-03-01",
        },
        {
          code: "coverage-mismatch",
          field: "coverage.to",
          actual: "2027-03-27",
          expected: "2027-03-28",
        },
      ),
    );
    expectNoNaNOrNull(result);
  });

  test("a mismatch on one end leaves the other end unreported", () => {
    const result = check(withCoverage(base, "2027-03-01", "2027-03-29"), FRESH_NOW);
    expect(result).toEqual(
      refused({
        code: "coverage-mismatch",
        field: "coverage.to",
        actual: "2027-03-29",
        expected: "2027-03-28",
      }),
    );
  });

  test.each([
    ["shifts", omit(base, "shifts"), "missing"],
    ["shifts", { ...base, shifts: "none" }, "malformed"],
    ["operators", omit(base, "operators"), "missing"],
    ["operators", { ...base, operators: {} }, "malformed"],
  ])("%s that is %s names the field", (field, roster, problem) => {
    const result = check(roster, FRESH_NOW);
    expect(reasonsOf(result)).toContainEqual({ code: "invalid-export-field", field, problem });
    expectNoNaNOrNull(result);
  });
});

describe("site time zone (criterion 15)", () => {
  // Every check that depends on D would fire here if the zone were valid.
  const dateDependent = (() => {
    let roster = withCoverage(buildRoster(), "2027-03-02", "2027-03-27");
    roster = startGiveShiftAt(roster, "2027-04-06T10:00");
    return addShift(
      roster,
      makeShift("GIVE-A3", GIVE_OWNER, "2027-03-14T02:30", "2027-03-14T10:00"),
    );
  })();

  test("the fixture does trip the date-dependent checks when the zone is valid", () => {
    expect(codesOf(check(dateDependent, FRESH_NOW))).toEqual([
      "coverage-mismatch",
      "coverage-mismatch",
      "shift-outside-horizon",
      "nonexistent-local-time",
    ]);
  });

  test.each([
    ["absent", { ...dateDependent, site: { name: "Test Harbor Works" } }, "missing"],
    ["a number", { ...dateDependent, site: { name: "x", timeZone: 42 } }, "malformed"],
    [
      "unknown",
      { ...dateDependent, site: { name: "x", timeZone: "Mars/Olympus" } },
      "unknown-time-zone",
    ],
  ])("a time zone that is %s is named and skips every check that needs D", (_label, roster, problem) => {
    expect(check(roster, FRESH_NOW)).toEqual(
      refused({ code: "invalid-export-field", field: "site.timeZone", problem } as CannotDetermineReason),
    );
  });

  test("a roster with no site at all is named, not a crash", () => {
    expect(check(omit(buildRoster(), "site"), FRESH_NOW)).toEqual(
      refused({ code: "invalid-export-field", field: "site.timeZone", problem: "missing" }),
    );
  });
});

describe("missing records (criterion 9)", () => {
  const base = buildRoster();

  test("a give shift id not in the roster is missing-shift", () => {
    expect(checkIds(base, FRESH_NOW, "NOPE-1", TAKE_SHIFT_ID)).toEqual(
      refused({ code: "missing-shift", shiftId: "NOPE-1" }),
    );
  });

  test("a take shift id not in the roster is missing-shift", () => {
    expect(checkIds(base, FRESH_NOW, GIVE_SHIFT_ID, "NOPE-2")).toEqual(
      refused({ code: "missing-shift", shiftId: "NOPE-2" }),
    );
  });

  test("both shift ids missing are both named, give first", () => {
    expect(checkIds(base, FRESH_NOW, "NOPE-1", "NOPE-2")).toEqual(
      refused(
        { code: "missing-shift", shiftId: "NOPE-1" },
        { code: "missing-shift", shiftId: "NOPE-2" },
      ),
    );
  });

  test("a shift removed from the roster is missing-shift", () => {
    expect(check(removeShift(base, GIVE_SHIFT_ID), FRESH_NOW)).toEqual(
      refused({ code: "missing-shift", shiftId: GIVE_SHIFT_ID }),
    );
  });

  test("a give shift whose owner is not in operators is owner-not-operator", () => {
    expect(check(removeOperator(base, GIVE_OWNER), FRESH_NOW)).toEqual(
      refused({ code: "owner-not-operator", shiftId: GIVE_SHIFT_ID, party: "give-shift-owner" }),
    );
  });

  test("a take shift whose owner is not in operators is owner-not-operator", () => {
    expect(check(removeOperator(base, TAKE_OWNER), FRESH_NOW)).toEqual(
      refused({ code: "owner-not-operator", shiftId: TAKE_SHIFT_ID, party: "take-shift-owner" }),
    );
  });

  test("a shift with no employee number is owner-not-operator", () => {
    const shifts = base.shifts.map((shift) => {
      if (shift.shiftId !== GIVE_SHIFT_ID) {
        return shift;
      }
      const { shiftId, unit, role, start, end } = shift;
      return { shiftId, unit, role, start, end };
    });
    expect(check({ ...base, shifts }, FRESH_NOW)).toEqual(
      refused({ code: "owner-not-operator", shiftId: GIVE_SHIFT_ID, party: "give-shift-owner" }),
    );
  });

  test.each([
    ["give-shift-owner", GIVE_OWNER, GIVE_SHIFT_ID],
    ["take-shift-owner", TAKE_OWNER, TAKE_SHIFT_ID],
  ] as const)("a %s with qualifications absent is qualifications-missing/absent", (party, owner, shiftId) => {
    expect(check(setQualifications(base, owner, undefined), FRESH_NOW)).toEqual(
      refused({ code: "qualifications-missing", shiftId, party, problem: "absent" }),
    );
  });

  test.each([
    ["give-shift-owner", GIVE_OWNER, GIVE_SHIFT_ID],
    ["take-shift-owner", TAKE_OWNER, TAKE_SHIFT_ID],
  ] as const)("a %s with qualifications: [] is qualifications-missing/empty", (party, owner, shiftId) => {
    expect(check(setQualifications(base, owner, []), FRESH_NOW)).toEqual(
      refused({ code: "qualifications-missing", shiftId, party, problem: "empty" }),
    );
  });

  test("reasons carry no employee number or name", () => {
    const roster = setQualifications(removeOperator(base, GIVE_OWNER), TAKE_OWNER, []);
    const text = JSON.stringify(reasonsOf(check(roster, FRESH_NOW)));
    expect(text).not.toContain(GIVE_OWNER);
    expect(text).not.toContain(TAKE_OWNER);
    expect(text).not.toContain("Alex Example");
    expect(text).not.toContain("Blair Sample");
  });
});

describe("malformed shift times", () => {
  test("a malformed time on either owner's shift names the shift and the field", () => {
    let roster = replaceShift(buildRoster(), GIVE_OTHER_SHIFT_ID, { start: "2027-03-12 06:00" });
    roster = replaceShift(roster, TAKE_OTHER_SHIFT_ID, { end: "2027-03-13T25:00" });
    expect(check(roster, FRESH_NOW)).toEqual(
      refused(
        { code: "shift-time-malformed", shiftId: GIVE_OTHER_SHIFT_ID, field: "start" },
        { code: "shift-time-malformed", shiftId: TAKE_OTHER_SHIFT_ID, field: "end" },
      ),
    );
  });

  test("a malformed time on a bystander's shift is not reported", () => {
    const roster = replaceShift(buildRoster(), BYSTANDER_SHIFT_ID, { start: "garbage" });
    expect(check(roster, FRESH_NOW)).toEqual({ determinable: true });
  });

  test("a malformed start on a swapped shift gives no horizon reason", () => {
    const roster = replaceShift(buildRoster(), GIVE_SHIFT_ID, { start: "2027-03-90T06:00" });
    expect(check(roster, FRESH_NOW)).toEqual(
      refused({ code: "shift-time-malformed", shiftId: GIVE_SHIFT_ID, field: "start" }),
    );
  });
});

describe("clock changes (criterion 16)", () => {
  const base = buildRoster();

  test.each([
    ["give owner's other shift", "GIVE-A3", GIVE_OWNER],
    ["take owner's other shift", "TAKE-B3", TAKE_OWNER],
  ])("a %s starting at the skipped 2027-03-14T02:30 is nonexistent-local-time", (_label, shiftId, owner) => {
    const roster = addShift(base, makeShift(shiftId, owner, "2027-03-14T02:30", "2027-03-14T10:00"));
    expect(check(roster, FRESH_NOW)).toEqual(
      refused({ code: "nonexistent-local-time", shiftId, field: "start", value: "2027-03-14T02:30" }),
    );
  });

  test.each([
    ["give owner's other shift", "GIVE-A3", GIVE_OWNER],
    ["take owner's other shift", "TAKE-B3", TAKE_OWNER],
  ])("a %s ending at the skipped 2027-03-14T02:30 is nonexistent-local-time", (_label, shiftId, owner) => {
    const roster = addShift(base, makeShift(shiftId, owner, "2027-03-13T22:00", "2027-03-14T02:30"));
    expect(check(roster, FRESH_NOW)).toEqual(
      refused({ code: "nonexistent-local-time", shiftId, field: "end", value: "2027-03-14T02:30" }),
    );
  });

  test("a swapped shift itself with a skipped time is flagged", () => {
    const roster = replaceShift(base, GIVE_SHIFT_ID, { start: "2027-03-14T02:30" });
    expect(check(roster, FRESH_NOW)).toEqual(
      refused({
        code: "nonexistent-local-time",
        shiftId: GIVE_SHIFT_ID,
        field: "start",
        value: "2027-03-14T02:30",
      }),
    );
  });

  test("a skipped time on a bystander's shift is not reported", () => {
    const roster = replaceShift(base, BYSTANDER_SHIFT_ID, {
      start: "2027-03-14T02:30",
      end: "2027-03-14T10:00",
    });
    expect(check(roster, FRESH_NOW)).toEqual({ determinable: true });
  });

  describe("the repeated hour in November", () => {
    const november = buildRoster({ exportedAt: "2027-11-01T08:00:00Z", exportDate: "2027-11-01" });
    const now = Date.parse("2027-11-01T14:00:00Z");

    test("the November fixture is otherwise determinable", () => {
      expect(november.coverage).toEqual({ from: "2027-10-26", to: "2027-11-22" });
      expect(check(november, now)).toEqual({ determinable: true });
    });

    test("a shift ending at the repeated 2027-11-07T01:30 is ambiguous-local-time", () => {
      const roster = addShift(
        november,
        makeShift("GIVE-A3", GIVE_OWNER, "2027-11-06T22:00", "2027-11-07T01:30"),
      );
      expect(check(roster, now)).toEqual(
        refused({
          code: "ambiguous-local-time",
          shiftId: "GIVE-A3",
          field: "end",
          value: "2027-11-07T01:30",
        }),
      );
    });

    test("a take owner's shift starting at the repeated hour is ambiguous-local-time", () => {
      const roster = addShift(
        november,
        makeShift("TAKE-B3", TAKE_OWNER, "2027-11-07T01:30", "2027-11-07T10:00"),
      );
      expect(check(roster, now)).toEqual(
        refused({
          code: "ambiguous-local-time",
          shiftId: "TAKE-B3",
          field: "start",
          value: "2027-11-07T01:30",
        }),
      );
    });
  });

  test("a clock-change time on a shift starting before coverage is not reported", () => {
    const march25 = buildRoster({ exportedAt: "2027-03-25T08:00:00Z", exportDate: "2027-03-25" });
    expect(march25.coverage).toEqual({ from: "2027-03-19", to: "2027-04-15" });
    const roster = addShift(
      march25,
      makeShift("GIVE-A3", GIVE_OWNER, "2027-03-14T02:30", "2027-03-14T10:00"),
    );
    expect(check(roster, Date.parse("2027-03-25T14:00:00Z"))).toEqual({ determinable: true });
  });

  describe("AM1: an overnight shift starting on the last coverage date", () => {
    const february = buildRoster({ exportedAt: "2027-02-20T08:00:00Z", exportDate: "2027-02-20" });
    const now = Date.parse("2027-02-20T14:00:00Z");

    test("the fixture has coverage 14 February to 13 March", () => {
      expect(february.coverage).toEqual({ from: "2027-02-14", to: "2027-03-13" });
    });

    test("starting 22:00 on the last date and ending at the skipped 02:30 is flagged", () => {
      const roster = addShift(
        february,
        makeShift("GIVE-A3", GIVE_OWNER, "2027-03-13T22:00", "2027-03-14T02:30"),
      );
      expect(check(roster, now)).toEqual(
        refused({
          code: "nonexistent-local-time",
          shiftId: "GIVE-A3",
          field: "end",
          value: "2027-03-14T02:30",
        }),
      );
    });

    test("a shift starting the day after the last coverage date is not flagged", () => {
      const roster = addShift(
        february,
        makeShift("GIVE-A3", GIVE_OWNER, "2027-03-14T02:30", "2027-03-14T10:00"),
      );
      expect(check(roster, now)).toEqual({ determinable: true });
    });
  });

  test("with unusable coverage every shift of the owners is checked", () => {
    const withShift = addShift(
      base,
      makeShift("GIVE-A3", GIVE_OWNER, "2027-06-01T10:00", "2027-03-14T02:30"),
    );
    const roster = { ...withShift, coverage: "unknown" };
    expect(check(roster, FRESH_NOW)).toEqual(
      refused(
        { code: "invalid-export-field", field: "coverage", problem: "malformed" },
        {
          code: "nonexistent-local-time",
          shiftId: "GIVE-A3",
          field: "end",
          value: "2027-03-14T02:30",
        },
      ),
    );
  });
});

describe("reason order", () => {
  test("with D unknown, reasons follow the fixed order", () => {
    let roster = replaceShift(buildRoster(), TAKE_OTHER_SHIFT_ID, { start: "2027-03-11 06:00" });
    roster = withCoverage(roster, "2027-03-28", "2027-03-01");
    const broken = {
      ...omit(roster, "operators"),
      site: { name: "x", timeZone: "Mars/Olympus" },
    };
    expect(checkIds(broken, Date.parse("2027-03-08T12:00:00Z"), "NOPE-1", TAKE_SHIFT_ID)).toEqual(
      refused(
        { code: "invalid-export-field", field: "site.timeZone", problem: "unknown-time-zone" },
        { code: "invalid-export-field", field: "coverage", problem: "from-after-to" },
        { code: "invalid-export-field", field: "operators", problem: "missing" },
        { code: "export-stale", ageHours: 28, ageMinutes: 0, limitHours: 26 },
        { code: "missing-shift", shiftId: "NOPE-1" },
        { code: "shift-time-malformed", shiftId: TAKE_OTHER_SHIFT_ID, field: "start" },
      ),
    );
  });

  test("with D known, reasons follow the fixed order", () => {
    let roster = withCoverage(buildRoster(), "2027-03-02", "2027-03-27");
    roster = removeOperator(roster, GIVE_OWNER);
    roster = setQualifications(roster, TAKE_OWNER, []);
    roster = replaceShift(roster, GIVE_OTHER_SHIFT_ID, { start: "2027-03-12 06:00" });
    roster = replaceShift(roster, TAKE_SHIFT_ID, { start: "2027-03-27T06:00", end: "2027-03-27T18:00" });
    roster = addShift(roster, makeShift("GIVE-A3", GIVE_OWNER, "2027-03-14T02:30", "2027-03-14T10:00"));
    expect(check(roster, Date.parse("2027-03-08T12:00:00Z"))).toEqual(
      refused(
        {
          code: "coverage-mismatch",
          field: "coverage.from",
          actual: "2027-03-02",
          expected: "2027-03-01",
        },
        {
          code: "coverage-mismatch",
          field: "coverage.to",
          actual: "2027-03-27",
          expected: "2027-03-28",
        },
        { code: "export-stale", ageHours: 28, ageMinutes: 0, limitHours: 26 },
        { code: "owner-not-operator", shiftId: GIVE_SHIFT_ID, party: "give-shift-owner" },
        {
          code: "qualifications-missing",
          shiftId: TAKE_SHIFT_ID,
          party: "take-shift-owner",
          problem: "empty",
        },
        { code: "shift-time-malformed", shiftId: GIVE_OTHER_SHIFT_ID, field: "start" },
        {
          code: "shift-outside-horizon",
          shiftId: TAKE_SHIFT_ID,
          start: "2027-03-27T06:00",
          horizonFrom: "2027-03-07",
          horizonTo: "2027-03-22",
        },
        {
          code: "nonexistent-local-time",
          shiftId: "GIVE-A3",
          field: "start",
          value: "2027-03-14T02:30",
        },
      ),
    );
  });

  test("an empty roster with an invalid now lists every unusable field in order", () => {
    expect(checkIds({}, Number.NaN, "A", "B")).toEqual(
      refused(
        { code: "invalid-now" },
        { code: "invalid-export-field", field: "exportedAt", problem: "missing" },
        { code: "invalid-export-field", field: "site.timeZone", problem: "missing" },
        { code: "invalid-export-field", field: "coverage", problem: "missing" },
        { code: "invalid-export-field", field: "shifts", problem: "missing" },
        { code: "invalid-export-field", field: "operators", problem: "missing" },
      ),
    );
  });
});

describe("robustness properties (criterion 8)", () => {
  test("for arbitrary JSON the gate never throws and every number in the reasons is finite", () => {
    fc.assert(
      fc.property(
        fc.jsonValue(),
        fc.string(),
        fc.string(),
        fc.double(),
        (roster, giveShiftId, takeShiftId, now) => {
          const result = checkIds(roster, now, giveShiftId, takeShiftId);
          expect(numbersIn(result).every(Number.isFinite)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  test("for arbitrary values the gate never throws and every number in the reasons is finite", () => {
    fc.assert(
      fc.property(
        fc.anything(),
        fc.string(),
        fc.string(),
        fc.double(),
        (roster, giveShiftId, takeShiftId, now) => {
          const result = checkIds(roster, now, giveShiftId, takeShiftId);
          expect(numbersIn(result).every(Number.isFinite)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  test("a valid roster whose exportedAt is not a valid instant is never determinable", () => {
    // Any string that even resembles an instant is excluded, so what is left is certainly invalid.
    const notAnInstant = fc
      .jsonValue()
      .filter((value) => !(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)));
    const base = buildRoster();
    fc.assert(
      fc.property(notAnInstant, (exportedAt) => {
        const result = check({ ...base, exportedAt }, FRESH_NOW);
        expect(result.determinable).toBe(false);
        expect(reasonsOf(result)).toContainEqual(
          expect.objectContaining({ code: "invalid-export-field", field: "exportedAt" }),
        );
      }),
      { numRuns: 300 },
    );
  });
});
