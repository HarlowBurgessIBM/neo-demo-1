import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildApp } from "./app";
import { headersFor, readFixture, readSampleRoster } from "./test-support";

interface ShiftBody {
  shiftId: string;
  unit: string;
  role: string;
  start: string;
  end: string;
}

interface ShiftsBody {
  exportedAt: string;
  exportedAtUtcMinute: string;
  exportedAtSiteLocal: string;
  siteTimeZone: string;
  give: ShiftBody[];
  take: ShiftBody[];
}

let app: FastifyInstance;

beforeAll(async () => {
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

async function getShifts(headers: Record<string, string> = {}) {
  return app.inject({ method: "GET", url: "/api/shifts", headers });
}

async function shiftsFor(employeeNumber: string): Promise<ShiftsBody> {
  const response = await getShifts(headersFor(employeeNumber));
  expect(response.statusCode).toBe(200);
  return response.json<ShiftsBody>();
}

describe("C2: identity on GET /api/shifts", () => {
  test("no headers gives 401", async () => {
    const response = await getShifts();
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ kind: "unauthenticated" });
  });

  test("only X-Employee-Number gives 401", async () => {
    const response = await getShifts({ "x-employee-number": "104417" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ kind: "unauthenticated" });
  });

  test("only X-Roles gives 401", async () => {
    const response = await getShifts({ "x-roles": "operator" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ kind: "unauthenticated" });
  });

  test("an empty employee number gives 401", async () => {
    const response = await getShifts({ "x-employee-number": "", "x-roles": "operator" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ kind: "unauthenticated" });
  });

  test("shift-supervisor without operator gives 403 role-not-permitted", async () => {
    const response = await getShifts(headersFor("104417", "shift-supervisor"));
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ kind: "forbidden", code: "role-not-permitted" });
  });

  test("operator,shift-supervisor gives 200", async () => {
    const response = await getShifts(headersFor("104417", "operator,shift-supervisor"));
    expect(response.statusCode).toBe(200);
  });

  test("operator, shift-supervisor (space after the comma) gives 200", async () => {
    const response = await getShifts(headersFor("104417", "operator, shift-supervisor"));
    expect(response.statusCode).toBe(200);
  });

  test("operator role with supervisor 100231 gives 403 not-a-roster-operator", async () => {
    const response = await getShifts(headersFor("100231"));
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ kind: "forbidden", code: "not-a-roster-operator" });
  });

  test("operator role with unknown 999999 gives 403 not-a-roster-operator", async () => {
    const response = await getShifts(headersFor("999999"));
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ kind: "forbidden", code: "not-a-roster-operator" });
  });
});

describe("C3: give and take", () => {
  const roster = readSampleRoster();
  const allIds = roster.shifts.map((shift) => shift.shiftId);

  test("104417's give list is exactly their roster shifts", async () => {
    const body = await shiftsFor("104417");
    const expected = roster.shifts
      .filter((shift) => shift.employeeNumber === "104417")
      .map((shift) => shift.shiftId);

    expect(expected).toHaveLength(11);
    expect(body.give).toHaveLength(11);
    expect(new Set(body.give.map((shift) => shift.shiftId))).toEqual(new Set(expected));
  });

  test("104417's take list excludes their shifts and includes FCC-CON1-0318-D", async () => {
    const body = await shiftsFor("104417");
    const giveIds = new Set(body.give.map((shift) => shift.shiftId));
    const takeIds = body.take.map((shift) => shift.shiftId);

    expect(takeIds.some((id) => giveIds.has(id))).toBe(false);
    expect(takeIds).toContain("FCC-CON1-0318-D");
  });

  test("give plus take cover every roster shift exactly once", async () => {
    const body = await shiftsFor("104417");
    const covered = [...body.give, ...body.take].map((shift) => shift.shiftId);

    expect([...covered].sort()).toEqual([...allIds].sort());
    expect(new Set(covered).size).toBe(covered.length);
  });

  test("102286 is Luis Fontenot and gets exactly his shifts as give", async () => {
    const luis = roster.operators.find((operator) => operator.name === "Luis Fontenot");
    expect(luis?.employeeNumber).toBe("102286");

    const body = await shiftsFor("102286");
    const expected = roster.shifts
      .filter((shift) => shift.employeeNumber === luis?.employeeNumber)
      .map((shift) => shift.shiftId);

    expect(expected.length).toBeGreaterThan(0);
    expect(new Set(body.give.map((shift) => shift.shiftId))).toEqual(new Set(expected));
    expect(body.give).toHaveLength(expected.length);
  });

  test("no shift in give or take carries an employeeNumber, and give carries no name", async () => {
    for (const employeeNumber of ["104417", "102286"]) {
      const body = await shiftsFor(employeeNumber);
      for (const shift of body.give) {
        expect(Object.keys(shift).sort()).toEqual(["end", "role", "shiftId", "start", "unit"]);
      }
      for (const shift of body.take) {
        expect(Object.keys(shift).sort()).toEqual(["end", "ownerName", "role", "shiftId", "start", "unit"]);
      }
      for (const shift of [...body.give, ...body.take]) {
        expect(shift).not.toHaveProperty("employeeNumber");
        expect(shift).not.toHaveProperty("name");
      }
    }
  });

  test("lists are sorted by start, then shiftId", async () => {
    const body = await shiftsFor("104417");
    for (const list of [body.give, body.take]) {
      const keys = list.map((shift) => `${shift.start}|${shift.shiftId}`);
      expect(keys).toEqual([...keys].sort());
    }
  });
});

describe("C4: export time", () => {
  test("renders the roster export time in UTC and in site-local time", async () => {
    const body = await shiftsFor("104417");
    expect(body.exportedAt).toBe("2027-03-07T08:00:00Z");
    expect(body.exportedAtSiteLocal).toBe("2027-03-07T02:00");
    expect(body.exportedAtUtcMinute).toBe("2027-03-07T08:00Z");
    expect(body.siteTimeZone).toBe("America/Chicago");
  });
});

describe("C15: responses match the shared fixtures", () => {
  test("104417", async () => {
    expect(await shiftsFor("104417")).toEqual(readFixture("shifts-104417.json"));
  });

  test("102286", async () => {
    expect(await shiftsFor("102286")).toEqual(readFixture("shifts-102286.json"));
  });
});
