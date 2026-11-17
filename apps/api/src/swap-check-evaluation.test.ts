import type { EmployeeEvaluation, Finding, OffDutyFinding } from "@shiftswap/rules";
import type { LightMyRequestResponse } from "fastify";
import { describe, expect, test } from "vitest";
import { buildApp } from "./app";
import { GUIDANCE, type CannotBeApprovedBody } from "./swap-result";
import {
  failListingRoster,
  fixedNow,
  headersFor,
  readFixture,
  readSampleRoster,
  SAMPLE_NOW_ISO,
  STEP_1,
  STEP_2,
  STEP_3,
  STEP_4,
  STEP_6,
  unchangedRestRoster,
  unchangedShiftQualificationRoster,
  type Roster,
  type RosterOperator,
  type SwapPick,
} from "./test-support";

// POST /api/swap-checks evaluates § 3.1 and § 3.3 on the resulting schedules (issue #6). Fixtures
// are the shared response fixtures in fixtures/responses, the same files the web tests read.
//
// BE ruling 7: a response body carries no employee number. A person named in a criterion is
// proved by resolving the party against the roster: the owner of the party's shift is the
// operator with that number, and the operator's name is the body's name.

const MAYA = "104417";
const LUIS = "102286";
const PRIYA = "107903";
const DWAYNE = "101152";
const AISHA = "106640";

/** 28 hours after the sample export, so the export is stale. */
const STALE_NOW = "2027-03-08T12:00:00Z";

/** Posts one swap check to an app built on `roster` with the clock fixed at `now`. */
async function swapCheck(
  pick: SwapPick,
  roster: unknown = readSampleRoster(),
  now: string = SAMPLE_NOW_ISO,
): Promise<LightMyRequestResponse> {
  const app = buildApp({ roster, now: fixedNow(now) });
  await app.ready();
  try {
    return await app.inject({
      method: "POST",
      url: "/api/swap-checks",
      headers: headersFor(pick.caller),
      payload: { giveShiftId: pick.give, takeShiftId: pick.take },
    });
  } finally {
    await app.close();
  }
}

/** Asserts a 200 cannot-be-approved response and returns its typed body. */
function cannotBeApproved(response: LightMyRequestResponse): CannotBeApprovedBody {
  expect(response.statusCode).toBe(200);
  const body = response.json<CannotBeApprovedBody>();
  expect(body.outcome).toBe("cannot-be-approved");
  return body;
}

/** Asserts a 501 not-evaluated response with no outcome. */
function expectNotEvaluated(response: LightMyRequestResponse): void {
  expect(response.statusCode).toBe(501);
  expect(response.json()).toEqual({ kind: "not-evaluated" });
  expect(response.body).not.toContain("outcome");
}

function employeeOf(body: CannotBeApprovedBody, party: EmployeeEvaluation["party"]): EmployeeEvaluation {
  const employee = body.employees.find((candidate) => candidate.party === party);
  if (employee === undefined) {
    throw new Error(`no ${party} in the body`);
  }
  return employee;
}

function offDutyFindings(employee: EmployeeEvaluation): OffDutyFinding[] {
  return employee.findings.filter((finding): finding is OffDutyFinding => finding.rule === "3.1");
}

function allFindings(body: CannotBeApprovedBody): Finding[] {
  return body.employees.flatMap((employee) => employee.findings);
}

function operatorOf(roster: Roster, employeeNumber: string): RosterOperator {
  const operator = roster.operators.find((candidate) => candidate.employeeNumber === employeeNumber);
  if (operator === undefined) {
    throw new Error(`sample roster has no operator ${employeeNumber}`);
  }
  return operator;
}

/** The operator who owns `shiftId` in the roster as posted. */
function ownerOfShift(roster: Roster, shiftId: string): RosterOperator {
  const shift = roster.shifts.find((candidate) => candidate.shiftId === shiftId);
  if (shift === undefined) {
    throw new Error(`roster has no shift ${shiftId}`);
  }
  return operatorOf(roster, shift.employeeNumber);
}

/**
 * Proves who `employee` is without a number in the body: the owner of the shift they gave is
 * the expected operator, and that operator's name equals the body's name.
 */
function expectResolvesTo(
  roster: Roster,
  employee: EmployeeEvaluation,
  expected: { employeeNumber: string; name: string },
): void {
  const owner = ownerOfShift(roster, employee.gaveShiftId);
  expect(owner.employeeNumber).toBe(expected.employeeNumber);
  expect(owner.name).toBe(expected.name);
  expect(employee.name).toBe(owner.name);
}

