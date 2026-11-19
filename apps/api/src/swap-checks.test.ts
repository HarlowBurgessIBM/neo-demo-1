import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildApp } from "./app";
import type { Roster } from "./test-support";
import {
  ADD_6,
  fixedNow,
  headersFor,
  operatorName,
  readFixture,
  readSampleRoster,
  SAMPLE_NOW_ISO,
  STEP_2,
} from "./test-support";

interface SwapCheckResponse {
  kind: string;
  code?: string;
  reasons?: { code: string; shiftId: string; unit?: string }[];
}

type HeaderValue = string | string[];

const MAYA = "104417";
const RENEE = "100231";

// Maya's shifts: CDU-CON1-0318-N, CDU-CON1-0317-N. Luis's: CDU-CON1-0319-N, CDU-CON1-0316-D.
// FCC is outside the pilot: FCC-CON1-0318-D and FCC-CON1-0311-D are Nadia's.
const STEP_1 = { giveShiftId: "CDU-CON1-0318-N", takeShiftId: "CDU-CON1-0319-N" };
const STEP_8 = { giveShiftId: "CDU-CON1-0318-N", takeShiftId: "FCC-CON1-0318-D" };

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp({ now: fixedNow(SAMPLE_NOW_ISO) });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function postSwapCheck(
  payload: object,
  headers: Record<string, HeaderValue> = {},
  target: FastifyInstance = app,
) {
  return target.inject({ method: "POST", url: "/api/swap-checks", headers, payload });
}

async function swapCheckAs(
  employeeNumber: string,
  giveShiftId: string,
  takeShiftId: string,
  target: FastifyInstance = app,
) {
  return postSwapCheck({ giveShiftId, takeShiftId }, headersFor(employeeNumber), target);
}

function reassignShift(roster: Roster, shiftId: string, employeeNumber: string): void {
  const shift = roster.shifts.find((candidate) => candidate.shiftId === shiftId);
  if (shift === undefined) {
    throw new Error(`sample roster has no shift ${shiftId}`);
  }
  shift.employeeNumber = employeeNumber;
}

/** Runs `run` against an app built on a modified copy of the sample roster. */
async function withModifiedRoster(
  modify: (roster: Roster) => void,
  run: (rosterApp: FastifyInstance) => Promise<void>,
): Promise<void> {
  const roster: Roster = structuredClone(readSampleRoster());
  modify(roster);
  const rosterApp = buildApp({ roster, now: fixedNow(SAMPLE_NOW_ISO) });
  await rosterApp.ready();
  try {
    await run(rosterApp);
  } finally {
    await rosterApp.close();
  }
}

function expectBadRequest(response: { statusCode: number; json: () => unknown }): void {
  expect(response.statusCode).toBe(400);
  expect(response.json()).not.toHaveProperty("kind");
}

describe("C2: identity on POST /api/swap-checks", () => {
  test("no headers gives 401", async () => {
    const response = await postSwapCheck(STEP_1);
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ kind: "unauthenticated" });
  });

  test("only X-Employee-Number gives 401", async () => {
    const response = await postSwapCheck(STEP_1, { "x-employee-number": MAYA });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ kind: "unauthenticated" });
  });

  test("only X-Roles gives 401", async () => {
    const response = await postSwapCheck(STEP_1, { "x-roles": "operator" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ kind: "unauthenticated" });
  });

  test("a repeated X-Employee-Number gives 401", async () => {
    // An array header value reaches rawHeaders as two separate entries.
    const response = await postSwapCheck(STEP_1, { "x-employee-number": [MAYA, MAYA], "x-roles": "operator" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ kind: "unauthenticated" });
  });

  test("a repeated X-Employee-Number with different values gives 401", async () => {
    const response = await postSwapCheck(STEP_1, { "x-employee-number": [MAYA, "102286"], "x-roles": "operator" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ kind: "unauthenticated" });
  });

  test("a repeated X-Roles gives 401", async () => {
    const response = await postSwapCheck(STEP_1, { "x-employee-number": MAYA, "x-roles": ["operator", "operator"] });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ kind: "unauthenticated" });
  });

  test("X-Roles shift-supervisor gives 403 role-not-permitted", async () => {
    const response = await postSwapCheck(STEP_1, headersFor(MAYA, "shift-supervisor"));
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ kind: "forbidden", code: "role-not-permitted" });
  });

  test.each(["operator,shift-supervisor", "shift-supervisor, operator", " operator , shift-supervisor "])(
    "X-Roles %j is accepted as an operator (comma list, trimmed)",
    async (roles) => {
      const response = await postSwapCheck(STEP_1, headersFor(MAYA, roles));
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ outcome: "approved-without-review" });
    },
  );

  test("X-Roles with a trailing empty entry and no operator gives 403 role-not-permitted", async () => {
    const response = await postSwapCheck(STEP_1, headersFor(MAYA, "shift-supervisor , "));
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ kind: "forbidden", code: "role-not-permitted" });
  });

  test("role-not-permitted is checked before the body: a malformed body still gives 403", async () => {
    const response = await postSwapCheck({ giveShiftId: "CDU-CON1-0318-N" }, headersFor(MAYA, "shift-supervisor"));
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ kind: "forbidden", code: "role-not-permitted" });
  });

  test("a supervisor with the operator role gives 403 not-a-roster-operator", async () => {
    const response = await postSwapCheck(STEP_1, headersFor(RENEE, "operator"));
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ kind: "forbidden", code: "not-a-roster-operator" });
  });

  test("identity is checked before the body: no headers and a malformed body gives 401", async () => {
    const response = await postSwapCheck({ giveShiftId: "CDU-CON1-0318-N" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ kind: "unauthenticated" });
  });
});

