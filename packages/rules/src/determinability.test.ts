import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { assessDeterminability } from "./determinability";
import type { CannotDetermineReason, Determinability } from "./determinability";
import {
  BYSTANDER,
  BYSTANDER_SHIFT_ID,
  GIVE_OTHER_SHIFT_ID,
  GIVE_OWNER,
  GIVE_SHIFT_ID,
  SAMPLE_EXPORTED_AT,
  SITE_TIME_ZONE,
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

  // Half the draws land within 3 ms of the 26 h limit, where an off-by-one would show.
  const ageOffset = fc.oneof(
    fc.integer({ min: 0, max: 72 * HOUR_MS }),
    fc.integer({ min: -3, max: 3 }).map((delta) => 26 * HOUR_MS + delta),
  );

  test("export-stale is present if and only if the age exceeds 26 h", () => {
    fc.assert(
      fc.property(ageOffset, (offset) => {
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
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["8.64e15 + 1", 8.64e15 + 1],
    ["-(8.64e15 + 1)", -(8.64e15 + 1)],
  ])("now = %s gives only invalid-now", (_label, now) => {
    expect(check(buildRoster(), now)).toEqual(refused({ code: "invalid-now" }));
  });

  test("now = -8.64e15 is the earliest valid clock and is before the export", () => {
    expect(check(buildRoster(), -8.64e15)).toEqual(
      refused({
        code: "now-before-export",
        exportedAt: SAMPLE_EXPORTED_AT,
        now: "-271821-04-20T00:00:00.000Z",
      }),
    );
  });

  test("now = 8.64e15 is the latest valid clock and gives a finite stale age", () => {
    const result = check(buildRoster(), 8.64e15);
    const age = 8.64e15 - EXPORTED_AT_MS;
    expect(result).toEqual(
      refused({
        code: "export-stale",
        ageHours: Math.floor(age / HOUR_MS),
        ageMinutes: Math.floor((age % HOUR_MS) / 60_000),
        limitHours: 26,
      }),
    );
    expect(numbersIn(result).every(Number.isFinite)).toBe(true);
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

  test("property: for a random export date the give shift is outside the horizon iff its day offset is below 0 or above 15", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 364 }),
        fc.integer({ min: -30, max: 45 }),
        (dayOfYear, k) => {
          const exportDate = plusDays("2027-01-01", dayOfYear);
          const exportedAt = `${exportDate}T12:00:00Z`;
          const base = buildRoster({ exportedAt, exportDate });
          const date = plusDays(exportDate, k);
          const roster = replaceShift(base, GIVE_SHIFT_ID, {
            start: `${date}T10:00`,
            end: `${date}T18:00`,
          });
          const reasons = reasonsOf(check(roster, Date.parse(exportedAt) + HOUR_MS));
          const outside = reasons.filter((reason) => reason.code === "shift-outside-horizon");
          if (k < 0 || k > 15) {
            expect(outside).toEqual([
              {
                code: "shift-outside-horizon",
                shiftId: GIVE_SHIFT_ID,
                start: `${date}T10:00`,
                horizonFrom: exportDate,
                horizonTo: plusDays(exportDate, 15),
              },
            ]);
          } else {
            expect(outside).toEqual([]);
          }
        },
      ),
    );
  });
});

