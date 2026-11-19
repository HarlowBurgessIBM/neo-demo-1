import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  addDays,
  elapsedMinutes,
  isLocalDate,
  isLocalWallTime,
  isValidTimeZone,
  parseUtcInstant,
  resolveLocalTime,
  siteLocalDate,
} from "./site-time";

const CHICAGO = "America/Chicago";
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

describe("parseUtcInstant examples", () => {
  test("accepts an instant with seconds", () => {
    expect(parseUtcInstant("2027-03-07T08:00:00Z")).toBe(Date.UTC(2027, 2, 7, 8, 0, 0));
  });

  test("accepts an instant with milliseconds", () => {
    expect(parseUtcInstant("2027-03-07T08:00:00.001Z")).toBe(Date.UTC(2027, 2, 7, 8, 0, 0, 1));
  });

  test.each([
    ["no offset", "2027-03-07T08:00:00"],
    ["a numeric offset", "2027-03-07T08:00:00+01:00"],
    ["garbage", "garbage"],
    ["an empty string", ""],
    ["an impossible date", "2027-02-30T08:00:00Z"],
  ])("rejects %s", (_label, input) => {
    expect(parseUtcInstant(input)).toBeUndefined();
  });
});

describe("isValidTimeZone examples", () => {
  test.each(["America/Chicago", "UTC"])("accepts %s", (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
  });

  test.each([
    ["an unknown zone", "Mars/Olympus"],
    ["an empty string", ""],
    ["blank text", "   "],
    ["a numeric offset", "+05:00"],
    ["a compact negative offset", "-0500"],
    ["a minus-sign offset", "\u221205:00"],
    ["a number", 42],
    ["null", null],
    ["undefined", undefined],
  ])("rejects %s", (_label, value) => {
    expect(isValidTimeZone(value)).toBe(false);
  });
});

describe("isLocalDate and isLocalWallTime examples", () => {
  test.each([
    ["2027-03-07", true],
    ["2028-02-29", true],
    ["2027-02-29", false],
    ["2027-13-01", false],
    ["2027-04-31", false],
    ["2027-3-7", false],
    ["2027-03-07T10:00", false],
    ["", false],
  ])("isLocalDate(%j) is %s", (value, expected) => {
    expect(isLocalDate(value)).toBe(expected);
  });

  test.each([
    ["2027-03-07T10:00", true],
    ["2028-02-29T23:59", true],
    ["2027-03-07T00:00", true],
    ["2027-02-29T10:00", false],
    ["2027-03-07T24:00", false],
    ["2027-03-07T10:60", false],
    ["2027-03-07T10:00:00", false],
    ["2027-03-07", false],
    ["", false],
  ])("isLocalWallTime(%j) is %s", (value, expected) => {
    expect(isLocalWallTime(value)).toBe(expected);
  });

  test.each([42, null, undefined, {}, ["2027-03-07"]])("rejects non-string %j", (value) => {
    expect(isLocalDate(value)).toBe(false);
    expect(isLocalWallTime(value)).toBe(false);
  });
});

describe("addDays examples", () => {
  test.each([
    ["2027-03-07", 1, "2027-03-08"],
    ["2027-03-07", 0, "2027-03-07"],
    ["2027-01-31", 1, "2027-02-01"],
    ["2027-02-28", 1, "2027-03-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2027-12-31", 1, "2028-01-01"],
    ["2027-03-01", -1, "2027-02-28"],
    ["2028-03-01", -1, "2028-02-29"],
    ["2028-01-01", -1, "2027-12-31"],
    ["2027-03-07", 365, "2028-03-06"],
    ["2027-03-07", -7, "2027-02-28"],
  ])("addDays(%s, %i) is %s", (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });

  test.each([
    ["an impossible date", "2027-02-30", 1],
    ["a malformed date", "garbage", 1],
    ["an empty date", "", 1],
    ["a fractional day count", "2027-03-07", 1.5],
    ["a NaN day count", "2027-03-07", Number.NaN],
    ["an infinite day count", "2027-03-07", Number.POSITIVE_INFINITY],
  ])("returns undefined for %s", (_label, date, days) => {
    expect(addDays(date, days)).toBeUndefined();
  });
});

