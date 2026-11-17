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

interface TakeBody extends ShiftBody {
  ownerName: unknown;
}

/** Every string and number found anywhere inside `value`, as strings. Walks objects and arrays. */
function leafValues(value: unknown): string[] {
  if (typeof value === "string" || typeof value === "number") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap(leafValues);
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap(leafValues);
  }
  return [];
}

describe("C17: take entries name their owner and carry no employee number", () => {
  const roster = readSampleRoster();
  const rosterNumbers = [...roster.operators, ...roster.supervisors].map((person) => person.employeeNumber);

  async function takeFor104417(): Promise<TakeBody[]> {
    const body = await shiftsFor("104417");
    return body.take as TakeBody[];
  }

  test("every take entry has a non-empty string ownerName", async () => {
    const take = await takeFor104417();
    expect(take.length).toBeGreaterThan(0);
    for (const entry of take) {
      expect(typeof entry.ownerName, entry.shiftId).toBe("string");
      expect((entry.ownerName as string).length, entry.shiftId).toBeGreaterThan(0);
    }
  });

  test("CDU-CON1-0319-N is Luis Fontenot's and FCC-CON1-0318-D is Nadia Trahan's", async () => {
    const take = await takeFor104417();
    expect(take.find((entry) => entry.shiftId === "CDU-CON1-0319-N")?.ownerName).toBe("Luis Fontenot");
    expect(take.find((entry) => entry.shiftId === "FCC-CON1-0318-D")?.ownerName).toBe("Nadia Trahan");
  });

  test("each ownerName is the roster operator's name for that shift's employeeNumber", async () => {
    const take = await takeFor104417();
    for (const entry of take) {
      const rosterShift = roster.shifts.find((shift) => shift.shiftId === entry.shiftId);
      expect(rosterShift, entry.shiftId).toBeDefined();
      const operator = roster.operators.find((candidate) => candidate.employeeNumber === rosterShift?.employeeNumber);
      expect(operator, entry.shiftId).toBeDefined();
      expect(entry.ownerName, entry.shiftId).toBe(operator?.name);
    }
  });

  test("no take entry has an employeeNumber property", async () => {
    const take = await takeFor104417();
    for (const entry of take) {
      expect(entry).not.toHaveProperty("employeeNumber");
    }
  });

  test("no value in the take list equals a roster operator or supervisor number", async () => {
    const take = await takeFor104417();
    expect(rosterNumbers).toHaveLength(10);
    const found = leafValues(take).filter((value) => rosterNumbers.includes(value));
    expect(found).toEqual([]);
  });

  test("positive control: the same scan finds an employee number injected into an entry", async () => {
    const take = await takeFor104417();
    const first = take[0];
    expect(first).toBeDefined();
    const injected = [{ ...first, extra: { nested: [rosterNumbers[0]] } }, ...take.slice(1)];
    expect(leafValues(injected).filter((value) => rosterNumbers.includes(value))).toEqual([rosterNumbers[0]]);

    const asNumber = [{ ...first, extra: Number(rosterNumbers[1]) }];
    expect(leafValues(asNumber).filter((value) => rosterNumbers.includes(value))).toEqual([rosterNumbers[1]]);
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