describe("unusable export fields (criterion 7)", () => {
  const base = buildRoster();
  const exportedAtMalformed = refused({
    code: "invalid-export-field",
    field: "exportedAt",
    problem: "malformed",
  });

  const exportedAtCases: [string, unknown, "missing" | "malformed"][] = [
    ["absent", omit(base, "exportedAt"), "missing"],
    ["null", { ...base, exportedAt: null }, "missing"],
    ["a number", { ...base, exportedAt: 42 }, "malformed"],
    ["an object", { ...base, exportedAt: {} }, "malformed"],
    ["without a Z", { ...base, exportedAt: "2027-03-07T08:00:00" }, "malformed"],
  ];

  test.each(exportedAtCases)("exportedAt %s names exportedAt", (_label, roster, problem) => {
    const result = check(roster, FRESH_NOW);
    expect(result).toEqual(
      refused({ code: "invalid-export-field", field: "exportedAt", problem }),
    );
    expectNoNaNOrNull(result);
  });

  test.each([
    ["an impossible day", "2027-02-30T08:00:00Z"],
    ["a 31st of April", "2027-04-31T08:00:00Z"],
    ["month 13", "2027-13-07T08:00:00Z"],
    ["hour 24", "2027-03-07T24:00:00Z"],
    ["minute 60", "2027-03-07T08:60:00Z"],
    ["second 60", "2027-03-07T08:00:60Z"],
    ["a +00:00 offset", "2027-03-07T08:00:00+00:00"],
    ["a lowercase z", "2027-03-07T08:00:00z"],
    ["a leading space", " 2027-03-07T08:00:00Z"],
    ["a trailing space", "2027-03-07T08:00:00Z "],
    ["five fraction digits", "2027-03-07T08:00:00.12345Z"],
    ["four fraction digits", "2027-03-07T08:00:00.1234Z"],
    ["a space instead of T", "2027-03-07 08:00:00Z"],
    ["a date only", "2027-03-07"],
    ["the empty string", ""],
  ])("exportedAt with %s is malformed, once", (_label, exportedAt) => {
    const result = check({ ...base, exportedAt }, FRESH_NOW);
    expect(result).toEqual(exportedAtMalformed);
    expectNoNaNOrNull(result);
  });

  test.each([
    ["no seconds", "2027-03-07T08:00Z"],
    ["one fraction digit", "2027-03-07T08:00:00.5Z"],
    ["three fraction digits", "2027-03-07T08:00:00.123Z"],
  ])("exportedAt with %s is accepted", (_label, exportedAt) => {
    const roster = { ...base, exportedAt };
    expect(check(roster, Date.parse("2027-03-07T09:00:00Z"))).toEqual({ determinable: true });
  });

  describe("an export date outside the supported years", () => {
    // D-6, D+15 and D+21 must all be real dates in years 0100-9999. With D unknown, the
    // coverage and horizon checks are skipped, so exportedAt is the only reason, and only once.
    function farRoster(exportedAt: string, from: string, to: string): RosterFixture {
      return withCoverage(buildRoster({ exportedAt }), from, to);
    }

    test.each([
      ["9999-12-31T08:00:00Z", "9999-12-25", "9999-12-31"],
      ["9999-12-11T08:00:00Z", "9999-12-05", "9999-12-31"],
      ["0100-01-01T08:00:00Z", "0100-01-01", "0100-01-22"],
      ["0100-01-06T08:00:00Z", "0100-01-01", "0100-01-27"],
    ])("exportedAt %s is malformed", (exportedAt, from, to) => {
      const result = check(farRoster(exportedAt, from, to), Date.parse(exportedAt) + HOUR_MS);
      expect(result).toEqual(exportedAtMalformed);
      expectNoNaNOrNull(result);
    });

    test.each([
      ["9999-12-10T08:00:00Z", "9999-12-10"],
      ["0100-01-07T08:00:00Z", "0100-01-07"],
    ])("exportedAt %s, the last supported day at that end, is accepted", (exportedAt, exportDate) => {
      const roster = buildRoster({ exportedAt, exportDate });
      expect(check(roster, Date.parse(exportedAt) + HOUR_MS)).toEqual({ determinable: true });
    });
  });

  const coverageCases: [
    string,
    unknown,
    "coverage" | "coverage.from" | "coverage.to",
    "missing" | "malformed",
  ][] = [
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
  ];

  test.each(coverageCases)("coverage %s names %s", (_label, roster, field, problem) => {
    const result = check(roster, FRESH_NOW);
    expect(result).toEqual(refused({ code: "invalid-export-field", field, problem }));
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

  const fieldCases: [string, unknown, "shifts" | "operators", "missing" | "malformed"][] = [
    ["shifts that are absent", omit(base, "shifts"), "shifts", "missing"],
    ["shifts that are a string", { ...base, shifts: "none" }, "shifts", "malformed"],
    ["operators that are absent", omit(base, "operators"), "operators", "missing"],
    ["operators that are an object", { ...base, operators: {} }, "operators", "malformed"],
  ];

  test.each(fieldCases)("%s names the field", (_label, roster, field, problem) => {
    const result = check(roster, FRESH_NOW);
    expect(result).toEqual(refused({ code: "invalid-export-field", field, problem }));
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

  const zoneCases: [string, unknown, "missing" | "malformed" | "unknown-time-zone"][] = [
    ["absent", { ...dateDependent, site: { name: "Test Harbor Works" } }, "missing"],
    ["null", { ...dateDependent, site: { name: "x", timeZone: null } }, "missing"],
    ["a number", { ...dateDependent, site: { name: "x", timeZone: 42 } }, "malformed"],
    [
      "unknown",
      { ...dateDependent, site: { name: "x", timeZone: "Mars/Olympus" } },
      "unknown-time-zone",
    ],
    ["empty", { ...dateDependent, site: { name: "x", timeZone: "" } }, "unknown-time-zone"],
    [
      "an offset",
      { ...dateDependent, site: { name: "x", timeZone: "+05:00" } },
      "unknown-time-zone",
    ],
    [
      "padded with a space",
      { ...dateDependent, site: { name: "x", timeZone: "America/Chicago " } },
      "unknown-time-zone",
    ],
  ];

  test.each(zoneCases)(
    "a time zone that is %s is named and skips every check that needs D",
    (_label, roster, problem) => {
      expect(check(roster, FRESH_NOW)).toEqual(
        refused({ code: "invalid-export-field", field: "site.timeZone", problem }),
      );
    },
  );

  test("a roster with no site at all is named, not a crash", () => {
    expect(check(omit(buildRoster(), "site"), FRESH_NOW)).toEqual(
      refused({ code: "invalid-export-field", field: "site.timeZone", problem: "missing" }),
    );
  });

  describe("a second valid zone", () => {
    // 20:00Z on 7 March is 05:00 on 8 March in Tokyo, but 14:00 on 7 March in Chicago.
    const exportedAt = "2027-03-07T20:00:00Z";
    const tokyo = buildRoster({ exportedAt, exportDate: "2027-03-08", timeZone: "Asia/Tokyo" });
    const now = Date.parse(exportedAt) + HOUR_MS;

    test("the site date, coverage and horizon follow the site zone", () => {
      expect(tokyo.coverage).toEqual({ from: "2027-03-02", to: "2027-03-29" });
      expect(check(tokyo, now)).toEqual({ determinable: true });
      expect(check(startGiveShiftAt(tokyo, "2027-03-07T10:00"), now)).toEqual(
        refused({
          code: "shift-outside-horizon",
          shiftId: GIVE_SHIFT_ID,
          start: "2027-03-07T10:00",
          horizonFrom: "2027-03-08",
          horizonTo: "2027-03-23",
        }),
      );
    });

    test("the same instant in Chicago is a coverage mismatch for that roster", () => {
      const chicago = { ...tokyo, site: { name: "x", timeZone: SITE_TIME_ZONE } };
      expect(codesOf(check(chicago, now))).toEqual(["coverage-mismatch", "coverage-mismatch"]);
    });

    test("clock changes are judged in the site zone: 02:30 on 14 March exists in Tokyo", () => {
      const roster = addShift(
        tokyo,
        makeShift("GIVE-A3", GIVE_OWNER, "2027-03-14T02:30", "2027-03-14T10:00"),
      );
      expect(check(roster, now)).toEqual({ determinable: true });
    });
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

  describe("duplicates: the first match wins", () => {
    const stranger = "999999";

    test("an earlier duplicate of the give shift id is the one checked", () => {
      const duplicate = makeShift(GIVE_SHIFT_ID, stranger, "2027-03-09T06:00", "2027-03-09T18:00");
      const roster = { ...base, shifts: [duplicate, ...base.shifts] };
      expect(check(roster, FRESH_NOW)).toEqual(
        refused({ code: "owner-not-operator", shiftId: GIVE_SHIFT_ID, party: "give-shift-owner" }),
      );
    });

    test("a later duplicate of the give shift id is ignored, even if it is malformed", () => {
      const duplicate = makeShift(GIVE_SHIFT_ID, stranger, "garbage", "garbage");
      const roster = { ...base, shifts: [...base.shifts, duplicate] };
      expect(check(roster, FRESH_NOW)).toEqual({ determinable: true });
    });

    test("an earlier duplicate employee number is the operator checked", () => {
      const emptied = { employeeNumber: GIVE_OWNER, name: "Alex Duplicate", qualifications: [] };
      const roster = { ...base, operators: [emptied, ...base.operators] };
      expect(check(roster, FRESH_NOW)).toEqual(
        refused({
          code: "qualifications-missing",
          shiftId: GIVE_SHIFT_ID,
          party: "give-shift-owner",
          problem: "empty",
        }),
      );
    });

    test("a later duplicate employee number is ignored", () => {
      const emptied = { employeeNumber: GIVE_OWNER, name: "Alex Duplicate", qualifications: [] };
      const roster = { ...base, operators: [...base.operators, emptied] };
      expect(check(roster, FRESH_NOW)).toEqual({ determinable: true });
    });
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

  test("the early fields, all unusable but differently, are ordered exportedAt, zone, from, to, shifts, operators", () => {
    const roster = {
      exportedAt: "nope",
      site: { timeZone: "Mars/Olympus" },
      coverage: { to: 5 },
      shifts: "x",
    };
    expect(check(roster, FRESH_NOW)).toEqual(
      refused(
        { code: "invalid-export-field", field: "exportedAt", problem: "malformed" },
        { code: "invalid-export-field", field: "site.timeZone", problem: "unknown-time-zone" },
        { code: "invalid-export-field", field: "coverage.from", problem: "missing" },
        { code: "invalid-export-field", field: "coverage.to", problem: "malformed" },
        { code: "invalid-export-field", field: "shifts", problem: "malformed" },
        { code: "invalid-export-field", field: "operators", problem: "missing" },
      ),
    );
  });

  test("a missing exportedAt and zone come before malformed coverage dates and missing shifts", () => {
    const roster = {
      coverage: { from: "bad", to: "worse" },
      shifts: [],
      operators: [],
    };
    expect(checkIds(roster, FRESH_NOW, "A", "B")).toEqual(
      refused(
        { code: "invalid-export-field", field: "exportedAt", problem: "missing" },
        { code: "invalid-export-field", field: "site.timeZone", problem: "missing" },
        { code: "invalid-export-field", field: "coverage.from", problem: "malformed" },
        { code: "invalid-export-field", field: "coverage.to", problem: "malformed" },
        { code: "missing-shift", shiftId: "A" },
        { code: "missing-shift", shiftId: "B" },
      ),
    );
  });

  test("all owner reasons come before all qualification reasons, not party by party", () => {
    // Per party the order would be give-qualifications then take-owner; the contract is reversed.
    const roster = setQualifications(removeOperator(buildRoster(), TAKE_OWNER), GIVE_OWNER, []);
    expect(check(roster, FRESH_NOW)).toEqual(
      refused(
        { code: "owner-not-operator", shiftId: TAKE_SHIFT_ID, party: "take-shift-owner" },
        {
          code: "qualifications-missing",
          shiftId: GIVE_SHIFT_ID,
          party: "give-shift-owner",
          problem: "empty",
        },
      ),
    );
  });

  test("both shifts missing: stale first, then missing-shift for give then take", () => {
    expect(checkIds(buildRoster(), Date.parse("2027-03-08T12:00:00Z"), "NOPE-1", "NOPE-2")).toEqual(
      refused(
        { code: "export-stale", ageHours: 28, ageMinutes: 0, limitHours: 26 },
        { code: "missing-shift", shiftId: "NOPE-1" },
        { code: "missing-shift", shiftId: "NOPE-2" },
      ),
    );
  });

  test("a missing give shift is followed by the take shift's own reasons, in category order", () => {
    let roster = setQualifications(buildRoster(), TAKE_OWNER, []);
    roster = replaceShift(roster, TAKE_SHIFT_ID, { start: "2027-03-23T06:00", end: "bad" });
    roster = replaceShift(roster, TAKE_OTHER_SHIFT_ID, { start: "2027-03-14T02:30" });
    expect(checkIds(roster, FRESH_NOW, "NOPE-1", TAKE_SHIFT_ID)).toEqual(
      refused(
        { code: "missing-shift", shiftId: "NOPE-1" },
        {
          code: "qualifications-missing",
          shiftId: TAKE_SHIFT_ID,
          party: "take-shift-owner",
          problem: "empty",
        },
        { code: "shift-time-malformed", shiftId: TAKE_SHIFT_ID, field: "end" },
        {
          code: "shift-outside-horizon",
          shiftId: TAKE_SHIFT_ID,
          start: "2027-03-23T06:00",
          horizonFrom: "2027-03-07",
          horizonTo: "2027-03-22",
        },
        {
          code: "nonexistent-local-time",
          shiftId: TAKE_OTHER_SHIFT_ID,
          field: "start",
          value: "2027-03-14T02:30",
        },
      ),
    );
  });

  test("a missing take shift comes before the give shift's own reasons", () => {
    let roster = removeOperator(buildRoster(), GIVE_OWNER);
    roster = replaceShift(roster, GIVE_SHIFT_ID, { start: "2027-03-23T06:00", end: "2027-03-23T18:00" });
    roster = replaceShift(roster, GIVE_OTHER_SHIFT_ID, { end: "bad" });
    expect(checkIds(roster, FRESH_NOW, GIVE_SHIFT_ID, "NOPE-2")).toEqual(
      refused(
        { code: "missing-shift", shiftId: "NOPE-2" },
        { code: "owner-not-operator", shiftId: GIVE_SHIFT_ID, party: "give-shift-owner" },
        { code: "shift-time-malformed", shiftId: GIVE_OTHER_SHIFT_ID, field: "end" },
        {
          code: "shift-outside-horizon",
          shiftId: GIVE_SHIFT_ID,
          start: "2027-03-23T06:00",
          horizonFrom: "2027-03-07",
          horizonTo: "2027-03-22",
        },
      ),
    );
  });

  test("malformed times are in roster order across both owners, start before end", () => {
    let roster = addShift(buildRoster(), makeShift("TAKE-B3", TAKE_OWNER, "bad", "worse"));
    roster = addShift(roster, makeShift("GIVE-A3", GIVE_OWNER, "bad", "2027-03-12T18:00"));
    expect(check(roster, FRESH_NOW)).toEqual(
      refused(
        { code: "shift-time-malformed", shiftId: "TAKE-B3", field: "start" },
        { code: "shift-time-malformed", shiftId: "TAKE-B3", field: "end" },
        { code: "shift-time-malformed", shiftId: "GIVE-A3", field: "start" },
      ),
    );
  });

  test("clock-change reasons are in roster order, start before end, nonexistent beside ambiguous", () => {
    // With coverage unusable every shift of the owners is checked, so both kinds can appear.
    let roster = addShift(
      buildRoster(),
      makeShift("TAKE-B3", TAKE_OWNER, "2027-03-14T02:30", "2027-11-07T01:30"),
    );
    roster = addShift(roster, makeShift("GIVE-A3", GIVE_OWNER, "2027-11-07T01:30", "2027-03-14T02:30"));
    expect(check(omit(roster, "coverage"), FRESH_NOW)).toEqual(
      refused(
        { code: "invalid-export-field", field: "coverage", problem: "missing" },
        {
          code: "nonexistent-local-time",
          shiftId: "TAKE-B3",
          field: "start",
          value: "2027-03-14T02:30",
        },
        {
          code: "ambiguous-local-time",
          shiftId: "TAKE-B3",
          field: "end",
          value: "2027-11-07T01:30",
        },
        {
          code: "ambiguous-local-time",
          shiftId: "GIVE-A3",
          field: "start",
          value: "2027-11-07T01:30",
        },
        {
          code: "nonexistent-local-time",
          shiftId: "GIVE-A3",
          field: "end",
          value: "2027-03-14T02:30",
        },
      ),
    );
  });

  test("now-before-export sits after the coverage reasons and before the record reasons", () => {
    let roster = withCoverage(buildRoster(), "2027-03-02", "2027-03-28");
    roster = replaceShift(roster, TAKE_SHIFT_ID, { start: "2027-03-23T06:00", end: "2027-03-23T18:00" });
    expect(checkIds(roster, EXPORTED_AT_MS - HOUR_MS, "NOPE-1", TAKE_SHIFT_ID)).toEqual(
      refused(
        {
          code: "coverage-mismatch",
          field: "coverage.from",
          actual: "2027-03-02",
          expected: "2027-03-01",
        },
        {
          code: "now-before-export",
          exportedAt: SAMPLE_EXPORTED_AT,
          now: "2027-03-07T07:00:00.000Z",
        },
        { code: "missing-shift", shiftId: "NOPE-1" },
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
});

describe("qualification entries and shift unit and role (W8)", () => {
  const base = buildRoster();
  const GOOD_ENTRY = { unit: "CDU", role: "CONSOLE", validThrough: "2030-12-31" };
  const parties = [
    {
      party: "give-shift-owner",
      owner: GIVE_OWNER,
      swappedShiftId: GIVE_SHIFT_ID,
      otherShiftId: GIVE_OTHER_SHIFT_ID,
    },
    {
      party: "take-shift-owner",
      owner: TAKE_OWNER,
      swappedShiftId: TAKE_SHIFT_ID,
      otherShiftId: TAKE_OTHER_SHIFT_ID,
    },
  ] as const;

  /** What the two helpers below need of a roster; the other fields pass through at run time. */
  interface LooseRoster {
    readonly operators: readonly { readonly employeeNumber: string }[];
    readonly shifts: readonly { readonly shiftId: string }[];
  }

  /** `owner`'s qualifications replaced by `entries`, which need not be well formed. */
  function withEntries(roster: LooseRoster, owner: string, entries: unknown[]): LooseRoster {
    return {
      ...roster,
      operators: roster.operators.map((operator) =>
        operator.employeeNumber === owner ? { ...operator, qualifications: entries } : operator,
      ),
    };
  }

  /** The shift `shiftId` with `patch` laid over it, which need not be well formed. */
  function withShiftPatch(
    roster: LooseRoster,
    shiftId: string,
    patch: Record<string, unknown>,
  ): LooseRoster {
    return {
      ...roster,
      shifts: roster.shifts.map((shift) => (shift.shiftId === shiftId ? { ...shift, ...patch } : shift)),
    };
  }

  describe.each(parties)("case (i): a qualification entry of the $party", ({ party, owner }) => {
    test.each([
      ["a string", "CDU", "malformed"],
      ["a number", 7, "malformed"],
      ["an array", [], "malformed"],
      ["null", null, "missing"],
      ["undefined", undefined, "missing"],
    ] as const)("that is %s names the entry", (_label, entry, problem) => {
      const roster = withEntries(base, owner, [GOOD_ENTRY, entry]);
      expect(check(roster, FRESH_NOW)).toEqual(
        refused({
          code: "invalid-export-field",
          field: "operators.qualifications",
          party,
          index: 1,
          problem,
        }),
      );
    });

    test.each([
      ["unit", "a number", { unit: 5 }, "malformed"],
      ["unit", "an object", { unit: {} }, "malformed"],
      ["unit", "absent", { unit: undefined }, "missing"],
      ["unit", "null", { unit: null }, "missing"],
      ["role", "a number", { role: 5 }, "malformed"],
      ["role", "an array", { role: ["CONSOLE"] }, "malformed"],
      ["role", "absent", { role: undefined }, "missing"],
      ["role", "null", { role: null }, "missing"],
      ["validThrough", "absent", { validThrough: undefined }, "missing"],
      ["validThrough", "null", { validThrough: null }, "missing"],
      ["validThrough", "not a date", { validThrough: "soon" }, "malformed"],
      ["validThrough", "an impossible date", { validThrough: "2030-02-30" }, "malformed"],
      ["validThrough", "a date with a time", { validThrough: "2030-12-31T00:00" }, "malformed"],
      ["validThrough", "a number", { validThrough: 20301231 }, "malformed"],
    ] as const)("with %s %s names that field of the entry", (field, _label, patch, problem) => {
      const roster = withEntries(base, owner, [GOOD_ENTRY, { ...GOOD_ENTRY, ...patch }]);
      expect(check(roster, FRESH_NOW)).toEqual(
        refused({
          code: "invalid-export-field",
          field: `operators.qualifications.${field}`,
          party,
          index: 1,
          problem,
        }),
      );
    });

    test("with every field unusable names unit, role and validThrough in that order", () => {
      const roster = withEntries(base, owner, [{ unit: 1, role: null }]);
      expect(check(roster, FRESH_NOW)).toEqual(
        refused(
          {
            code: "invalid-export-field",
            field: "operators.qualifications.unit",
            party,
            index: 0,
            problem: "malformed",
          },
          {
            code: "invalid-export-field",
            field: "operators.qualifications.role",
            party,
            index: 0,
            problem: "missing",
          },
          {
            code: "invalid-export-field",
            field: "operators.qualifications.validThrough",
            party,
            index: 0,
            problem: "missing",
          },
        ),
      );
    });

    test("names every bad entry, in entry order", () => {
      const roster = withEntries(base, owner, ["x", GOOD_ENTRY, { ...GOOD_ENTRY, role: 2 }]);
      expect(check(roster, FRESH_NOW)).toEqual(
        refused(
          {
            code: "invalid-export-field",
            field: "operators.qualifications",
            party,
            index: 0,
            problem: "malformed",
          },
          {
            code: "invalid-export-field",
            field: "operators.qualifications.role",
            party,
            index: 2,
            problem: "malformed",
          },
        ),
      );
    });

    test("entries that are well formed give no reason", () => {
      const roster = withEntries(base, owner, [
        GOOD_ENTRY,
        { unit: "HCU", role: "FIELD", validThrough: "2027-01-01" },
      ]);
      expect(check(roster, FRESH_NOW)).toEqual({ determinable: true });
    });
  });

  test("a bad qualification entry of an operator who is not part of the swap gives no reason", () => {
    expect(check(withEntries(base, BYSTANDER, ["x", { unit: 1 }]), FRESH_NOW)).toEqual({
      determinable: true,
    });
  });

  describe.each(parties)("case (ii): a shift of the $party", ({ party, swappedShiftId, otherShiftId }) => {
    test.each([
      ["unit", "a number", { unit: 5 }, "malformed"],
      ["unit", "an object", { unit: {} }, "malformed"],
      ["unit", "absent", { unit: undefined }, "missing"],
      ["unit", "null", { unit: null }, "missing"],
      ["role", "a number", { role: 5 }, "malformed"],
      ["role", "an array", { role: [] }, "malformed"],
      ["role", "absent", { role: undefined }, "missing"],
      ["role", "null", { role: null }, "missing"],
    ] as const)("within coverage with %s %s names the shift", (field, _label, patch, problem) => {
      for (const shiftId of [swappedShiftId, otherShiftId]) {
        expect(check(withShiftPatch(base, shiftId, patch), FRESH_NOW)).toEqual(
          refused({
            code: "invalid-export-field",
            field: `shifts.${field}`,
            party,
            shiftId,
            problem,
          }),
        );
      }
    });

    test("with both unit and role unusable names unit, then role", () => {
      const roster = withShiftPatch(base, otherShiftId, { unit: 1, role: undefined });
      expect(check(roster, FRESH_NOW)).toEqual(
        refused(
          {
            code: "invalid-export-field",
            field: "shifts.unit",
            party,
            shiftId: otherShiftId,
            problem: "malformed",
          },
          {
            code: "invalid-export-field",
            field: "shifts.role",
            party,
            shiftId: otherShiftId,
            problem: "missing",
          },
        ),
      );
    });

    test.each([
      ["before coverage", "2027-02-28T06:00", "2027-02-28T18:00"],
      ["after coverage", "2027-03-29T06:00", "2027-03-29T18:00"],
    ])("a bad unit and role on a shift starting %s give no reason", (_label, start, end) => {
      const roster = withShiftPatch(base, otherShiftId, { start, end, unit: 5, role: null });
      expect(check(roster, FRESH_NOW)).toEqual({ determinable: true });
    });

    test("a shift whose start is malformed gives only the time reason, not a unit or role reason", () => {
      const roster = withShiftPatch(base, otherShiftId, { start: "2027-03-12 06:00", unit: 5, role: null });
      expect(check(roster, FRESH_NOW)).toEqual(
        refused({ code: "shift-time-malformed", shiftId: otherShiftId, field: "start" }),
      );
    });
  });

  test("a bad unit or role on a shift of an operator who is not part of the swap gives no reason", () => {
    const roster = withShiftPatch(base, BYSTANDER_SHIFT_ID, { unit: 5, role: null });
    expect(check(roster, FRESH_NOW)).toEqual({ determinable: true });
  });

  test("a bad unit on a shift that starts on the first or last coverage date is named", () => {
    const first = withShiftPatch(base, GIVE_OTHER_SHIFT_ID, {
      start: "2027-03-01T06:00",
      end: "2027-03-01T18:00",
      unit: 5,
    });
    const last = withShiftPatch(base, GIVE_OTHER_SHIFT_ID, {
      start: "2027-03-28T20:00",
      end: "2027-03-29T04:00",
      unit: 5,
    });
    for (const roster of [first, last]) {
      expect(codesOf(check(roster, FRESH_NOW))).toEqual(["invalid-export-field"]);
    }
  });

  describe("mixed errors", () => {
    // Every group of the W8 reasons and the groups around them, written out of order.
    function mixedRoster(): LooseRoster {
      let roster = withShiftPatch(
        setQualifications(base, GIVE_OWNER, undefined),
        GIVE_OTHER_SHIFT_ID,
        { start: "2027-03-14T02:30" },
      );
      roster = withShiftPatch(roster, TAKE_OTHER_SHIFT_ID, { end: "garbage", role: null });
      roster = withShiftPatch(roster, GIVE_SHIFT_ID, { unit: 3 });
      roster = withShiftPatch(roster, TAKE_SHIFT_ID, {
        start: "2027-03-25T06:00",
        end: "2027-03-25T18:00",
      });
      return withEntries(roster, TAKE_OWNER, [
        { ...GOOD_ENTRY, unit: { employeeNumber: GIVE_OWNER, name: "Alex Example" } },
        "x",
      ]);
    }

    test("qualification entry reasons follow the qualifications-missing reasons; shift unit and role reasons follow shift-time-malformed and precede the horizon reasons", () => {
      expect(check(mixedRoster(), FRESH_NOW)).toEqual(
        refused(
          {
            code: "qualifications-missing",
            shiftId: GIVE_SHIFT_ID,
            party: "give-shift-owner",
            problem: "absent",
          },
          {
            code: "invalid-export-field",
            field: "operators.qualifications.unit",
            party: "take-shift-owner",
            index: 0,
            problem: "malformed",
          },
          {
            code: "invalid-export-field",
            field: "operators.qualifications",
            party: "take-shift-owner",
            index: 1,
            problem: "malformed",
          },
          { code: "shift-time-malformed", shiftId: TAKE_OTHER_SHIFT_ID, field: "end" },
          {
            code: "invalid-export-field",
            field: "shifts.unit",
            party: "give-shift-owner",
            shiftId: GIVE_SHIFT_ID,
            problem: "malformed",
          },
          {
            code: "invalid-export-field",
            field: "shifts.role",
            party: "take-shift-owner",
            shiftId: TAKE_OTHER_SHIFT_ID,
            problem: "missing",
          },
          {
            code: "shift-outside-horizon",
            shiftId: TAKE_SHIFT_ID,
            start: "2027-03-25T06:00",
            horizonFrom: "2027-03-07",
            horizonTo: "2027-03-22",
          },
          {
            code: "nonexistent-local-time",
            shiftId: GIVE_OTHER_SHIFT_ID,
            field: "start",
            value: "2027-03-14T02:30",
          },
        ),
      );
    });

    test("no reason carries a name or an employee number", () => {
      const text = JSON.stringify(reasonsOf(check(mixedRoster(), FRESH_NOW)));
      for (const identifier of [GIVE_OWNER, TAKE_OWNER, BYSTANDER, "Alex Example", "Blair Sample", "Casey Placeholder"]) {
        expect(text).not.toContain(identifier);
      }
      expect(reasonsOf(check(mixedRoster(), FRESH_NOW)).length).toBeGreaterThan(0);
    });

    test("no W8 reason has a field other than its documented shape", () => {
      const w8 = reasonsOf(check(mixedRoster(), FRESH_NOW)).filter(
        (reason) => reason.code === "invalid-export-field",
      );
      expect(w8.map((reason) => Object.keys(reason).sort())).toEqual([
        ["code", "field", "index", "party", "problem"],
        ["code", "field", "index", "party", "problem"],
        ["code", "field", "party", "problem", "shiftId"],
        ["code", "field", "party", "problem", "shiftId"],
      ]);
    });
  });
});

const KNOWN_CODES = new Set<string>([
  "invalid-now",
  "invalid-export-field",
  "coverage-mismatch",
  "now-before-export",
  "export-stale",
  "missing-shift",
  "owner-not-operator",
  "qualifications-missing",
  "shift-time-malformed",
  "shift-outside-horizon",
  "nonexistent-local-time",
  "ambiguous-local-time",
]);

function containsNullOrNaN(value: unknown): boolean {
  if (value === null || (typeof value === "number" && Number.isNaN(value))) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(containsNullOrNaN);
  }
  if (typeof value === "object") {
    return Object.values(value).some(containsNullOrNaN);
  }
  return false;
}

/** The result is a well-formed Determinability: known codes, finite numbers, no null or NaN. */
function expectWellFormed(result: Determinability): void {
  expect(numbersIn(result).every(Number.isFinite)).toBe(true);
  expect(containsNullOrNaN(result)).toBe(false);
  if (result.determinable) {
    expect(Object.keys(result)).toEqual(["determinable"]);
    return;
  }
  expect(result.reasons.length).toBeGreaterThan(0);
  for (const reason of result.reasons) {
    expect(KNOWN_CODES.has(reason.code)).toBe(true);
  }
}

describe("robustness properties (criterion 8)", () => {
  test("for arbitrary JSON the gate never throws and the result is well formed", () => {
    fc.assert(
      fc.property(
        fc.jsonValue(),
        fc.string(),
        fc.string(),
        fc.double(),
        (roster, giveShiftId, takeShiftId, now) => {
          expectWellFormed(checkIds(roster, now, giveShiftId, takeShiftId));
        },
      ),
      { numRuns: 300 },
    );
  });

  test("for arbitrary values the gate never throws and the result is well formed", () => {
    fc.assert(
      fc.property(
        fc.anything(),
        fc.string(),
        fc.string(),
        fc.double(),
        (roster, giveShiftId, takeShiftId, now) => {
          expectWellFormed(checkIds(roster, now, giveShiftId, takeShiftId));
        },
      ),
      { numRuns: 300 },
    );
  });

  describe("a valid roster with one or more fields replaced deep inside", () => {
    type Path = (string | number)[];

    function pathsOf(value: unknown, prefix: Path = []): Path[] {
      const own: Path[] = prefix.length > 0 ? [prefix] : [];
      if (Array.isArray(value)) {
        return [...own, ...value.flatMap((item, index) => pathsOf(item, [...prefix, index]))];
      }
      if (typeof value === "object" && value !== null) {
        return [
          ...own,
          ...Object.entries(value).flatMap(([key, item]) => pathsOf(item, [...prefix, key])),
        ];
      }
      return own;
    }

    function setAt(root: unknown, path: Path, value: unknown): unknown {
      const [head, ...rest] = path;
      if (head === undefined) {
        return value;
      }
      if (Array.isArray(root) && typeof head === "number") {
        const copy: unknown[] = [...root];
        copy[head] = setAt(copy[head], rest, value);
        return copy;
      }
      if (typeof root === "object" && root !== null && typeof head === "string") {
        return { ...root, [head]: setAt(Reflect.get(root, head), rest, value) };
      }
      return root;
    }

    const roster = buildRoster();
    const allPaths = pathsOf(roster);
    const personal = [
      GIVE_OWNER,
      TAKE_OWNER,
      BYSTANDER,
      "Alex Example",
      "Blair Sample",
      "Casey Placeholder",
      "Dana Fictional",
      "900100",
    ];
    const interesting = fc.constantFrom<unknown>(
      undefined,
      null,
      [],
      {},
      "",
      0,
      "garbage",
      "UTC",
      "2027-03-14T02:30",
      "2027-11-07T01:30",
      "2027-03-07T08:00:00Z",
      "2027-03-07",
      { from: "2027-03-01" },
    );

    function replacementFor(path: Path): fc.Arbitrary<unknown> {
      const last = path[path.length - 1];
      if (last === "employeeNumber") {
        return fc.oneof(
          fc.anything(),
          fc.constantFrom<unknown>(GIVE_OWNER, TAKE_OWNER, BYSTANDER, 900001),
        );
      }
      if (last === "shiftId") {
        return fc.oneof(
          fc.anything(),
          fc.constantFrom<unknown>(GIVE_SHIFT_ID, TAKE_SHIFT_ID, "dup", 7),
        );
      }
      return fc.oneof(fc.anything(), interesting);
    }

    const replacement = fc
      .constantFrom(...allPaths)
      .chain((path) => replacementFor(path).map((value) => ({ path, value })));

    const shiftIdArb = fc.oneof(
      fc.constantFrom(GIVE_SHIFT_ID, TAKE_SHIFT_ID, GIVE_OTHER_SHIFT_ID, "NOPE"),
      fc.string(),
    );

    test("never throws, every number is finite, no null or NaN, and no personal data is reported", () => {
      fc.assert(
        fc.property(
          fc.array(replacement, { minLength: 1, maxLength: 3 }),
          shiftIdArb,
          shiftIdArb,
          fc.oneof(fc.constant(FRESH_NOW), fc.double()),
          (replacements, giveShiftId, takeShiftId, now) => {
            let mutated: unknown = roster;
            for (const { path, value } of replacements) {
              mutated = setAt(mutated, path, value);
            }
            const result = checkIds(mutated, now, giveShiftId, takeShiftId);
            expectWellFormed(result);
            const text = JSON.stringify(reasonsOf(result));
            for (const secret of personal) {
              expect(text).not.toContain(secret);
            }
          },
        ),
        { numRuns: 1000 },
      );
    });
  });

  describe("exportedAt", () => {
    const pad2 = (value: number): string => String(value).padStart(2, "0");

    interface InstantParts {
      year: number;
      month: number;
      day: number;
      hour: number;
      minute: number;
      second: number;
      fraction: string;
      seconds: boolean;
    }

    const validParts = fc.record({
      year: fc.integer({ min: 2000, max: 2099 }),
      month: fc.integer({ min: 1, max: 12 }),
      day: fc.integer({ min: 1, max: 28 }),
      hour: fc.integer({ min: 0, max: 23 }),
      minute: fc.integer({ min: 0, max: 59 }),
      second: fc.integer({ min: 0, max: 59 }),
      fraction: fc.constantFrom("", ".1", ".12", ".123"),
      seconds: fc.boolean(),
    });

    const dateOf = (p: InstantParts): string => `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
    const clockOf = (p: InstantParts): string =>
      `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;

    function instantOf(p: InstantParts): string {
      return p.seconds
        ? `${dateOf(p)}T${clockOf(p)}${p.fraction}Z`
        : `${dateOf(p)}T${pad2(p.hour)}:${pad2(p.minute)}Z`;
    }

    // Each breaker takes a valid instant and breaks exactly one thing.
    const breakers: ((p: InstantParts, n: number) => string)[] = [
      (p) => `${p.year}-02-30T${clockOf(p)}Z`,
      (p) => `${p.year}-04-31T${clockOf(p)}Z`,
      (p, n) => `${p.year}-${pad2(13 + (n % 87))}-${pad2(p.day)}T${clockOf(p)}Z`,
      (p) => `${p.year}-00-${pad2(p.day)}T${clockOf(p)}Z`,
      (p, n) => `${p.year}-${pad2(p.month)}-${pad2(32 + (n % 68))}T${clockOf(p)}Z`,
      (p) => `${p.year}-${pad2(p.month)}-00T${clockOf(p)}Z`,
      (p, n) => `${dateOf(p)}T${pad2(24 + (n % 76))}:${pad2(p.minute)}:${pad2(p.second)}Z`,
      (p, n) => `${dateOf(p)}T${pad2(p.hour)}:${pad2(60 + (n % 40))}:${pad2(p.second)}Z`,
      (p, n) => `${dateOf(p)}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(60 + (n % 40))}Z`,
      (p) => instantOf(p).replace(/Z$/, "z"),
      (p) => instantOf(p).replace(/Z$/, "+00:00"),
      (p) => instantOf(p).replace(/Z$/, ""),
      (p) => instantOf(p).replace(/Z$/, " Z"),
      (p) => `${instantOf(p)} `,
      (p) => ` ${instantOf(p)}`,
      (p) => `${instantOf(p)}x`,
      (p) => `${dateOf(p)}T${clockOf(p)}.1234Z`,
      (p) => `${dateOf(p)}T${clockOf(p)}.Z`,
      (p) => instantOf(p).replace("T", " "),
      (p) => instantOf(p).replace("-", "/"),
      (p) => dateOf(p),
      (p) => `${p.year % 100}${instantOf(p).slice(4)}`,
    ];

    test("an instant with exactly one thing broken is never determinable and is reported as malformed", () => {
      const base = buildRoster();
      fc.assert(
        fc.property(
          validParts,
          fc.constantFrom(...breakers),
          fc.integer({ min: 0, max: 10_000 }),
          (parts, breaker, n) => {
            const exportedAt = breaker(parts, n);
            const result = check({ ...base, exportedAt }, FRESH_NOW);
            expect(result.determinable).toBe(false);
            expect(
              reasonsOf(result).filter(
                (reason) => reason.code === "invalid-export-field" && reason.field === "exportedAt",
              ),
            ).toEqual([{ code: "invalid-export-field", field: "exportedAt", problem: "malformed" }]);
          },
        ),
        { numRuns: 1000 },
      );
    });

    test("an instant built from random valid parts is accepted and sets D", () => {
      fc.assert(
        fc.property(validParts, (parts) => {
          const exportedAt = instantOf(parts);
          // In UTC the site date is the instant's date, so a roster built for it is determinable.
          const roster = buildRoster({ exportedAt, exportDate: dateOf(parts), timeZone: "UTC" });
          expect(check(roster, Date.parse(exportedAt) + HOUR_MS)).toEqual({ determinable: true });
        }),
        { numRuns: 500 },
      );
    });

    test("a valid roster whose exportedAt is arbitrary JSON that is not an instant is never determinable", () => {
      // Strings that merely begin like an instant are excluded; the breakers above cover those.
      const notAnInstant = fc
        .jsonValue()
        .filter(
          (value) => !(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)),
        );
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
});
