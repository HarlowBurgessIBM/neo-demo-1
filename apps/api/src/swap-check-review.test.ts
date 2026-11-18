import {
  elapsedMinutes,
  evaluateSwap,
  type EmployeeEvaluation,
  type SevenDayWindow,
} from "@shiftswap/rules";
import type { LightMyRequestResponse } from "fastify";
import { describe, expect, test } from "vitest";
import { buildApp } from "./app";
import {
  ADD_3,
  ADD_6,
  fixedNow,
  headersFor,
  operatorName,
  readFixture,
  readSampleRoster,
  SAMPLE_NOW_ISO,
  STEP_1,
  STEP_2,
  type SwapPick,
} from "./test-support";

// Issue #8, criteria 2 to 5 and 13: the § 4.2 classification of the verification steps.
// Every figure is asserted here from the roster and the issue, independently of the fixtures, so
// a wrong fixture cannot pass. Each step is also deep-equal to its shared fixture (criterion 13).
//
// BE ruling 7: a body carries no employee number. A person is named by the roster's name for the
// operator, read through `operatorName`.

const MAYA = "104417";
const LUIS = "102286";
const AISHA = "106640";
const PRIYA = "107903";
const TOM = "103078";
const JEROME = "108529";

const KNOWN_BODY_KEYS = [
  "outcome",
  "exportedAt",
  "exportedAtUtcMinute",
  "exportedAtSiteLocal",
  "siteTimeZone",
  "guidance",
  "employees",
];

const KNOWN_EMPLOYEE_KEYS = [
  "party",
  "name",
  "gaveShiftId",
  "tookShiftId",
  "offDutyBefore",
  "offDutyAfter",
  "windows",
  "findings",
  "triggers",
];

interface ReviewBody {
  outcome: string;
  employees: EmployeeEvaluation[];
}

