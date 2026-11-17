import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildApp } from "./app";
import type { Roster } from "./roster";
import { headersFor, readFixture, readSampleRoster } from "./test-support";

interface SwapCheckBody {
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
  app = buildApp();
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

  test("X-Roles shift-supervisor gives 403 role-not-permitted", async () => {
    const response = await postSwapCheck(STEP_1, headersFor(MAYA, "shift-supervisor"));
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ kind: "forbidden", code: "role-not-permitted" });
  });

  test("X-Roles operator,shift-supervisor is accepted as an operator", async () => {
    const response = await postSwapCheck(STEP_1, headersFor(MAYA, "operator,shift-supervisor"));
    expect(response.statusCode).toBe(501);
    expect(response.json()).toEqual({ kind: "not-evaluated" });
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
    expect(response.statusCode).toBe(400);
  });

  test("a missing giveShiftId gives 400", async () => {
    const response = await postSwapCheck({ takeShiftId: "CDU-CON1-0319-N" }, headersFor(MAYA));
    expect(response.statusCode).toBe(400);
  });

  test("an empty string id gives 400", async () => {
    const response = await postSwapCheck({ giveShiftId: "CDU-CON1-0318-N", takeShiftId: "" }, headersFor(MAYA));
    expect(response.statusCode).toBe(400);
  });

  test("an object id gives 400", async () => {
    const response = await postSwapCheck({ giveShiftId: {}, takeShiftId: "CDU-CON1-0319-N" }, headersFor(MAYA));
    expect(response.statusCode).toBe(400);
  });
});

describe("C5: Step 8, a take shift outside CDU/HCU is refused", () => {
  test("gives 422 refused naming the FCC shift and unit", async () => {
    const response = await swapCheckAs(MAYA, STEP_8.giveShiftId, STEP_8.takeShiftId);
    expect(response.statusCode).toBe(422);
    const body = response.json<SwapCheckBody>();
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

  test("the body names no employee number and no name", async () => {
    const response = await swapCheckAs(MAYA, STEP_8.giveShiftId, STEP_8.takeShiftId);
    expect(response.body).not.toContain("104417");
    expect(response.body).not.toContain("Thibodeaux");
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

    const rosterApp = buildApp({ roster });
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

  test("a take shift that is also the caller's own gives 422 take-shift-is-own", async () => {
    const response = await swapCheckAs(MAYA, "CDU-CON1-0318-N", "CDU-CON1-0317-N");
    expect(response.statusCode).toBe(422);
    const body = response.json<SwapCheckBody>();
    expect(body).toEqual({ kind: "refused", reasons: [{ code: "take-shift-is-own", shiftId: "CDU-CON1-0317-N" }] });
    expect(body.reasons?.map((reason) => reason.code)).not.toContain("outside-pilot-units");
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

describe("C7: Step 1, the not-evaluated seam", () => {
  test("a valid CDU swap gives 501 not-evaluated and no outcome", async () => {
    const response = await swapCheckAs(MAYA, STEP_1.giveShiftId, STEP_1.takeShiftId);
    expect(response.statusCode).toBe(501);
    const body = response.json<Record<string, unknown>>();
    expect(body).toEqual({ kind: "not-evaluated" });
    expect(body).not.toHaveProperty("outcome");
  });
});

describe("methods", () => {
  test("GET /api/swap-checks gives 404", async () => {
    const response = await app.inject({ method: "GET", url: "/api/swap-checks", headers: headersFor(MAYA) });
    expect(response.statusCode).toBe(404);
  });
});