/** The operators and supervisors of the roster, for the body privacy checks. */
function employeeNumbersOf(roster: Roster): string[] {
  return [...roster.operators, ...roster.supervisors].map((person) => person.employeeNumber);
}

describe("criterion 17: the Step 3, 4 and 6 bodies equal the shared fixtures", () => {
  const fixtures: [string, SwapPick][] = [
    ["step-3.json", STEP_3],
    ["step-4.json", STEP_4],
    ["step-6.json", STEP_6],
  ];

  test.each(fixtures)("%s is the 200 body for its pick", async (fixture, pick) => {
    const response = await swapCheck(pick);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(readFixture(fixture));
  });

  test("the keys are in wire order: outcome, export stamp, guidance, employees", async () => {
    const response = await swapCheck(STEP_3);
    expect(Object.keys(response.json<CannotBeApprovedBody>())).toEqual([
      "outcome",
      "exportedAt",
      "exportedAtUtcMinute",
      "exportedAtSiteLocal",
      "siteTimeZone",
      "guidance",
      "employees",
    ]);
  });

  test("the employees are the give shift owner, then the take shift owner", async () => {
    const body = cannotBeApproved(await swapCheck(STEP_3));
    expect(body.employees.map((employee) => employee.party)).toEqual(["give-shift-owner", "take-shift-owner"]);
  });
});

describe("criteria 5, 6 and 7: the verification steps", () => {
  test("criterion 5: Step 3, Luis Fontenot (102286) has the one § 3.1 finding of 0 h; Maya has none", async () => {
    const roster = readSampleRoster();
    const body = cannotBeApproved(await swapCheck(STEP_3, roster));

    expect(allFindings(body)).toHaveLength(1);

    const luis = employeeOf(body, "take-shift-owner");
    expectResolvesTo(roster, luis, { employeeNumber: LUIS, name: "Luis Fontenot" });
    expect(luis.findings).toHaveLength(1);
    expect(luis.findings[0]).toMatchObject({
      rule: "3.1",
      code: "off-duty-under-minimum",
      changedBySwap: true,
      hours: 0,
      minutes: 0,
    });

    const maya = employeeOf(body, "give-shift-owner");
    expect(maya.name).toBe(operatorOf(roster, MAYA).name);
    expect(ownerOfShift(roster, STEP_3.give).employeeNumber).toBe(MAYA);
    expect(maya.findings).toEqual([]);
    expect(maya.offDutyBefore).toMatchObject({ hours: 60, minutes: 0 });
    expect(maya.offDutyAfter).toMatchObject({ hours: 12, minutes: 0 });
  });

  test("criterion 6: Step 4 across the clock change, Maya has the one § 3.1 finding of 10 h, not 11", async () => {
    const roster = readSampleRoster();
    const body = cannotBeApproved(await swapCheck(STEP_4, roster));

    expect(allFindings(body)).toHaveLength(1);

    const maya = employeeOf(body, "give-shift-owner");
    expectResolvesTo(roster, maya, { employeeNumber: MAYA, name: operatorOf(roster, MAYA).name });
    expect(maya.findings).toHaveLength(1);
    expect(maya.findings[0]).toMatchObject({ rule: "3.1", hours: 10, minutes: 0, changedBySwap: true });
    expect(maya.offDutyBefore).toMatchObject({ hours: 10, minutes: 0 });
    expect(maya.offDutyBefore?.hours).not.toBe(11);
    expect(offDutyFindings(maya).map((finding) => finding.hours)).not.toContain(11);
    expect(maya.offDutyAfter).toMatchObject({ hours: 49, minutes: 0 });

    const dwayne = employeeOf(body, "take-shift-owner");
    expectResolvesTo(roster, dwayne, { employeeNumber: DWAYNE, name: "Dwayne Hebert" });
    expect(dwayne.findings).toEqual([]);
    expect(dwayne.offDutyBefore).toMatchObject({ hours: 169, minutes: 0 });
    expect(dwayne.offDutyAfter).toMatchObject({ hours: 47, minutes: 0 });
  });

  test("criterion 7: Step 6, Priya Raman has the one § 3.3 finding; Dwayne has none", async () => {
    const roster = readSampleRoster();
    const body = cannotBeApproved(await swapCheck(STEP_6, roster));

    // Exactly one finding across both employees' resulting schedules.
    expect(allFindings(body)).toHaveLength(1);

    const priya = employeeOf(body, "give-shift-owner");
    expectResolvesTo(roster, priya, { employeeNumber: PRIYA, name: "Priya Raman" });
    expect(priya.findings).toEqual([
      {
        rule: "3.3",
        code: "qualification-expired",
        changedBySwap: true,
        shiftId: "HCU-CON1-0317-D",
        unit: "HCU",
        role: "CONSOLE",
        shiftStartDate: "2027-03-17",
        validThrough: "2027-03-15",
      },
    ]);
    expect(offDutyFindings(priya)).toEqual([]);
    expect(priya.offDutyBefore).toMatchObject({ hours: 12, minutes: 0 });
    expect(priya.offDutyAfter).toMatchObject({ hours: 12, minutes: 0 });

    const dwayne = employeeOf(body, "take-shift-owner");
    expectResolvesTo(roster, dwayne, { employeeNumber: DWAYNE, name: "Dwayne Hebert" });
    expect(dwayne.findings).toEqual([]);
    expect(dwayne.offDutyBefore).toMatchObject({ hours: 120, minutes: 0 });
    expect(dwayne.offDutyAfter).toMatchObject({ hours: 96, minutes: 0 });
  });
});

