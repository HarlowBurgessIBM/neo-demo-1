import { describe, expect, test } from "vitest";
import { resolveClock } from "./clock";

describe("resolveClock", () => {
  test("a valid SHIFTSWAP_NOW gives a clock fixed at that instant", () => {
    const clock = resolveClock({ SHIFTSWAP_NOW: "2027-03-07T14:00:00Z" });
    expect(new Date(clock()).toISOString()).toBe("2027-03-07T14:00:00.000Z");
    const first = clock();
    expect(clock()).toBe(first);
    expect(clock()).toBe(first);
  });

  test("a fixed clock ignores the injected system clock", () => {
    const clock = resolveClock({ SHIFTSWAP_NOW: "2027-03-07T14:00:00Z" }, () => 0);
    expect(new Date(clock()).toISOString()).toBe("2027-03-07T14:00:00.000Z");
  });

  test("unset SHIFTSWAP_NOW gives the system clock, within 1 s of Date.now()", () => {
    const clock = resolveClock({});
    expect(Math.abs(clock() - Date.now())).toBeLessThan(1000);
  });

  test("unset SHIFTSWAP_NOW uses the injected systemNow function", () => {
    const systemNow = (): number => 1_234_567;
    expect(resolveClock({}, systemNow)).toBe(systemNow);
    expect(resolveClock({}, systemNow)()).toBe(1_234_567);
  });

  test.each([
    ["empty string", ""],
    ["a word", "yesterday"],
    ["no offset", "2027-03-07T14:00:00"],
    ["numeric offset instead of Z", "2027-03-07T14:00:00+00:00"],
    ["impossible date", "2027-02-30T14:00:00Z"],
    ["leading whitespace", " 2027-03-07T14:00:00Z"],
    ["trailing whitespace", "2027-03-07T14:00:00Z "],
  ])("a malformed SHIFTSWAP_NOW throws and names it: %s", (_label, value) => {
    expect(() => resolveClock({ SHIFTSWAP_NOW: value })).toThrowError(/SHIFTSWAP_NOW/);
  });
});
