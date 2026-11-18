import { assessDeterminability } from "@shiftswap/rules";
import type { LightMyRequestResponse } from "fastify";
import { describe, expect, test } from "vitest";
import { buildApp } from "./app";
import {
  fixedNow,
  headersFor,
  readFixture,
  readSampleRoster,
  readSampleRosterRaw,
  SAMPLE_NOW_ISO,
  shiftEndNotAfterStartRoster,
  STEP_3,
} from "./test-support";

// The determinability gate through POST /api/swap-checks (issue #5). Fixtures are the shared
// response fixtures in fixtures/responses, the same files the web tests read (criterion 18).

type JsonRecord = Record<string, unknown>;

const MAYA = "104417";
const LUIS = "102286";
const JEROME = "108529";

/** Before the sample export is stale (26 hours) and after it was made. */
const FRESH_NOW = "2027-03-07T14:00:00Z";
/** 28 hours after the sample export. */
const STALE_NOW = "2027-03-08T12:00:00Z";

// Step 7: Maya gives CDU-CON1-0318-N and takes Luis's CDU-CON1-0319-N.
const STEP_7 = { caller: MAYA, give: "CDU-CON1-0318-N", take: "CDU-CON1-0319-N" };
// ADD-3: Jerome gives CDU-FLD1-0318-D and takes Luis's CDU-CON1-0326-D, which is beyond the horizon.
const ADD_3 = { caller: JEROME, give: "CDU-FLD1-0318-D", take: "CDU-CON1-0326-D" };

const STAMP = {
  exportedAt: "2027-03-07T08:00:00Z",
  exportedAtUtcMinute: "2027-03-07T08:00Z",
  exportedAtSiteLocal: "2027-03-07T02:00",
  siteTimeZone: "America/Chicago",
};

const NULL_STAMP = {
  exportedAt: null,
  exportedAtUtcMinute: null,
  exportedAtSiteLocal: null,
  siteTimeZone: null,
};

function asRecord(value: unknown, what: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${what} is not an object`);
  }
  // The same object, not a copy: callers mutate the sample to build a variant.
  return value as JsonRecord;
}

function asList(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${what} is not an array`);
  }
  return value;
}

/** The sample roster as a mutable raw JSON object. */
function sampleRoster(): JsonRecord {
  return asRecord(readSampleRosterRaw(), "roster");
}

function entryWith(list: unknown, key: string, value: string, what: string): JsonRecord {
  const found = asList(list, what).find((item) => asRecord(item, what)[key] === value);
  if (found === undefined) {
    throw new Error(`sample roster has no ${what} ${value}`);
  }
  return asRecord(found, what);
}

function shiftOf(roster: JsonRecord, shiftId: string): JsonRecord {
  return entryWith(roster["shifts"], "shiftId", shiftId, "shift");
}

function operatorOf(roster: JsonRecord, employeeNumber: string): JsonRecord {
  return entryWith(roster["operators"], "employeeNumber", employeeNumber, "operator");
}

function siteOf(roster: JsonRecord): JsonRecord {
  return asRecord(roster["site"], "site");
}

interface SwapPick {
  caller: string;
  give: string;
  take: string;
}