describe("criteria 8 and 9: findings listed per employee and rule, changed or not by the swap", () => {
  test("criterion 8: with a § 3.1 and a § 3.3 failure, both are listed, each naming its employee and rule", async () => {
    const roster = failListingRoster();
    const body = cannotBeApproved(await swapCheck(STEP_6, roster));

    expect(allFindings(body)).toHaveLength(2);

    const dwayne = employeeOf(body, "take-shift-owner");
    expectResolvesTo(roster, dwayne, { employeeNumber: DWAYNE, name: "Dwayne Hebert" });
    expect(dwayne.findings).toHaveLength(1);
    expect(dwayne.findings[0]).toMatchObject({
      rule: "3.1",
      code: "off-duty-under-minimum",
      fromShiftId: "HCU-CON1-0307-D",
      toShiftId: "HCU-CON1-0308-D",
      hours: 9,
      minutes: 0,
      changedBySwap: true,
    });

    const priya = employeeOf(body, "give-shift-owner");
    expectResolvesTo(roster, priya, { employeeNumber: PRIYA, name: "Priya Raman" });
    expect(priya.findings).toHaveLength(1);
    expect(priya.findings[0]).toMatchObject({ rule: "3.3", shiftId: "HCU-CON1-0317-D" });
  });

  test("criterion 9: a rest under 11 h the swap did not change is a § 3.1 finding with changedBySwap false", async () => {
    const roster = unchangedRestRoster();
    const body = cannotBeApproved(await swapCheck(STEP_1, roster));

    const luis = employeeOf(body, "take-shift-owner");
    expectResolvesTo(roster, luis, { employeeNumber: LUIS, name: "Luis Fontenot" });
    expect(allFindings(body)).toHaveLength(1);
    expect(luis.findings).toEqual([
      {
        rule: "3.1",
        code: "off-duty-under-minimum",
        changedBySwap: false,
        minimumHours: 11,
        fromShiftId: "CDU-CON1-0325-D",
        toShiftId: "CDU-CON1-0326-D",
        from: "2027-03-25T20:00",
        to: "2027-03-26T06:00",
        hours: 10,
        minutes: 0,
      },
    ]);
    expect(employeeOf(body, "give-shift-owner").findings).toEqual([]);
  });
});

describe("criterion 10, API half: the guidance names the exception procedure", () => {
  test("the guidance contains VE-HSSE-PRC-021 and equals the fixed GUIDANCE text", async () => {
    const body = cannotBeApproved(await swapCheck(STEP_3));
    expect(body.guidance).toContain("VE-HSSE-PRC-021");
    expect(body.guidance).toBe(GUIDANCE);
    expect(body.guidance).toBe(
      "This swap does not meet VE-HSSE-STD-014 § 3 and cannot be approved (§ 4.4). Exceptions to § 3 are granted only through the fatigue exception procedure, VE-HSSE-PRC-021, which is separate from the swap process.",
    );
  });
});

describe("criterion 11: a pick with no § 3.1 or § 3.3 failure is still not evaluated", () => {
  test("the Step 1 request returns 501 not-evaluated with no outcome", async () => {
    expectNotEvaluated(await swapCheck(STEP_1));
  });
});