describe("malformed body", () => {
  test("a missing takeShiftId gives 400", async () => {
    const response = await postSwapCheck({ giveShiftId: "CDU-CON1-0318-N" }, headersFor(MAYA));
    expectBadRequest(response);
  });

  test("a missing giveShiftId gives 400", async () => {
    const response = await postSwapCheck({ takeShiftId: "CDU-CON1-0319-N" }, headersFor(MAYA));
    expectBadRequest(response);
  });

  test("an empty string id gives 400", async () => {
    const response = await postSwapCheck({ giveShiftId: "CDU-CON1-0318-N", takeShiftId: "" }, headersFor(MAYA));
    expectBadRequest(response);
  });

  test("an object id gives 400", async () => {
    // `{}` rather than a number: Ajv coerces numbers to strings, so a numeric id would not give 400.
    const response = await postSwapCheck({ giveShiftId: {}, takeShiftId: "CDU-CON1-0319-N" }, headersFor(MAYA));
    expectBadRequest(response);
  });

  test("extra body properties are stripped, not rejected", async () => {
    const response = await postSwapCheck({ ...STEP_1, extra: 1 }, headersFor(MAYA));
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ outcome: "approved-without-review" });
  });
});

describe("C5: Step 8, a take shift outside CDU/HCU is refused", () => {
  test("gives 422 refused naming the FCC shift and unit", async () => {
    const response = await swapCheckAs(MAYA, STEP_8.giveShiftId, STEP_8.takeShiftId);
    expect(response.statusCode).toBe(422);
    const body = response.json<SwapCheckResponse>();
    expect(body.kind).toBe("refused");
    expect(body.reasons).toContainEqual({ code: "outside-pilot-units", shiftId: "FCC-CON1-0318-D", unit: "FCC" });
  });

  test("carries no outcome, employees, findings or result", async () => {
    const response = await swapCheckAs(MAYA, STEP_8.giveShiftId, STEP_8.takeShiftId);
    const body = response.json<Record<string, unknown>>();
    for (const key of ["outcome", "employees", "findings", "result"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  test("C15: the body equals the shared step-8 fixture", async () => {
    const response = await swapCheckAs(MAYA, STEP_8.giveShiftId, STEP_8.takeShiftId);
    expect(response.json()).toEqual(readFixture("step-8.json"));
  });

  test("the body names no employee number and no name, for the caller or the other party", async () => {
    const response = await swapCheckAs(MAYA, STEP_8.giveShiftId, STEP_8.takeShiftId);
    // Maya is the caller; Nadia Trahan owns the FCC take shift.
    expect(response.body).not.toContain("104417");
    expect(response.body).not.toContain("Thibodeaux");
    expect(response.body).not.toContain("109364");
    expect(response.body).not.toContain("Trahan");
  });
});

describe("C5: both shifts outside the pilot", () => {
  test("names both shifts, give first", async () => {
    const roster: Roster = structuredClone(readSampleRoster());
    const give = roster.shifts.find((shift) => shift.shiftId === "FCC-CON1-0311-D");
    expect(give).toBeDefined();
    if (give === undefined) {
      return;
    }
    give.employeeNumber = MAYA;

    const rosterApp = buildApp({ roster, now: fixedNow(SAMPLE_NOW_ISO) });
    await rosterApp.ready();
    try {
      const response = await swapCheckAs(MAYA, "FCC-CON1-0311-D", "FCC-CON1-0318-D", rosterApp);
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        kind: "refused",
        reasons: [
          { code: "outside-pilot-units", shiftId: "FCC-CON1-0311-D", unit: "FCC" },
          { code: "outside-pilot-units", shiftId: "FCC-CON1-0318-D", unit: "FCC" },
        ],
      });
    } finally {
      await rosterApp.close();
    }
  });
});

describe("C6: ownership of the give and take shifts", () => {
  test("a give shift that is another operator's gives 403 give-shift-not-yours", async () => {
    const response = await swapCheckAs(MAYA, "CDU-CON1-0319-N", "CDU-CON1-0316-D");
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ kind: "forbidden", code: "give-shift-not-yours" });
  });

  test("an unknown give shift gives the same 403", async () => {
    const response = await swapCheckAs(MAYA, "CDU-CON1-9999-N", "CDU-CON1-0319-N");
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ kind: "forbidden", code: "give-shift-not-yours" });
  });

  test("an unknown give shift with an unknown take shift gives 403, not 422", async () => {
    const response = await swapCheckAs(MAYA, "CDU-CON1-9999-N", "CDU-CON1-8888-N");
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ kind: "forbidden", code: "give-shift-not-yours" });
  });

  test("an unknown give shift with an FCC take shift gives 403, not 422", async () => {
    const response = await swapCheckAs(MAYA, "CDU-CON1-9999-N", "FCC-CON1-0318-D");
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ kind: "forbidden", code: "give-shift-not-yours" });
  });

  test("a foreign give shift with an unknown take shift gives 403, not 422", async () => {
    const response = await swapCheckAs(MAYA, "CDU-CON1-0319-N", "CDU-CON1-9999-N");
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ kind: "forbidden", code: "give-shift-not-yours" });
  });

  test("a take shift that is also the caller's own gives 422 take-shift-is-own", async () => {
    const response = await swapCheckAs(MAYA, "CDU-CON1-0318-N", "CDU-CON1-0317-N");
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      kind: "refused",
      reasons: [{ code: "take-shift-is-own", shiftId: "CDU-CON1-0317-N" }],
    });
  });

  test("take-shift-is-own is checked before the pilot units: an own FCC take shift gives only take-shift-is-own", async () => {
    await withModifiedRoster(
      (roster) => {
        reassignShift(roster, "FCC-CON1-0318-D", MAYA);
      },
      async (rosterApp) => {
        const response = await swapCheckAs(MAYA, "CDU-CON1-0318-N", "FCC-CON1-0318-D", rosterApp);
        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual({
          kind: "refused",
          reasons: [{ code: "take-shift-is-own", shiftId: "FCC-CON1-0318-D" }],
        });
      },
    );
  });

  test("unknown-shift is checked before the pilot units: an FCC give shift and an unknown take shift gives only unknown-shift", async () => {
    await withModifiedRoster(
      (roster) => {
        reassignShift(roster, "FCC-CON1-0311-D", MAYA);
      },
      async (rosterApp) => {
        const response = await swapCheckAs(MAYA, "FCC-CON1-0311-D", "CDU-CON1-9999-N", rosterApp);
        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual({
          kind: "refused",
          reasons: [{ code: "unknown-shift", shiftId: "CDU-CON1-9999-N" }],
        });
      },
    );
  });

  test("an FCC give shift with a CDU take shift names only the give shift", async () => {
    await withModifiedRoster(
      (roster) => {
        reassignShift(roster, "FCC-CON1-0311-D", MAYA);
      },
      async (rosterApp) => {
        const response = await swapCheckAs(MAYA, "FCC-CON1-0311-D", "CDU-CON1-0319-N", rosterApp);
        expect(response.statusCode).toBe(422);
        expect(response.json()).toEqual({
          kind: "refused",
          reasons: [{ code: "outside-pilot-units", shiftId: "FCC-CON1-0311-D", unit: "FCC" }],
        });
      },
    );
  });

  test("give equal to take gives 422 take-shift-is-own", async () => {
    const response = await swapCheckAs(MAYA, "CDU-CON1-0318-N", "CDU-CON1-0318-N");
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      kind: "refused",
      reasons: [{ code: "take-shift-is-own", shiftId: "CDU-CON1-0318-N" }],
    });
  });

  test("an unknown take shift gives 422 unknown-shift", async () => {
    const response = await swapCheckAs(MAYA, "CDU-CON1-0318-N", "CDU-CON1-9999-N");
    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      kind: "refused",
      reasons: [{ code: "unknown-shift", shiftId: "CDU-CON1-9999-N" }],
    });
  });
});

