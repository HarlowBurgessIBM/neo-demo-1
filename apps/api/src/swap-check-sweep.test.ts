import { isDeepStrictEqual } from "node:util";
import { evaluateSwap, type EmployeeEvaluation } from "@shiftswap/rules";
import { beforeAll, describe, expect, test } from "vitest";
import { buildApp } from "./app";
import {
  fixedNow,
  headersFor,
  readSampleRoster,
  readSampleRosterRaw,
  SAMPLE_NOW_ISO,
  sampleSweepPicks,
  type SwapPick,
} from "./test-support";

// Issue #8, criteria 7 and 8, over every ordered cross-owner pick in the sample roster:
//  - criterion 8: each pick answers with exactly one of a 422 refusal or one of the four outcomes;
//  - criterion 7: the outcome and the findings are the same whichever employee initiates.
// Failures are collected, then asserted empty, so one bad pick does not hide the others. Messages
// name shift ids only, never an employee number or a name (NFR-PRIV-001).

const OUTCOMES = ["cannot-determine", "cannot-be-approved", "review-required", "approved-without-review"];
const EVALUATED_OUTCOMES = ["cannot-be-approved", "review-required", "approved-without-review"];
const REFUSED = "refused";
const SWEEP_TIMEOUT_MS = 120_000;

/** The parts of a response body the sweep reads. */
interface SweepBody {
  kind?: string;
  outcome?: string;
  reasons?: { code: string }[];
  employees?: EmployeeEvaluation[];
}

/** What is kept of one pick's response. `label` is the refusal `kind` on a 422, else the `outcome`. */
interface PickResult {
  status: number;
  label: string | undefined;
  reasonCodes: string[];
  employees: EmployeeEvaluation[];
}

const shiftOwners = new Map(readSampleRoster().shifts.map((shift) => [shift.shiftId, shift.employeeNumber]));
const picks = sampleSweepPicks();

function pickKey(give: string, take: string): string {
  return `${give}|${take}`;
}

function describePick(pick: { give: string; take: string }): string {
  return `pick ${pick.give}→${pick.take}`;
}

/**
 * One entry per unordered pair of shifts, taken from `picks` in order. The reverse of every
 * pick is itself in the sweep, so the second of each pair is skipped.
 */
function unorderedPicks(all: readonly SwapPick[]): SwapPick[] {
  const seen = new Set<string>();
  const firsts: SwapPick[] = [];
  for (const pick of all) {
    if (!seen.has(pickKey(pick.take, pick.give))) {
      seen.add(pickKey(pick.give, pick.take));
      firsts.push(pick);
    }
  }
  return firsts;
}

/** The employees keyed by the roster owner of the shift they gave, the stable identity across directions. */
function byOwner(employees: readonly EmployeeEvaluation[], label: string, failures: string[]): Map<string, EmployeeEvaluation> {
  const keyed = new Map<string, EmployeeEvaluation>();
  for (const employee of employees) {
    const owner = shiftOwners.get(employee.gaveShiftId);
    if (owner === undefined) {
      failures.push(`${label}: an employee gave a shift that is not in the roster`);
    } else {
      keyed.set(owner, employee);
    }
  }
  return keyed;
}

function withoutParty(employee: EmployeeEvaluation): Record<string, unknown> {
  return Object.fromEntries(Object.entries(employee).filter(([field]) => field !== "party"));
}

/** Compares the two directions' employees per stable identity, using `same` on each matched pair. */
function compareEmployees(
  label: string,
  forward: readonly EmployeeEvaluation[],
  reverse: readonly EmployeeEvaluation[],
  same: (a: EmployeeEvaluation, b: EmployeeEvaluation) => boolean,
  failures: string[],
): void {
  const forwardByOwner = byOwner(forward, label, failures);
  const reverseByOwner = byOwner(reverse, label, failures);
  if (forwardByOwner.size !== 2 || reverseByOwner.size !== 2) {
    failures.push(`${label}: expected two employees in each direction`);
    return;
  }
  for (const [owner, employee] of forwardByOwner) {
    const other = reverseByOwner.get(owner);
    if (other === undefined) {
      failures.push(`${label}: the two directions evaluate different employees`);
    } else if (!same(employee, other)) {
      failures.push(`${label}: an employee's evaluation differs between directions`);
    }
  }
}

