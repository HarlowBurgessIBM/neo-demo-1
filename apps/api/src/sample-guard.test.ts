import { assessDeterminability, checkQualifications, type QualificationFinding } from "@shiftswap/rules";
import { describe, expect, test } from "vitest";
import {
  fixedNow,
  readSampleRoster,
  readSampleRosterRaw,
  SAMPLE_NOW_ISO,
  STEP_1,
  STEP_3,
  STEP_4,
  STEP_5,
  STEP_6,
  type SwapPick,
} from "./test-support";

// The sample must not fail § 3.3 on its own: any finding a swap check reports is then the
// swap's doing, or a shift the test added.

describe("criterion 16: the sample guard", () => {
  test("for every roster operator's unswapped schedule in data/roster.sample.json, § 3.3 evaluation over all shifts within coverage (74 shifts) yields zero findings", () => {
    const raw = readSampleRosterRaw();
    const operators = readSampleRoster().operators;
    expect(operators).toHaveLength(8);

    let shiftsChecked = 0;
    const findings: QualificationFinding[] = [];
    for (const operator of operators) {
      const result = checkQualifications(raw, operator.employeeNumber);
      if ("kind" in result) {
        throw new Error("an operator in the sample could not be evaluated");
      }
      // Every operator owns at least one shift, so each one is really covered.
      expect(result.shiftsChecked).toBeGreaterThan(0);
      shiftsChecked += result.shiftsChecked;
      findings.push(...result.findings);
    }

    expect(shiftsChecked).toBe(74);
    expect(findings).toEqual([]);
  });

  test.each<[string, SwapPick]>([
    ["Step 1", STEP_1],
    ["Step 3", STEP_3],
    ["Step 4", STEP_4],
    ["Step 5", STEP_5],
    ["Step 6", STEP_6],
  ])("%s: the sample pick has no invalid-export-field reason, so the gate passes it", (_label, pick) => {
    const result = assessDeterminability(readSampleRosterRaw(), {
      now: fixedNow(SAMPLE_NOW_ISO)(),
      giveShiftId: pick.give,
      takeShiftId: pick.take,
    });
    const codes = result.determinable ? [] : result.reasons.map((reason) => reason.code);
    expect(codes).not.toContain("invalid-export-field");
    expect(result.determinable).toBe(true);
  });

  test("no Step 1, 3, 4, 5 or 6 pick yields a shifts.end reason on the sample", () => {
    for (const pick of [STEP_1, STEP_3, STEP_4, STEP_5, STEP_6]) {
      const result = assessDeterminability(readSampleRosterRaw(), {
        now: fixedNow(SAMPLE_NOW_ISO)(),
        giveShiftId: pick.give,
        takeShiftId: pick.take,
      });
      const fields = result.determinable
        ? []
        : result.reasons.flatMap((reason) => ("field" in reason ? [reason.field] : []));
      expect(fields).not.toContain("shifts.end");
    }
  });
});
