import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { renderExportedAt } from "./exported-at";

const ACCEPTED_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z$/;
const SITE_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const FIRST_MS = Date.UTC(2000, 0, 1, 0, 0, 0, 0);
const LAST_MS = Date.UTC(2099, 11, 31, 23, 59, 59, 999);

const validInstant = fc
  .integer({ min: FIRST_MS, max: LAST_MS })
  .map((ms) => new Date(ms).toISOString());

describe("renderExportedAt examples", () => {
  test("renders the roster sample export in UTC and Chicago time", () => {
    expect(renderExportedAt("2027-03-07T08:00:00Z", "America/Chicago")).toEqual({
      ok: true,
      utcMinute: "2027-03-07T08:00Z",
      siteLocal: "2027-03-07T02:00",
      timeZone: "America/Chicago",
    });
  });

  test("renders local midnight as hour 00, not 24", () => {
    const r = renderExportedAt("2027-03-07T06:00:00Z", "America/Chicago");
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.siteLocal).toBe("2027-03-07T00:00");
  });

  test("renders the minute before the spring-forward change", () => {
    const r = renderExportedAt("2027-03-14T07:59:59Z", "America/Chicago");
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.siteLocal).toBe("2027-03-14T01:59");
  });

  test("skips the missing hour at the spring-forward change", () => {
    const r = renderExportedAt("2027-03-14T08:00:00Z", "America/Chicago");
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.siteLocal).toBe("2027-03-14T03:00");
  });

  test("truncates seconds and milliseconds to the minute", () => {
    const r = renderExportedAt("2027-03-07T08:00:59.999Z", "America/Chicago");
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.utcMinute).toBe("2027-03-07T08:00Z");
    expect(r.siteLocal).toBe("2027-03-07T02:00");
  });

  test("accepts an instant without seconds", () => {
    expect(renderExportedAt("2027-03-07T08:00Z", "America/Chicago")).toEqual({
      ok: true,
      utcMinute: "2027-03-07T08:00Z",
      siteLocal: "2027-03-07T02:00",
      timeZone: "America/Chicago",
    });
  });

  test("accepts an instant with seconds and a short fraction", () => {
    const r = renderExportedAt("2027-03-07T08:00:30.5Z", "UTC");
    expect(r.ok).toBe(true);
    if (!r.ok) {
      return;
    }
    expect(r.utcMinute).toBe("2027-03-07T08:00Z");
  });

  test("reports an unknown time zone", () => {
    expect(renderExportedAt("2027-03-07T08:00:00Z", "Not/AZone")).toEqual({
      ok: false,
      problem: "invalid-time-zone",
    });
  });

  test.each([
    ["no Z suffix", "2027-03-07T08:00:00"],
    ["a numeric offset", "2027-03-07T08:00:00+00:00"],
    ["an impossible date", "2027-02-30T08:00:00Z"],
    ["hour 24", "2027-03-07T24:00:00Z"],
    ["an empty string", ""],
    ["garbage", "garbage"],
  ])("rejects %s as an invalid exportedAt", (_label, input) => {
    expect(renderExportedAt(input, "America/Chicago")).toEqual({
      ok: false,
      problem: "invalid-exported-at",
    });
  });

  test("reports an invalid exportedAt before an invalid time zone", () => {
    expect(renderExportedAt("garbage", "Not/AZone")).toEqual({
      ok: false,
      problem: "invalid-exported-at",
    });
  });
});

describe("renderExportedAt properties", () => {
  test("renders any valid instant in any site zone as a well-formed local time", () => {
    fc.assert(
      fc.property(
        validInstant,
        fc.constantFrom("America/Chicago", "UTC", "Asia/Kolkata", "Pacific/Chatham"),
        (iso, zone) => {
          const r = renderExportedAt(iso, zone);
          expect(r.ok).toBe(true);
          if (!r.ok) {
            return;
          }
          expect(r.siteLocal).toMatch(SITE_LOCAL);
          expect(Number(r.siteLocal.slice(11, 13))).toBeLessThan(24);
          expect(r.timeZone).toBe(zone);
        },
      ),
    );
  });

  test("site-local time in UTC is the UTC minute without its Z", () => {
    fc.assert(
      fc.property(validInstant, (iso) => {
        const r = renderExportedAt(iso, "UTC");
        expect(r.ok).toBe(true);
        if (!r.ok) {
          return;
        }
        expect(`${r.siteLocal}Z`).toBe(r.utcMinute);
      }),
    );
  });

  test("the UTC minute is the first 16 characters of the ISO input plus Z", () => {
    fc.assert(
      fc.property(validInstant, (iso) => {
        const r = renderExportedAt(iso, "America/Chicago");
        expect(r.ok).toBe(true);
        if (!r.ok) {
          return;
        }
        expect(r.utcMinute).toBe(`${iso.slice(0, 16)}Z`);
      }),
    );
  });

  test("a string outside the accepted format is never rendered", () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !ACCEPTED_INSTANT.test(s)),
        (input) => {
          const r = renderExportedAt(input, "America/Chicago");
          expect(r.ok).toBe(false);
        },
      ),
    );
  });
});
