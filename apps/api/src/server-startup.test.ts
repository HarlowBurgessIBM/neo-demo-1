import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

// BE-approved exception to "API tests use app.inject()": the startup failure is in server.ts
// itself, so it can only be proved by running the entry point as a child process.
const API_DIR = fileURLToPath(new URL("..", import.meta.url));
const SPAWN_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 40_000;

describe("server startup with a malformed SHIFTSWAP_NOW", () => {
  test.each([["yesterday"], ["2027-03-07T14:00:00"]])(
    "exits non-zero before listening and names SHIFTSWAP_NOW: %s",
    (value) => {
      const result = spawnSync(process.execPath, ["--import", "tsx", "src/server.ts"], {
        cwd: API_DIR,
        env: { ...process.env, SHIFTSWAP_NOW: value, PORT: "0" },
        encoding: "utf8",
        timeout: SPAWN_TIMEOUT_MS,
      });

      // Not killed by the timeout, and the process did not fail to spawn.
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status).not.toBeNull();
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("SHIFTSWAP_NOW");
      // The server exited before listen: no Fastify "Server listening" line on either stream.
      expect(result.stdout).not.toMatch(/server listening/i);
      expect(result.stderr).not.toMatch(/server listening/i);
    },
    TEST_TIMEOUT_MS,
  );
});