describe("siteLocalDate examples", () => {
  test("uses the site date, not the UTC date, for exportedAt 2027-03-08T03:00:00Z in Chicago", () => {
    expect(siteLocalDate(Date.UTC(2027, 2, 8, 3, 0, 0), CHICAGO)).toBe("2027-03-07");
  });

  test("agrees with the UTC date when the site is UTC", () => {
    expect(siteLocalDate(Date.UTC(2027, 2, 8, 3, 0, 0), "UTC")).toBe("2027-03-08");
  });

  test("returns undefined for an invalid zone", () => {
    expect(siteLocalDate(Date.UTC(2027, 2, 8), "Mars/Olympus")).toBeUndefined();
    expect(siteLocalDate(Date.UTC(2027, 2, 8), "+05:00")).toBeUndefined();
  });

  test("returns undefined for a non-finite epoch", () => {
    expect(siteLocalDate(Number.NaN, CHICAGO)).toBeUndefined();
  });
});

describe("resolveLocalTime examples", () => {
  test.each(["2027-03-14T02:00", "2027-03-14T02:30", "2027-03-14T02:59"])(
    "%s in Chicago is nonexistent (spring forward)",
    (wall) => {
      expect(resolveLocalTime(wall, CHICAGO)).toEqual({ kind: "nonexistent" });
    },
  );

  test("the minute before spring forward is CST (UTC-6)", () => {
    expect(resolveLocalTime("2027-03-14T01:59", CHICAGO)).toEqual({
      kind: "ok",
      epochMs: Date.UTC(2027, 2, 14, 7, 59),
    });
  });

  test("the first minute after spring forward is CDT (UTC-5)", () => {
    expect(resolveLocalTime("2027-03-14T03:00", CHICAGO)).toEqual({
      kind: "ok",
      epochMs: Date.UTC(2027, 2, 14, 8, 0),
    });
  });

  test.each([
    ["2027-11-07T01:00", Date.UTC(2027, 10, 7, 6, 0)],
    ["2027-11-07T01:30", Date.UTC(2027, 10, 7, 6, 30)],
    ["2027-11-07T01:59", Date.UTC(2027, 10, 7, 6, 59)],
  ])("%s in Chicago is ambiguous (fall back)", (wall, cdtEpochMs) => {
    expect(resolveLocalTime(wall, CHICAGO)).toEqual({
      kind: "ambiguous",
      earlierEpochMs: cdtEpochMs,
      laterEpochMs: cdtEpochMs + HOUR_MS,
    });
  });

  test("the minute before the fall-back hour is CDT (UTC-5)", () => {
    expect(resolveLocalTime("2027-11-07T00:59", CHICAGO)).toEqual({
      kind: "ok",
      epochMs: Date.UTC(2027, 10, 7, 5, 59),
    });
  });

  test("the first minute after the fall-back hour is CST (UTC-6)", () => {
    expect(resolveLocalTime("2027-11-07T02:00", CHICAGO)).toEqual({
      kind: "ok",
      epochMs: Date.UTC(2027, 10, 7, 8, 0),
    });
  });

  test("an ordinary winter time resolves with the CST offset", () => {
    expect(resolveLocalTime("2027-03-07T02:00", CHICAGO)).toEqual({
      kind: "ok",
      epochMs: Date.UTC(2027, 2, 7, 8, 0),
    });
  });

  test.each([
    ["seconds", "2027-03-07T10:00:00"],
    ["hour 24", "2027-03-07T24:00"],
    ["an impossible date", "2027-02-30T10:00"],
    ["a two-digit year", "27-03-07T10:00"],
    ["an empty string", ""],
  ])("a wall time with %s is malformed", (_label, wall) => {
    expect(resolveLocalTime(wall, CHICAGO)).toEqual({ kind: "malformed" });
  });

  test.each(["Mars/Olympus", "", "+05:00"])("zone %j is an invalid time zone", (zone) => {
    expect(resolveLocalTime("2027-03-07T10:00", zone)).toEqual({ kind: "invalid-time-zone" });
  });
});

