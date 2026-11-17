import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { defaultRosterPath, loadConfig } from "./config";
import { SAMPLE_ROSTER_PATH } from "./test-support";

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