/** Posts one swap check to an app on the sample roster with the clock fixed at `SAMPLE_NOW_ISO`. */
async function swapCheck(pick: SwapPick): Promise<LightMyRequestResponse> {
  const app = buildApp({ roster: readSampleRoster(), now: fixedNow(SAMPLE_NOW_ISO) });
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

/** Asserts a 200 response and returns its typed body. */
function okBody(response: LightMyRequestResponse): ReviewBody {
  expect(response.statusCode).toBe(200);
  return response.json<ReviewBody>();
}

/** The evaluation whose name is the roster's name for `employeeNumber`. */
function employeeNamed(body: ReviewBody, employeeNumber: string): EmployeeEvaluation {
  const name = operatorName(employeeNumber);
  const employee = body.employees.find((candidate) => candidate.name === name);
  if (employee === undefined) {
    throw new Error("no employee with that name in the body");
  }
  return employee;
}

function totalMinutes(period: { hours: number; minutes: number }): number {
  return period.hours * 60 + period.minutes;
}

/** The longest window that contains the date of a swapped shift (`changedBySwap`). */
function worstChangedWindow(employee: EmployeeEvaluation): SevenDayWindow {
  const changed = employee.windows.filter((window) => window.changedBySwap);
  const [first, ...rest] = changed;
  if (first === undefined) {
    throw new Error("no window contains a swapped shift");
  }
  return rest.reduce((worst, window) => (totalMinutes(window) > totalMinutes(worst) ? window : worst), first);
}

function allTriggers(body: ReviewBody): EmployeeEvaluation["triggers"] {
  return body.employees.flatMap((employee) => employee.triggers);
}

function allFindings(body: ReviewBody): EmployeeEvaluation["findings"] {
  return body.employees.flatMap((employee) => employee.findings);
}

function expectNoEmployeeNumbers(response: LightMyRequestResponse): void {
  for (const number of [MAYA, LUIS, AISHA, PRIYA, TOM, JEROME]) {
    expect(response.body).not.toContain(number);
  }
}

describe("criterion 2: Step 1, approved without review", () => {
  test("Step 1 gives 200 approved-without-review with no finding or trigger for either employee", async () => {
    const body = okBody(await swapCheck(STEP_1));
    expect(body.outcome).toBe("approved-without-review");
    expect(body.employees).toHaveLength(2);
    for (const employee of body.employees) {
      expect(employee.findings).toEqual([]);
      expect(employee.triggers).toEqual([]);
    }
  });

  test("Step 1 names Maya (gave) and Luis (took) from the roster", async () => {
    const body = okBody(await swapCheck(STEP_1));
    expect(body.employees.map((employee) => [employee.party, employee.name])).toEqual([
      ["give-shift-owner", operatorName(MAYA)],
      ["take-shift-owner", operatorName(LUIS)],
    ]);
  });

  test("Maya is off duty 36 h before and 156 h after", async () => {
    const maya = employeeNamed(okBody(await swapCheck(STEP_1)), MAYA);
    expect(maya.offDutyBefore).toMatchObject({ hours: 36, minutes: 0 });
    expect(maya.offDutyAfter).toMatchObject({ hours: 156, minutes: 0 });
  });

  test("Luis is off duty 48 h before and 36 h after", async () => {
    const luis = employeeNamed(okBody(await swapCheck(STEP_1)), LUIS);
    expect(luis.offDutyBefore).toMatchObject({ hours: 48, minutes: 0 });
    expect(luis.offDutyAfter).toMatchObject({ hours: 36, minutes: 0 });
  });

  // "The worst window containing the swapped shift" is the longest window with changedBySwap
  // true: that flag is set when the window contains the start date of a shift the employee gave
  // or took.
  test("each employee's worst window containing a swapped shift is 48 h", async () => {
    const body = okBody(await swapCheck(STEP_1));
    for (const employeeNumber of [MAYA, LUIS]) {
      const worst = worstChangedWindow(employeeNamed(body, employeeNumber));
      expect(worst.hours).toBe(48);
      expect(worst.minutes).toBe(0);
    }
  });

  test("Maya's untouched rest CDU-CON1-0316-N to CDU-CON1-0317-N is exactly 12 h and raises no trigger", async () => {
    const roster = readSampleRoster();
    const earlier = roster.shifts.find((shift) => shift.shiftId === "CDU-CON1-0316-N");
    const later = roster.shifts.find((shift) => shift.shiftId === "CDU-CON1-0317-N");
    if (earlier === undefined || later === undefined) {
      throw new Error("sample roster lacks Maya's 0316-N or 0317-N shift");
    }
    expect(earlier.employeeNumber).toBe(MAYA);
    expect(later.employeeNumber).toBe(MAYA);
    expect(elapsedMinutes(earlier.end, later.start, roster.site.timeZone)).toBe(720);

    const maya = employeeNamed(okBody(await swapCheck(STEP_1)), MAYA);
    expect(maya.triggers.filter((trigger) => "fromShiftId" in trigger && trigger.fromShiftId === earlier.shiftId)).toEqual([]);
    expect(maya.triggers).toEqual([]);
  });

  test("the body carries no employee number and equals the step-1 fixture", async () => {
    const response = await swapCheck(STEP_1);
    expectNoEmployeeNumbers(response);
    expect(response.json()).toEqual(readFixture("step-1.json"));
  });
});

describe("criterion 3: Step 2, the clock change", () => {
  test("Step 2 gives 200 review-required with no § 3 finding for either employee", async () => {
    const body = okBody(await swapCheck(STEP_2));
    expect(body.outcome).toBe("review-required");
    expect(allFindings(body)).toEqual([]);
  });

  test("the only trigger is Aisha's § 4.2(a), 11 h, and Priya has none", async () => {
    const body = okBody(await swapCheck(STEP_2));
    expect(allTriggers(body)).toHaveLength(1);
    expect(employeeNamed(body, PRIYA).triggers).toEqual([]);
    const aisha = employeeNamed(body, AISHA);
    expect(aisha.triggers).toHaveLength(1);
    expect(aisha.triggers[0]).toMatchObject({
      rule: "4.2(a)",
      code: "off-duty-under-review-threshold",
      changedBySwap: true,
      thresholdHours: 12,
      fromShiftId: "CDU-CON2-0309-D",
      toShiftId: "HCU-CON1-0310-D",
      hours: 11,
      minutes: 0,
    });
  });

  test("Aisha's period after is 107 h, not 108", async () => {
    const aisha = employeeNamed(okBody(await swapCheck(STEP_2)), AISHA);
    expect(aisha.offDutyAfter).toMatchObject({ hours: 107, minutes: 0 });
    expect(aisha.offDutyAfter?.hours).not.toBe(108);
  });

  test("Priya's period is 72 h before and 71 h after, not 72", async () => {
    const priya = employeeNamed(okBody(await swapCheck(STEP_2)), PRIYA);
    expect(priya.offDutyBefore).toMatchObject({ hours: 72, minutes: 0 });
    expect(priya.offDutyAfter).toMatchObject({ hours: 71, minutes: 0 });
    expect(priya.offDutyAfter?.hours).not.toBe(72);
  });

  test("Aisha's untouched window 2027-03-14 to 2027-03-20 is 60 h and raises no § 4.2(b) trigger", async () => {
    const aisha = employeeNamed(okBody(await swapCheck(STEP_2)), AISHA);
    const window = aisha.windows.find((candidate) => candidate.from === "2027-03-14" && candidate.to === "2027-03-20");
    expect(window).toEqual({ from: "2027-03-14", to: "2027-03-20", hours: 60, minutes: 0, changedBySwap: false });
    expect(aisha.triggers.filter((trigger) => trigger.rule === "4.2(b)")).toEqual([]);
  });

  // BE ruling: the response does not name reviewing units. So "if it names units, HCU only" holds
  // vacuously; this guards it by pinning the body and employee keys to the known sets.
  test("the body names no reviewing units: only the known keys appear", async () => {
    const body = okBody(await swapCheck(STEP_2));
    expect(Object.keys(body)).toEqual(KNOWN_BODY_KEYS);
    for (const employee of body.employees) {
      expect(Object.keys(employee)).toEqual(KNOWN_EMPLOYEE_KEYS);
    }
  });

  test("the body carries no employee number and equals the step-2 fixture", async () => {
    const response = await swapCheck(STEP_2);
    expectNoEmployeeNumbers(response);
    expect(response.json()).toEqual(readFixture("step-2.json"));
  });
});

describe("criterion 4: ADD-6, a window over 60 h not changed by the swap", () => {
  test("ADD-6 gives 200 review-required with no finding for either employee", async () => {
    const body = okBody(await swapCheck(ADD_6));
    expect(body.outcome).toBe("review-required");
    expect(allFindings(body)).toEqual([]);
  });

  test("the only trigger is Tom's § 4.2(b) for 2027-03-15 to 2027-03-21, 72 h, changedBySwap false", async () => {
    const body = okBody(await swapCheck(ADD_6));
    expect(allTriggers(body)).toHaveLength(1);
    expect(employeeNamed(body, JEROME).triggers).toEqual([]);
    expect(employeeNamed(body, TOM).triggers).toEqual([
      {
        rule: "4.2(b)",
        code: "seven-day-hours-over-review-threshold",
        changedBySwap: false,
        thresholdHours: 60,
        from: "2027-03-15",
        to: "2027-03-21",
        hours: 72,
        minutes: 0,
      },
    ]);
  });

  test("the body carries no employee number and equals the add-6 fixture", async () => {
    const response = await swapCheck(ADD_6);
    expectNoEmployeeNumbers(response);
    expect(response.json()).toEqual(readFixture("add-6.json"));
  });
});

describe("criterion 5: ADD-3 with the determinability gate bypassed", () => {
  test("the evaluator called directly on the ADD-3 swap is approved-without-review", () => {
    const evaluation = evaluateSwap(readSampleRoster(), { giveShiftId: ADD_3.give, takeShiftId: ADD_3.take });
    if (evaluation.kind !== "evaluated") {
      throw new Error("the ADD-3 swap was not evaluable");
    }
    expect(evaluation.outcome).toBe("approved-without-review");
    for (const employee of evaluation.employees) {
      expect(employee.findings).toEqual([]);
      expect(employee.triggers).toEqual([]);
    }
  });

  test("the API still gives 200 cannot-determine, with the horizon reason", async () => {
    const response = await swapCheck(ADD_3);
    expect(response.statusCode).toBe(200);
    const body = response.json<{ outcome: string; reasons: unknown }>();
    expect(body.outcome).toBe("cannot-determine");
    expect(body.reasons).toEqual([
      {
        code: "shift-outside-horizon",
        shiftId: ADD_3.take,
        start: "2027-03-26T06:00",
        horizonFrom: "2027-03-07",
        horizonTo: "2027-03-22",
      },
    ]);
    expectNoEmployeeNumbers(response);
  });
});