describe("elapsedMinutes examples (criterion 1: DST elapsed time)", () => {
  test.each([
    ["spring forward: 18:00 to 05:00 is 10 h, though the clocks differ by 11 h", "2027-03-13T18:00", "2027-03-14T05:00", 10],
    ["spring forward: 18:00 to 06:00 is 11 h", "2027-03-13T18:00", "2027-03-14T06:00", 11],
    ["after the change: 05:00 to 17:00 on the same day is 12 h", "2027-03-14T05:00", "2027-03-14T17:00", 12],
    ["the day before the change: 18:00 to 06:00 is 12 h", "2027-03-12T18:00", "2027-03-13T06:00", 12],
  ])("%s", (_label, from, to, hours) => {
    expect(elapsedMinutes(from, to, CHICAGO)).toBe(hours * 60);
  });

  test("the minute before 02:00 to 03:00 on the change day is one minute", () => {
    expect(elapsedMinutes("2027-03-14T01:59", "2027-03-14T03:00", CHICAGO)).toBe(1);
  });

  test("fall back adds the repeated hour: 18:00 to 06:00 across 7 Nov is 13 h", () => {
    expect(elapsedMinutes("2027-11-06T18:00", "2027-11-07T06:00", CHICAGO)).toBe(13 * 60);
  });

  test("the same wall time is zero minutes", () => {
    expect(elapsedMinutes("2027-03-12T18:00", "2027-03-12T18:00", CHICAGO)).toBe(0);
  });

  test("is negative when the second time is earlier", () => {
    expect(elapsedMinutes("2027-03-12T18:00", "2027-03-12T17:30", CHICAGO)).toBe(-30);
  });

  test.each([
    ["a nonexistent first time", "2027-03-14T02:30", "2027-03-14T12:00", CHICAGO],
    ["a nonexistent second time", "2027-03-13T12:00", "2027-03-14T02:30", CHICAGO],
    ["an ambiguous time", "2027-11-07T00:00", "2027-11-07T01:30", CHICAGO],
    ["a malformed time", "2027-03-13T12:00", "garbage", CHICAGO],
    ["an invalid zone", "2027-03-13T12:00", "2027-03-13T13:00", "Mars/Olympus"],
  ])("is undefined for %s", (_label, from, to, zone) => {
    expect(elapsedMinutes(from, to, zone)).toBeUndefined();
  });
});

describe("elapsedMinutes property (criterion 2: DST)", () => {
  // The oracle works on the wall fields alone, as if they were UTC (Date.UTC), so it shares
  // nothing with the implementation, which resolves wall times through Intl.
  const FIRST_WALL_MS = Date.UTC(2027, 2, 1);
  const LAST_INDEX = 28 * 24 * 60 - 1; // 2027-03-28T23:59
  /** Wall time of the clock change: 02:00 does not exist on 14 March, the clocks jump to 03:00. */
  const GAP_START_WALL_MS = Date.UTC(2027, 2, 14, 2, 0);
  const GAP_END_WALL_MS = Date.UTC(2027, 2, 14, 3, 0);
  const GAP_FIRST_INDEX = (GAP_START_WALL_MS - FIRST_WALL_MS) / MINUTE_MS;
  const GAP_LAST_INDEX = (GAP_END_WALL_MS - FIRST_WALL_MS) / MINUTE_MS - 1;

  const wallOf = (index: number): string =>
    new Date(FIRST_WALL_MS + index * MINUTE_MS).toISOString().slice(0, 16);

  // Half the draws fall in the three days around the change, where the property bites.
  const minuteIndex = fc
    .oneof(
      fc.integer({ min: 0, max: LAST_INDEX }),
      fc.integer({ min: 12 * 24 * 60, max: 15 * 24 * 60 }),
    )
    .filter((index) => index < GAP_FIRST_INDEX || index > GAP_LAST_INDEX);

  test("elapsed is the clock difference, less 1 h iff a is before the change and b is at or after 03:00", () => {
    fc.assert(
      fc.property(fc.tuple(minuteIndex, minuteIndex), ([x, y]) => {
        const [first, second] = x <= y ? [x, y] : [y, x];
        const a = wallOf(first);
        const b = wallOf(second);
        const aWallMs = FIRST_WALL_MS + first * MINUTE_MS;
        const bWallMs = FIRST_WALL_MS + second * MINUTE_MS;
        const clockDifference = (bWallMs - aWallMs) / MINUTE_MS;
        // a before 2027-03-14T08:00Z is a before 02:00 on 14 March, site-local (CST, UTC-6).
        const crossesChange = aWallMs < GAP_START_WALL_MS && bWallMs >= GAP_END_WALL_MS;

        const elapsed = elapsedMinutes(a, b, CHICAGO);

        expect(elapsed).toBe(crossesChange ? clockDifference - 60 : clockDifference);
        expect(elapsed === clockDifference - 60).toBe(crossesChange);
      }),
      { numRuns: 1000 },
    );
  });
});