function tallyOf(results: Iterable<PickResult>): Map<string, number> {
  const tally = new Map<string, number>();
  for (const { status, label } of results) {
    const key = `${status} ${label ?? "no-label"}`;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return tally;
}

describe("swap check sweep over the sample roster", () => {
  const results = new Map<string, PickResult>();

  // One app and one pass: both criteria read these responses. The roster is passed as parsed JSON,
  // which is equivalent to the file and avoids re-reading it on every request.
  beforeAll(async () => {
    const app = buildApp({ roster: readSampleRosterRaw(), now: fixedNow(SAMPLE_NOW_ISO) });
    await app.ready();
    try {
      for (const pick of picks) {
        const response = await app.inject({
          method: "POST",
          url: "/api/swap-checks",
          headers: headersFor(pick.caller),
          payload: { giveShiftId: pick.give, takeShiftId: pick.take },
        });
        const body = response.json<SweepBody>();
        results.set(pickKey(pick.give, pick.take), {
          status: response.statusCode,
          label: response.statusCode === 422 ? body.kind : body.outcome,
          reasonCodes: (body.reasons ?? []).map((reason) => reason.code),
          employees: body.employees ?? [],
        });
      }
    } finally {
      await app.close();
    }
  }, SWEEP_TIMEOUT_MS);

  test("the sweep covers every ordered cross-owner pick of the sample", () => {
    expect(shiftOwners.size).toBe(readSampleRoster().shifts.length);
    const shifts = readSampleRoster().shifts;
    let expected = 0;
    for (const give of shifts) {
      expected += shifts.filter((take) => take.employeeNumber !== give.employeeNumber).length;
    }
    expect(picks).toHaveLength(expected);
    expect(picks.length).toBeGreaterThan(4_000);
    expect(results.size).toBe(picks.length);
  });

  test(
    "every pick returns a 422 refusal or one of the four outcomes, never a 501 or 5xx",
    () => {
      const failures: string[] = [];
      for (const pick of picks) {
        const label = describePick(pick);
        const result = results.get(pickKey(pick.give, pick.take));
        if (result === undefined) {
          failures.push(`${label}: no response`);
        } else if (result.status === 422) {
          if (result.label !== REFUSED) {
            failures.push(`${label}: 422 without kind refused`);
          }
          if (result.reasonCodes.length === 0 || result.reasonCodes.some((code) => code !== "outside-pilot-units")) {
            failures.push(`${label}: 422 for a reason other than outside-pilot-units`);
          }
        } else if (result.status === 200) {
          if (result.label === undefined || !OUTCOMES.includes(result.label)) {
            failures.push(`${label}: 200 with an outcome that is not one of the four`);
          } else if (result.label === "cannot-determine" && result.reasonCodes.includes("not-evaluable")) {
            failures.push(`${label}: cannot-determine for not-evaluable`);
          }
        } else {
          failures.push(`${label}: status ${result.status}`);
        }
      }
      expect(failures).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );

  test(
    "the sweep is not vacuous: a refusal and each of the four outcomes occur",
    () => {
      const tally = tallyOf(results.values());
      for (const key of [`422 ${REFUSED}`, ...OUTCOMES.map((outcome) => `200 ${outcome}`)]) {
        expect(tally.get(key) ?? 0, key).toBeGreaterThan(0);
      }
    },
    SWEEP_TIMEOUT_MS,
  );

  test(
    "rules: the outcome, findings and triggers are the same whichever employee initiates",
    () => {
      const raw = readSampleRosterRaw();
      const pairs = unorderedPicks(picks);
      const failures: string[] = [];
      const evaluatedOutcomes = new Set<string>();

      for (const pick of pairs) {
        const label = describePick(pick);
        const forward = evaluateSwap(raw, { giveShiftId: pick.give, takeShiftId: pick.take });
        const reverse = evaluateSwap(raw, { giveShiftId: pick.take, takeShiftId: pick.give });
        if (forward.kind !== reverse.kind) {
          failures.push(`${label}: evaluable in one direction only`);
        } else if (forward.kind === "evaluated" && reverse.kind === "evaluated") {
          evaluatedOutcomes.add(forward.outcome);
          if (forward.outcome !== reverse.outcome) {
            failures.push(`${label}: outcome differs between directions`);
          }
          compareEmployees(
            label,
            forward.employees,
            reverse.employees,
            (a, b) => isDeepStrictEqual(a.findings, b.findings) && isDeepStrictEqual(a.triggers, b.triggers),
            failures,
          );
          compareEmployees(
            label,
            forward.employees,
            reverse.employees,
            (a, b) => isDeepStrictEqual(withoutParty(a), withoutParty(b)),
            failures,
          );
        }
      }

      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs.length * 2).toBe(picks.length);
      for (const outcome of EVALUATED_OUTCOMES) {
        expect(evaluatedOutcomes.has(outcome), outcome).toBe(true);
      }
      expect(failures).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );

  test(
    "api: the status, the outcome and the findings are the same whichever employee initiates",
    () => {
      const pairs = unorderedPicks(picks);
      const failures: string[] = [];
      const evaluatedOutcomes = new Set<string>();

      for (const pick of pairs) {
        const label = describePick(pick);
        const forward = results.get(pickKey(pick.give, pick.take));
        const reverse = results.get(pickKey(pick.take, pick.give));
        if (forward === undefined || reverse === undefined) {
          failures.push(`${label}: no response in one direction`);
        } else if (forward.status !== reverse.status || forward.label !== reverse.label) {
          failures.push(`${label}: status or outcome differs between directions`);
        } else if (
          forward.status === 200 &&
          forward.label !== undefined &&
          EVALUATED_OUTCOMES.includes(forward.label)
        ) {
          evaluatedOutcomes.add(forward.label);
          compareEmployees(
            label,
            forward.employees,
            reverse.employees,
            (a, b) => isDeepStrictEqual(a.findings, b.findings) && isDeepStrictEqual(a.triggers, b.triggers),
            failures,
          );
        }
      }

      expect(pairs.length).toBeGreaterThan(0);
      expect(pairs.length * 2).toBe(picks.length);
      for (const outcome of EVALUATED_OUTCOMES) {
        expect(evaluatedOutcomes.has(outcome), outcome).toBe(true);
      }
      expect(failures).toEqual([]);
    },
    SWEEP_TIMEOUT_MS,
  );
});
