import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { defaultRosterPath, loadConfig } from "./config";
import { parseRoster } from "./roster";
import { SAMPLE_ROSTER_PATH } from "./test-support";

function messageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the action to throw");
}

describe("config", () => {
  test("defaultRosterPath is the repo-root sample roster, and it exists", () => {
    expect(defaultRosterPath.replaceAll("\\", "/").endsWith("data/roster.sample.json")).toBe(true);
    expect(defaultRosterPath).toBe(SAMPLE_ROSTER_PATH);
    expect(existsSync(defaultRosterPath)).toBe(true);
  });

  test("loadConfig honours SHIFTSWAP_ROSTER_PATH and NODE_ENV", () => {
    expect(loadConfig({ SHIFTSWAP_ROSTER_PATH: "/x.json", NODE_ENV: "production" })).toEqual({
      rosterPath: "/x.json",
      nodeEnv: "production",
    });
  });

  test("loadConfig falls back to the default roster path", () => {
    expect(loadConfig({})).toEqual({ rosterPath: defaultRosterPath, nodeEnv: undefined });
  });
});

describe("parseRoster", () => {
  test("rejects a shift missing its unit, naming the field but no employee number or name", () => {
    const malformed = {
      site: { name: "Port Alder Refinery", timeZone: "America/Chicago" },
      exportedAt: "2027-03-07T08:00:00Z",
      operators: [{ employeeNumber: "555001", name: "Zelda Testperson", qualifications: [] }],
      supervisors: [],
      shifts: [
        {
          shiftId: "X-1",
          role: "board-operator",
          start: "2027-03-08T06:00",
          end: "2027-03-08T18:00",
          employeeNumber: "555001",
        },
      ],
    };

    const message = messageOf(() => parseRoster(malformed));

    expect(message).toContain("shifts[0].unit");
    expect(message).not.toContain("555001");
    expect(message).not.toContain("Zelda");
    expect(message).not.toContain("Testperson");
  });

  test("rejects a non-string employee number without echoing the value", () => {
    const malformed = {
      site: { name: "Port Alder Refinery", timeZone: "America/Chicago" },
      exportedAt: "2027-03-07T08:00:00Z",
      operators: [{ employeeNumber: 555001, name: "Zelda Testperson", qualifications: [] }],
      supervisors: [],
      shifts: [],
    };

    const message = messageOf(() => parseRoster(malformed));

    expect(message).toContain("operators[0].employeeNumber");
    expect(message).not.toContain("555001");
    expect(message).not.toContain("Zelda");
  });
});