describe("C7: the outcomes of a pick that passes the refusal checks and the gate", () => {
  const APPROVED_GUIDANCE =
    "This swap meets VE-HSSE-STD-014 § 3 and triggers neither condition in § 4.2, so under § 4.3 it may be approved without supervisor review. This is a check only: nothing has been approved, stored or sent.";
  const REVIEW_GUIDANCE =
    "This swap meets VE-HSSE-STD-014 § 3, but it triggers § 4.2, so it needs review and approval by the shift supervisor of each unit affected. This is a check only: nothing has been sent for review, stored or approved.";
  const BODY_KEYS = [
    "outcome",
    "exportedAt",
    "exportedAtUtcMinute",
    "exportedAtSiteLocal",
    "siteTimeZone",
    "guidance",
    "employees",
  ];

  test.each([
    ["Step 1", MAYA, STEP_1.giveShiftId, STEP_1.takeShiftId, "step-1.json"],
    ["Step 2", STEP_2.caller, STEP_2.give, STEP_2.take, "step-2.json"],
    ["ADD-6", ADD_6.caller, ADD_6.give, ADD_6.take, "add-6.json"],
  ])("%s gives 200 equal to its shared fixture", async (_label, caller, give, take, fixture) => {
    const response = await swapCheckAs(caller, give, take);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(readFixture(fixture));
  });

  test("Step 1 is approved-without-review, with the exact guidance and the wire key order", async () => {
    const response = await swapCheckAs(MAYA, STEP_1.giveShiftId, STEP_1.takeShiftId);
    const body = response.json<Record<string, unknown>>();
    expect(body["outcome"]).toBe("approved-without-review");
    expect(body["guidance"]).toBe(APPROVED_GUIDANCE);
    expect(Object.keys(body)).toEqual(BODY_KEYS);
  });

  test.each([
    ["Step 2", STEP_2],
    ["ADD-6", ADD_6],
  ])("%s is review-required, with the exact guidance and the wire key order", async (_label, pick) => {
    const response = await swapCheckAs(pick.caller, pick.give, pick.take);
    const body = response.json<Record<string, unknown>>();
    expect(body["outcome"]).toBe("review-required");
    expect(body["guidance"]).toBe(REVIEW_GUIDANCE);
    expect(Object.keys(body)).toEqual(BODY_KEYS);
  });

  test("the bodies carry the roster names and no employee number", async () => {
    const response = await swapCheckAs(MAYA, STEP_1.giveShiftId, STEP_1.takeShiftId);
    const body = response.json<{ employees: { name: string }[] }>();
    expect(body.employees.map((employee) => employee.name)).toEqual([operatorName(MAYA), operatorName("102286")]);
    expect(response.body).not.toContain(MAYA);
    expect(response.body).not.toContain("102286");
  });

  test("an evaluation with no result maps to 200 cannot-determine with reason not-evaluable", async () => {
    const stubbedApp = buildApp({
      now: fixedNow(SAMPLE_NOW_ISO),
      evaluate: () => ({ kind: "not-evaluable" }),
    });
    await stubbedApp.ready();
    try {
      const response = await swapCheckAs(MAYA, STEP_1.giveShiftId, STEP_1.takeShiftId, stubbedApp);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        outcome: "cannot-determine",
        exportedAt: "2027-03-07T08:00:00Z",
        exportedAtUtcMinute: "2027-03-07T08:00Z",
        exportedAtSiteLocal: "2027-03-07T02:00",
        siteTimeZone: "America/Chicago",
        reasons: [{ code: "not-evaluable" }],
      });
    } finally {
      await stubbedApp.close();
    }
  });
});

describe("methods", () => {
  // A deliberate "no other methods" guard: only POST is registered on this path.
  test("GET /api/swap-checks gives 404", async () => {
    const response = await app.inject({ method: "GET", url: "/api/swap-checks", headers: headersFor(MAYA) });
    expect(response.statusCode).toBe(404);
  });
});