describe("criterion 15: a failure on a shift the swap did not touch", () => {
  test("a § 3.3 failure on an added Priya shift is cannot-be-approved with changedBySwap false, equal to the fixture", async () => {
    const roster = unchangedShiftQualificationRoster();
    const response = await swapCheck(STEP_2, roster);
    const body = cannotBeApproved(response);

    expect(allFindings(body)).toHaveLength(1);
    const priya = employeeOf(body, "take-shift-owner");
    expectResolvesTo(roster, priya, { employeeNumber: PRIYA, name: "Priya Raman" });
    expect(priya.findings).toEqual([
      {
        rule: "3.3",
        code: "qualification-expired",
        changedBySwap: false,
        shiftId: "HCU-CON1-0323-D",
        unit: "HCU",
        role: "CONSOLE",
        shiftStartDate: "2027-03-23",
        validThrough: "2027-03-15",
      },
    ]);
    expect(employeeOf(body, "give-shift-owner").findings).toEqual([]);
    expect(response.json()).toEqual(readFixture("unchanged-shift-qualification.json"));
  });

  test("the same shift outside coverage (2027-03-29) gives 501 not-evaluated with no finding", async () => {
    expectNotEvaluated(await swapCheck(STEP_2, unchangedShiftQualificationRoster({ outsideCoverage: true })));
  });
});

describe("precedence: refusals, then cannot-determine, then the evaluation", () => {
  test("a stale clock on the Step 4 pick gives cannot-determine with export-stale, not cannot-be-approved", async () => {
    const response = await swapCheck(STEP_4, readSampleRoster(), STALE_NOW);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ outcome: string; reasons: { code: string }[] }>();
    expect(body.outcome).toBe("cannot-determine");
    expect(body.reasons.map((reason) => reason.code)).toContain("export-stale");
    expect(response.body).not.toContain("employees");
    expect(response.body).not.toContain("guidance");
  });

  test("emptying Priya's qualifications on the Step 6 pick gives cannot-determine", async () => {
    const roster = readSampleRoster();
    operatorOf(roster, PRIYA).qualifications = [];
    const response = await swapCheck(STEP_6, roster);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ outcome: string; reasons: unknown[] }>();
    expect(body.outcome).toBe("cannot-determine");
    expect(body.reasons).toEqual([
      { code: "qualifications-missing", shiftId: "HCU-CON1-0308-D", party: "give-shift-owner", problem: "empty" },
    ]);
  });

  test("a take shift outside the pilot units is refused 422, though the pick would fail § 3.1", async () => {
    const roster = readSampleRoster();
    const take = roster.shifts.find((shift) => shift.shiftId === STEP_3.take);
    if (take === undefined) {
      throw new Error("sample roster has no take shift");
    }
    take.unit = "FCC";
    const response = await swapCheck(STEP_3, roster);
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      kind: "refused",
      reasons: [{ code: "outside-pilot-units", shiftId: "CDU-CON1-0312-D", unit: "FCC" }],
    });
  });
});

describe("W8: a malformed qualification entry on the evaluated pick", () => {
  test("a numeric unit on one of Priya's qualification entries gives cannot-determine invalid-export-field", async () => {
    const sample = readSampleRoster();
    const roster = {
      ...sample,
      operators: sample.operators.map((operator) =>
        operator.employeeNumber === PRIYA
          ? {
              ...operator,
              qualifications: operator.qualifications.map((qualification, index) =>
                index === 0 ? { ...qualification, unit: 42 } : qualification,
              ),
            }
          : operator,
      ),
    };
    const response = await swapCheck(STEP_6, roster);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ outcome: string; reasons: unknown[] }>();
    expect(body.outcome).toBe("cannot-determine");
    expect(body.reasons).toEqual([
      {
        code: "invalid-export-field",
        field: "operators.qualifications.unit",
        party: "give-shift-owner",
        index: 0,
        problem: "malformed",
      },
    ]);
  });
});

describe("body privacy (NFR-PRIV-001): no employee number in any 200 body", () => {
  const cases: [string, SwapPick, () => Roster][] = [
    ["Step 3", STEP_3, readSampleRoster],
    ["Step 4", STEP_4, readSampleRoster],
    ["Step 6", STEP_6, readSampleRoster],
    ["the § 3.1 and § 3.3 listing roster", STEP_6, failListingRoster],
    ["the unchanged rest roster", STEP_1, unchangedRestRoster],
    ["the unchanged-shift qualification roster", STEP_2, unchangedShiftQualificationRoster],
  ];

  test.each(cases)("%s: the body names no operator or supervisor number", async (_label, pick, build) => {
    const roster = build();
    const response = await swapCheck(pick, roster);
    expect(response.statusCode).toBe(200);
    const numbers = employeeNumbersOf(roster);
    expect(numbers).toContain(MAYA);
    expect(numbers).toContain(AISHA);
    for (const employeeNumber of numbers) {
      expect(response.body).not.toContain(employeeNumber);
    }
  });
});