/** Posts one swap check to an app built on `roster` with the clock fixed at `now`. */
async function swapCheck(
  pick: SwapPick,
  now: string,
  roster: unknown = readSampleRosterRaw(),
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

/** Every employee number and name of the sample's operators and supervisors. */
function sampleIdentities(): string[] {
  const roster = sampleRoster();
  const people = [...asList(roster["operators"], "operators"), ...asList(roster["supervisors"], "supervisors")];
  return people.flatMap((person) => {
    const record = asRecord(person, "person");
    return [String(record["employeeNumber"]), String(record["name"])];
  });
}

/**
 * Asserts a 200 cannot-determine response: no evaluation keys, and no sample employee number or
 * operator or supervisor name anywhere in the raw body. Returns the parsed body.
 */
function expectCannotDetermine(response: LightMyRequestResponse): JsonRecord {
  expect(response.statusCode).toBe(200);
  const body = asRecord(JSON.parse(response.body), "body");
  expect(body["outcome"]).toBe("cannot-determine");
  for (const key of ["kind", "employees", "findings", "result"]) {
    expect(body).not.toHaveProperty(key);
  }
  for (const identity of sampleIdentities()) {
    expect(response.body).not.toContain(identity);
  }
  return body;
}

describe("criterion 3: Step 7, a stale export cannot be determined", () => {
  test("Step 7 at 2027-03-08T12:00Z gives 200 equal to the step-7 fixture", async () => {
    const response = await swapCheck(STEP_7, STALE_NOW);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(readFixture("step-7.json"));
  });

  test("the body has exportedAt and no employees, findings, result or kind", async () => {
    const body = expectCannotDetermine(await swapCheck(STEP_7, STALE_NOW));
    expect(body).toHaveProperty("exportedAt");
    expect(body).toMatchObject(STAMP);
  });

  test("the same request at 2027-03-07T14:00Z gives 501 not-evaluated", async () => {
    const response = await swapCheck(STEP_7, FRESH_NOW);
    expect(response.statusCode).toBe(501);
    expect(response.json()).toEqual({ kind: "not-evaluated" });
  });
});

describe("criterion 6: ADD-3, a take shift beyond the horizon", () => {
  test("ADD-3 at 14:00Z gives 200 equal to the add-3 fixture", async () => {
    const response = await swapCheck(ADD_3, FRESH_NOW);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(readFixture("add-3.json"));
  });

  test("the body names only the take shift: the give shift id is absent", async () => {
    const response = await swapCheck(ADD_3, FRESH_NOW);
    expectCannotDetermine(response);
    expect(response.body).toContain("CDU-CON1-0326-D");
    expect(response.body).not.toContain("CDU-FLD1-0318-D");
  });

  test("with both shifts beyond the horizon, both are named, give first", async () => {
    // CDU-FLD1-0327-N is Jerome's and starts 2027-03-27T18:00. CDU-CON1-0326-D is Luis's.
    const response = await swapCheck(
      { caller: JEROME, give: "CDU-FLD1-0327-N", take: "CDU-CON1-0326-D" },
      FRESH_NOW,
    );
    const body = expectCannotDetermine(response);
    expect(body["reasons"]).toEqual([
      {
        code: "shift-outside-horizon",
        shiftId: "CDU-FLD1-0327-N",
        start: "2027-03-27T18:00",
        horizonFrom: "2027-03-07",
        horizonTo: "2027-03-22",
      },
      {
        code: "shift-outside-horizon",
        shiftId: "CDU-CON1-0326-D",
        start: "2027-03-26T06:00",
        horizonFrom: "2027-03-07",
        horizonTo: "2027-03-22",
      },
    ]);
  });
});

describe("criterion 10: every reason is listed, and refusals come first", () => {
  test("the ADD-3 pick at 2027-03-08T12:00Z lists export-stale then shift-outside-horizon", async () => {
    const response = await swapCheck(ADD_3, STALE_NOW);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(readFixture("cannot-determine-stale-and-horizon.json"));
    const body = expectCannotDetermine(response);
    const codes = asList(body["reasons"], "reasons").map((reason) => asRecord(reason, "reason")["code"]);
    expect(codes).toEqual(["export-stale", "shift-outside-horizon"]);
  });

  test("an FCC take shift beyond the horizon with a stale clock is refused 422, not cannot-determine", async () => {
    const roster = sampleRoster();
    asList(roster["shifts"], "shifts").push({
      shiftId: "FCC-CON1-0326-D",
      unit: "FCC",
      role: "CONSOLE",
      start: "2027-03-26T06:00",
      end: "2027-03-26T18:00",
      employeeNumber: "109364",
    });
    const response = await swapCheck(
      { caller: MAYA, give: "CDU-CON1-0318-N", take: "FCC-CON1-0326-D" },
      STALE_NOW,
      roster,
    );
    expect(response.statusCode).toBe(422);
    const body = asRecord(response.json(), "body");
    expect(body).toEqual({
      kind: "refused",
      reasons: [{ code: "outside-pilot-units", shiftId: "FCC-CON1-0326-D", unit: "FCC" }],
    });
    expect(body).not.toHaveProperty("outcome");
  });
});

describe("criterion 14: a clock before the export", () => {
  test("now 07:59:59Z gives 200 equal to the now-before-export fixture", async () => {
    const response = await swapCheck(STEP_7, "2027-03-07T07:59:59Z");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(readFixture("cannot-determine-now-before-export.json"));
    expectCannotDetermine(response);
  });

  test("now equal to exportedAt gives 501 not-evaluated", async () => {
    const response = await swapCheck(STEP_7, "2027-03-07T08:00:00Z");
    expect(response.statusCode).toBe(501);
    expect(response.json()).toEqual({ kind: "not-evaluated" });
  });
});

describe("criterion 9: the owner and qualification records of the swapped shifts", () => {
  const OWNER_NOT_OPERATOR = {
    code: "owner-not-operator",
    shiftId: "CDU-CON1-0319-N",
    party: "take-shift-owner",
  };

  test("a take shift owned by a non-operator gives owner-not-operator", async () => {
    const roster = sampleRoster();
    shiftOf(roster, "CDU-CON1-0319-N")["employeeNumber"] = "999999";
    const body = expectCannotDetermine(await swapCheck(STEP_7, FRESH_NOW, roster));
    expect(body["reasons"]).toEqual([OWNER_NOT_OPERATOR]);
  });

  test("a take shift with no owner reaches the gate and gives owner-not-operator", async () => {
    const roster = sampleRoster();
    delete shiftOf(roster, "CDU-CON1-0319-N")["employeeNumber"];
    const body = expectCannotDetermine(await swapCheck(STEP_7, FRESH_NOW, roster));
    expect(body["reasons"]).toEqual([OWNER_NOT_OPERATOR]);
  });

  test("a take shift with a numeric owner reaches the gate and gives owner-not-operator", async () => {
    const roster = sampleRoster();
    shiftOf(roster, "CDU-CON1-0319-N")["employeeNumber"] = 102286;
    const body = expectCannotDetermine(await swapCheck(STEP_7, FRESH_NOW, roster));
    expect(body["reasons"]).toEqual([OWNER_NOT_OPERATOR]);
  });

  test("the take shift owner's qualifications absent gives qualifications-missing absent", async () => {
    const roster = sampleRoster();
    delete operatorOf(roster, LUIS)["qualifications"];
    const body = expectCannotDetermine(await swapCheck(STEP_7, FRESH_NOW, roster));
    expect(body["reasons"]).toEqual([
      { code: "qualifications-missing", shiftId: "CDU-CON1-0319-N", party: "take-shift-owner", problem: "absent" },
    ]);
  });

  test("the take shift owner's qualifications empty gives qualifications-missing empty", async () => {
    const roster = sampleRoster();
    operatorOf(roster, LUIS)["qualifications"] = [];
    const body = expectCannotDetermine(await swapCheck(STEP_7, FRESH_NOW, roster));
    expect(body["reasons"]).toEqual([
      { code: "qualifications-missing", shiftId: "CDU-CON1-0319-N", party: "take-shift-owner", problem: "empty" },
    ]);
  });

  test("the caller's own qualifications absent gives party give-shift-owner", async () => {
    const roster = sampleRoster();
    delete operatorOf(roster, MAYA)["qualifications"];
    const body = expectCannotDetermine(await swapCheck(STEP_7, FRESH_NOW, roster));
    expect(body["reasons"]).toEqual([
      { code: "qualifications-missing", shiftId: "CDU-CON1-0318-N", party: "give-shift-owner", problem: "absent" },
    ]);
  });
});

describe("criteria 7, 15 and 17: an unusable export is an outcome, never a server error", () => {
  test("criterion 7: a missing exportedAt gives 200 equal to the missing-exported-at fixture", async () => {
    const roster = sampleRoster();
    delete roster["exportedAt"];
    const response = await swapCheck(STEP_7, FRESH_NOW, roster);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(readFixture("cannot-determine-missing-exported-at.json"));
    const body = expectCannotDetermine(response);
    expect(body).toMatchObject(NULL_STAMP);
    expect(body["reasons"]).toEqual([{ code: "invalid-export-field", field: "exportedAt", problem: "missing" }]);
  });

  test("criterion 15: an unknown site.timeZone gives 200 cannot-determine with null stamp fields, not 503", async () => {
    const roster = sampleRoster();
    siteOf(roster)["timeZone"] = "Mars/Olympus";
    const body = expectCannotDetermine(await swapCheck(STEP_7, FRESH_NOW, roster));
    expect(body).toMatchObject(NULL_STAMP);
    expect(body["reasons"]).toContainEqual({
      code: "invalid-export-field",
      field: "site.timeZone",
      problem: "unknown-time-zone",
    });
  });

  test("criterion 15: an absent site.timeZone gives 200 cannot-determine with null stamp fields", async () => {
    const roster = sampleRoster();
    delete siteOf(roster)["timeZone"];
    const body = expectCannotDetermine(await swapCheck(STEP_7, FRESH_NOW, roster));
    expect(body).toMatchObject(NULL_STAMP);
    expect(body["reasons"]).toContainEqual({
      code: "invalid-export-field",
      field: "site.timeZone",
      problem: "missing",
    });
  });

  test("criterion 15: a numeric site.timeZone gives 200 cannot-determine with null stamp fields", async () => {
    const roster = sampleRoster();
    siteOf(roster)["timeZone"] = 42;
    const body = expectCannotDetermine(await swapCheck(STEP_7, FRESH_NOW, roster));
    expect(body).toMatchObject(NULL_STAMP);
    expect(body["reasons"]).toContainEqual({
      code: "invalid-export-field",
      field: "site.timeZone",
      problem: "malformed",
    });
  });

  test("criterion 17: a wrong coverage.from gives 200 coverage-mismatch", async () => {
    const roster = sampleRoster();
    asRecord(roster["coverage"], "coverage")["from"] = "2027-03-02";
    const body = expectCannotDetermine(await swapCheck(STEP_7, FRESH_NOW, roster));
    expect(body).toMatchObject(STAMP);
    expect(body["reasons"]).toEqual([
      { code: "coverage-mismatch", field: "coverage.from", actual: "2027-03-02", expected: "2027-03-01" },
    ]);
  });
});

describe("criteria 3 and 17: a shift that ends at or before it starts", () => {
  test("Step 3 with an unswapped take-owner shift ending when it starts gives cannot-determine with one reason", async () => {
    const { roster, shiftId } = shiftEndNotAfterStartRoster();
    const response = await swapCheck(STEP_3, SAMPLE_NOW_ISO, roster);
    const body = expectCannotDetermine(response);
    expect(body["reasons"]).toEqual([
      {
        code: "invalid-export-field",
        field: "shifts.end",
        party: "take-shift-owner",
        shiftId,
        problem: "not-after-start",
      },
    ]);
  });

  test("the body equals the cannot-determine-shift-end-not-after-start fixture, with no name or employee number", async () => {
    const { roster } = shiftEndNotAfterStartRoster();
    const response = await swapCheck(STEP_3, SAMPLE_NOW_ISO, roster);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(readFixture("cannot-determine-shift-end-not-after-start.json"));
    expectCannotDetermine(response);
  });

  test("an outside-pilot-units refusal on the same roster is still 422, ahead of the gate", async () => {
    const { roster } = shiftEndNotAfterStartRoster();
    // Luis owns the FCC shift, so the shift that ends when it starts is still in the shift set.
    roster.shifts.push({
      shiftId: "FCC-CON1-0320-D",
      unit: "FCC",
      role: "CONSOLE",
      start: "2027-03-20T06:00",
      end: "2027-03-20T18:00",
      employeeNumber: LUIS,
    });
    const response = await swapCheck({ caller: MAYA, give: STEP_3.give, take: "FCC-CON1-0320-D" }, SAMPLE_NOW_ISO, roster);
    expect(response.statusCode).toBe(422);
    const body = asRecord(response.json(), "body");
    expect(body).toEqual({
      kind: "refused",
      reasons: [{ code: "outside-pilot-units", shiftId: "FCC-CON1-0320-D", unit: "FCC" }],
    });
    expect(body).not.toHaveProperty("outcome");
  });
});

describe("criterion 16: the sample has no clock-change times", () => {
  test("no shift starts or ends on 2027-03-14 between 02:00 and 02:59", () => {
    const clockChangeHour = /^2027-03-14T02:\d\d$/;
    const inGap = readSampleRoster().shifts.filter(
      (shift) => clockChangeHour.test(shift.start) || clockChangeHour.test(shift.end),
    );
    expect(inGap).toEqual([]);
  });

  test("no pair of the sample's operators gets nonexistent-local-time or ambiguous-local-time", () => {
    const roster = readSampleRoster();
    const now = fixedNow(FRESH_NOW)();
    const horizonFrom = "2027-03-07";
    const horizonTo = "2027-03-22";

    // One shift per operator, preferably inside the horizon.
    const shiftFor = (employeeNumber: string): string => {
      const owned = roster.shifts.filter((shift) => shift.employeeNumber === employeeNumber);
      const inHorizon = owned.find((shift) => {
        const date = shift.start.slice(0, 10);
        return date >= horizonFrom && date <= horizonTo;
      });
      const chosen = inHorizon ?? owned[0];
      if (chosen === undefined) {
        throw new Error("operator owns no shift");
      }
      return chosen.shiftId;
    };

    let pairs = 0;
    for (const [index, first] of roster.operators.entries()) {
      for (const second of roster.operators.slice(index + 1)) {
        pairs += 1;
        const result = assessDeterminability(readSampleRosterRaw(), {
          now,
          giveShiftId: shiftFor(first.employeeNumber),
          takeShiftId: shiftFor(second.employeeNumber),
        });
        const codes = result.determinable ? [] : result.reasons.map((reason) => reason.code);
        expect(codes).not.toContain("nonexistent-local-time");
        expect(codes).not.toContain("ambiguous-local-time");
      }
    }
    expect(pairs).toBe(28);
  });
});