const PROPERTY_ZONES = ["America/Chicago", "Europe/London", "Australia/Sydney", "UTC"] as const;

/** The wall-clock rendering of `epochMs` in `zone` as `YYYY-MM-DDTHH:mm`, computed independently. */
function renderWall(epochMs: number, zone: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const values: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(epochMs))) {
    values[part.type] = part.value;
  }
  return `${values["year"]}-${values["month"]}-${values["day"]}T${values["hour"]}:${values["minute"]}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

const validDate = fc
  .record({
    year: fc.integer({ min: 1970, max: 2100 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 31 }),
  })
  .filter(({ year, month, day }) => day <= new Date(Date.UTC(year, month, 0)).getUTCDate())
  .map(({ year, month, day }) => `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`);

describe("site-time properties", () => {
  test("addDays is undone by the opposite addDays", () => {
    fc.assert(
      fc.property(validDate, fc.integer({ min: -400, max: 400 }), (date, days) => {
        const moved = addDays(date, days);
        expect(moved).toBeDefined();
        expect(isLocalDate(moved)).toBe(true);
        expect(addDays(moved as string, -days)).toBe(date);
      }),
    );
  });

  test("in UTC the site date is the ISO date of the instant", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: Date.UTC(1970, 0, 1), max: Date.UTC(2100, 11, 31, 23, 59, 59, 999) }),
        (epochMs) => {
          expect(siteLocalDate(epochMs, "UTC")).toBe(new Date(epochMs).toISOString().slice(0, 10));
        },
      ),
    );
  });

  test("the wall rendering of an instant resolves back to that instant", () => {
    const firstMinute = Math.ceil(Date.UTC(2000, 0, 1) / MINUTE_MS);
    const lastMinute = Math.floor(Date.UTC(2040, 11, 31, 23, 59) / MINUTE_MS);
    fc.assert(
      fc.property(
        fc.integer({ min: firstMinute, max: lastMinute }),
        fc.constantFrom(...PROPERTY_ZONES),
        (minutes, zone) => {
          const epochMs = minutes * MINUTE_MS;
          const resolved = resolveLocalTime(renderWall(epochMs, zone), zone);
          switch (resolved.kind) {
            case "ok":
              expect(resolved.epochMs).toBe(epochMs);
              break;
            case "ambiguous":
              expect([resolved.earlierEpochMs, resolved.laterEpochMs]).toContain(epochMs);
              expect(resolved.earlierEpochMs).toBeLessThan(resolved.laterEpochMs);
              break;
            default:
              expect.unreachable(`unexpected ${resolved.kind} for ${zone} at ${epochMs}`);
          }
        },
      ),
    );
  });

  test("in UTC every valid wall time resolves to its own UTC instant", () => {
    fc.assert(
      fc.property(
        validDate,
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        (date, hour, minute) => {
          const wall = `${date}T${pad(hour, 2)}:${pad(minute, 2)}`;
          const [year, month, day] = date.split("-").map(Number) as [number, number, number];
          expect(resolveLocalTime(wall, "UTC")).toEqual({
            kind: "ok",
            epochMs: Date.UTC(year, month - 1, day, hour, minute),
          });
        },
      ),
    );
  });
});
