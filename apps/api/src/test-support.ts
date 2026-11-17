import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRoster, type Roster } from "./roster";

// Helpers shared by API tests. Not a test file.

/** Absolute path to the repo root, independent of the working directory. */
export const repoRoot: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const SAMPLE_ROSTER_PATH: string = path.join(repoRoot, "data", "roster.sample.json");

/** The sample roster, parsed straight from the file. */
export function readSampleRoster(): Roster {
  const parsed: unknown = JSON.parse(readFileSync(SAMPLE_ROSTER_PATH, "utf8"));
  return parseRoster(parsed);
}

/** A shared response fixture: `<repoRoot>/fixtures/responses/<name>`. */
export function readFixture(name: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(path.join(repoRoot, "fixtures", "responses", name), "utf8"));
  return parsed;
}

/** The two identity headers the site access gateway sets. */
export function headersFor(employeeNumber: string, roles = "operator"): Record<string, string> {
  return { "x-employee-number": employeeNumber, "x-roles": roles };
}
