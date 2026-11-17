import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance, InjectOptions } from "fastify";
import fc from "fast-check";
import { afterAll, afterEach, describe, expect, test } from "vitest";
import { buildApp, type BuildAppOptions } from "./app";
import { devUsers, exportStamp, listedShifts, operatorNames, operatorNumbers, refusalShifts } from "./roster";
import { headersFor, readSampleRoster, readSampleRosterRaw } from "./test-support";

// The roster is read on every request. A roster that cannot be read, or has no operators array,
// is a 503 `roster-unavailable` that names neither the path nor the file content (NFR-PRIV-001).

const ROSTER_UNAVAILABLE = { code: "roster-unavailable" };
const OPERATOR = "104417";
const SWAP_BODY = { giveShiftId: "CDU-CON1-0318-N", takeShiftId: "CDU-CON1-0319-N" };

// Created at load because the cases below are generated while the file is collected.
const tempRoot = mkdtempSync(path.join(tmpdir(), "shiftswap-roster-source-"));

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function appWith(options: BuildAppOptions): FastifyInstance {
  const app = buildApp(options);
  apps.push(app);
  return app;
}

function getShifts(app: FastifyInstance, headers: Record<string, string> = headersFor(OPERATOR)) {
  return app.inject({ method: "GET", url: "/api/shifts", headers });
}

function postSwapCheck(app: FastifyInstance, headers: Record<string, string> = headersFor(OPERATOR)) {
  const options: InjectOptions = { method: "POST", url: "/api/swap-checks", headers, payload: SWAP_BODY };
  return app.inject(options);
}

/** A fresh copy of the sample roster as a raw JSON object. */
function rawSample(): Record<string, unknown> {
  const raw = readSampleRosterRaw();
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("the sample roster is not a JSON object");
  }
  return Object.fromEntries(Object.entries(raw));
}

/** The sample roster with the given top-level keys replaced. */
function sampleWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...rawSample(), ...overrides };
}

/** The sample roster with one top-level key removed. */
function sampleWithout(key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(rawSample()).filter(([name]) => name !== key));
}

function writeRoster(file: string, roster: unknown): void {
  writeFileSync(file, JSON.stringify(roster), "utf8");
}

interface Unavailable {
  label: string;
  /** The path the roster is read from. */
  target: string;
}

function unavailableRosters(): Unavailable[] {
  const dir = path.join(tempRoot, "roster-is-a-directory.json");
  mkdirSync(dir, { recursive: true });
  const invalid = path.join(tempRoot, "roster-not-json-SECRET.json");
  writeFileSync(invalid, '{ "operators": [ "leaky-content-marker" ', "utf8");
  return [
    { label: "a missing file", target: path.join(tempRoot, "no-such-roster.json") },
    { label: "a directory", target: dir },
    { label: "a file with invalid JSON", target: invalid },
  ];
}

describe("criterion 17: an unreadable roster is 503 roster-unavailable", () => {
  for (const { label, target } of unavailableRosters()) {
    describe(`roster path is ${label}`, () => {
      function expectUnavailable(response: { statusCode: number; body: string }): void {
        expect(response.statusCode).toBe(503);
        expect(JSON.parse(response.body)).toEqual(ROSTER_UNAVAILABLE);
        expect(JSON.parse(response.body)).not.toHaveProperty("outcome");
        expect(response.body).not.toContain(target);
        expect(response.body).not.toContain(path.basename(target));
        expect(response.body).not.toContain("leaky-content-marker");
      }

      test("GET /api/shifts", async () => {
        expectUnavailable(await getShifts(appWith({ rosterPath: target })));
      });

      test("POST /api/swap-checks", async () => {
        expectUnavailable(await postSwapCheck(appWith({ rosterPath: target })));
      });

      test("GET /api/dev/users", async () => {
        const response = await appWith({ rosterPath: target }).inject({ method: "GET", url: "/api/dev/users" });
        expectUnavailable(response);
      });
    });
  }
});

describe("identity checks come before the roster read", () => {
  const missing = (): string => path.join(tempRoot, "never-written.json");

  test("no headers is 401 on GET /api/shifts and POST /api/swap-checks", async () => {
    const app = appWith({ rosterPath: missing() });
    for (const response of [await getShifts(app, {}), await postSwapCheck(app, {})]) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({ kind: "unauthenticated" });
    }
  });

  test("a non-operator role is 403 role-not-permitted on GET /api/shifts and POST /api/swap-checks", async () => {
    const app = appWith({ rosterPath: missing() });
    const headers = headersFor(OPERATOR, "shift-supervisor");
    for (const response of [await getShifts(app, headers), await postSwapCheck(app, headers)]) {
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ kind: "forbidden", code: "role-not-permitted" });
    }
  });
});

describe("health does not depend on the roster", () => {
  test("buildApp succeeds with a missing file, and /api/healthz is 200 with no identity", async () => {
    let app: FastifyInstance | undefined;
    expect(() => {
      app = appWith({ rosterPath: path.join(tempRoot, "absent-at-startup.json") });
    }).not.toThrow();
    if (app === undefined) {
      throw new Error("buildApp did not return an app");
    }
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/api/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  test("/api/healthz is 200 when the roster path is a directory or invalid JSON", async () => {
    for (const { target } of unavailableRosters().slice(1)) {
      const response = await appWith({ rosterPath: target }).inject({ method: "GET", url: "/api/healthz" });
      expect(response.statusCode).toBe(200);
    }
  });
});

describe("the roster is read on every request", () => {
  interface GiveBody {
    exportedAt: string | null;
    give: { shiftId: string }[];
  }

  test("a rewritten file shows in the next response", async () => {
    const file = path.join(tempRoot, "rewritten.json");
    const sample = readSampleRoster();
    writeRoster(file, sample);
    const app = appWith({ rosterPath: file });

    const before = (await getShifts(app)).json<GiveBody>();
    expect(before.give).toHaveLength(11);
    expect(before.exportedAt).toBe(sample.exportedAt);
    const dropped = before.give[0]?.shiftId;
    expect(dropped).toBeDefined();

    writeRoster(file, {
      ...sample,
      exportedAt: "2027-03-07T09:30:00Z",
      shifts: sample.shifts.filter((shift) => shift.shiftId !== dropped),
    });

    const after = (await getShifts(app)).json<GiveBody>();
    expect(after.give).toHaveLength(10);
    expect(after.give.map((shift) => shift.shiftId)).not.toContain(dropped);
    expect(after.exportedAt).toBe("2027-03-07T09:30:00Z");
  });

  test("deleting the file gives 503, and restoring it gives 200 again", async () => {
    const file = path.join(tempRoot, "deleted-then-restored.json");
    writeRoster(file, readSampleRoster());
    const app = appWith({ rosterPath: file });
    expect((await getShifts(app)).statusCode).toBe(200);

    rmSync(file);
    const gone = await getShifts(app);
    expect(gone.statusCode).toBe(503);
    expect(gone.json()).toEqual(ROSTER_UNAVAILABLE);

    writeRoster(file, readSampleRoster());
    expect((await getShifts(app)).statusCode).toBe(200);
  });

  test("a file corrupted after startup gives 503 on POST /api/swap-checks", async () => {
    const file = path.join(tempRoot, "corrupted.json");
    writeRoster(file, readSampleRoster());
    const app = appWith({ rosterPath: file });
    expect((await postSwapCheck(app)).statusCode).toBe(501);

    writeFileSync(file, "{ not json", "utf8");
    const response = await postSwapCheck(app);
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual(ROSTER_UNAVAILABLE);
  });
});

describe("a parseable roster without an operators array cannot establish identity", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["absent", sampleWithout("operators")],
    ["an empty object", sampleWith({ operators: {} })],
    ["a string", sampleWith({ operators: "x" })],
    ["null", sampleWith({ operators: null })],
  ];

  for (const [label, roster] of cases) {
    test(`operators is ${label}: 503 on GET /api/shifts and POST /api/swap-checks`, async () => {
      const app = appWith({ roster });
      for (const response of [await getShifts(app), await postSwapCheck(app)]) {
        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual(ROSTER_UNAVAILABLE);
      }
    });
  }

  test("the raw roster is `{}`: 503", async () => {
    const response = await getShifts(appWith({ roster: {} }));
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual(ROSTER_UNAVAILABLE);
  });

  test("an operators array that lacks the caller is still 403 not-a-roster-operator", async () => {
    const app = appWith({ roster: sampleWith({ operators: [] }) });
    for (const response of [await getShifts(app), await postSwapCheck(app)]) {
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ kind: "forbidden", code: "not-a-roster-operator" });
    }
  });
});

describe("a parseable roster with an unrenderable export time", () => {
  const cases: [string, Record<string, unknown>][] = [
    ["exportedAt is missing", sampleWithout("exportedAt")],
    ["site.timeZone is Mars/Olympus", sampleWith({ site: { ...readSampleRoster().site, timeZone: "Mars/Olympus" } })],
  ];

  for (const [label, roster] of cases) {
    test(`${label}: 200, all four stamp fields null, shifts still listed`, async () => {
      const response = await getShifts(appWith({ roster }));
      expect(response.statusCode).toBe(200);
      const body = response.json<Record<string, unknown> & { give: unknown[]; take: unknown[] }>();
      expect(body["exportedAt"]).toBeNull();
      expect(body["exportedAtUtcMinute"]).toBeNull();
      expect(body["exportedAtSiteLocal"]).toBeNull();
      expect(body["siteTimeZone"]).toBeNull();
      expect(body.give).toHaveLength(11);
      expect(body.take.length).toBeGreaterThan(0);
    });
  }
});

describe("the tolerant roster extractors", () => {
  describe("refusalShifts", () => {
    test("skips non-object entries and entries without a string shiftId", () => {
      const index = refusalShifts({
        shifts: [null, 7, "x", [], { shiftId: 5 }, { unit: "CDU" }, { shiftId: "A", unit: "CDU", employeeNumber: "1" }],
      });
      expect([...index.keys()]).toEqual(["A"]);
    });

    test("keeps a shift with a missing or non-string owner or unit", () => {
      const index = refusalShifts({ shifts: [{ shiftId: "B" }, { shiftId: "C", unit: 3, employeeNumber: 9 }] });
      expect(index.get("B")).toEqual({ shiftId: "B", unit: undefined, employeeNumber: undefined });
      expect(index.get("C")).toEqual({ shiftId: "C", unit: 3, employeeNumber: 9 });
    });

    test("the first duplicate shiftId wins", () => {
      const index = refusalShifts({
        shifts: [
          { shiftId: "A", unit: "CDU", employeeNumber: "1" },
          { shiftId: "A", unit: "HCU", employeeNumber: "2" },
        ],
      });
      expect(index.size).toBe(1);
      expect(index.get("A")).toEqual({ shiftId: "A", unit: "CDU", employeeNumber: "1" });
    });

    test("a roster without a shifts array is empty", () => {
      expect(refusalShifts({}).size).toBe(0);
      expect(refusalShifts({ shifts: "x" }).size).toBe(0);
      expect(refusalShifts(null).size).toBe(0);
    });
  });

  describe("listedShifts", () => {
    const complete = { unit: "CDU", role: "CON1", start: "2027-03-08T18:00", end: "2027-03-09T06:00", employeeNumber: "1" };

    test("skips non-objects and shifts with a non-string field", () => {
      const shifts = listedShifts({
        shifts: [
          null,
          "x",
          { shiftId: "A", ...complete },
          { shiftId: "B", ...complete, role: 4 },
          { shiftId: "C", ...complete, employeeNumber: undefined },
          { shiftId: "D", ...complete, end: null },
        ],
      });
      expect(shifts.map((shift) => shift.shiftId)).toEqual(["A"]);
    });

    test("the first duplicate shiftId wins, even if it is incomplete", () => {
      const shifts = listedShifts({
        shifts: [
          { shiftId: "A", ...complete, unit: "CDU" },
          { shiftId: "A", ...complete, unit: "HCU" },
          { shiftId: "B", ...complete, unit: 1 },
          { shiftId: "B", ...complete },
        ],
      });
      expect(shifts).toEqual([{ shiftId: "A", ...complete, unit: "CDU" }]);
    });
  });

  describe("operatorNumbers", () => {
    test("is undefined when operators is absent or not an array", () => {
      for (const raw of [{}, null, 5, "x", [], { operators: {} }, { operators: "x" }, { operators: null }]) {
        expect(operatorNumbers(raw)).toBeUndefined();
      }
    });

    test("skips non-objects and operators without a string employeeNumber", () => {
      const numbers = operatorNumbers({
        operators: [null, 3, "104417", [], {}, { employeeNumber: 104417 }, { employeeNumber: "1" }, { employeeNumber: "2", name: 5 }],
      });
      expect(numbers).toEqual(new Set(["1", "2"]));
    });

    test("an empty operators array is an empty set, not undefined", () => {
      expect(operatorNumbers({ operators: [] })).toEqual(new Set());
    });
  });

  describe("operatorNames", () => {
    test("skips malformed entries and the first duplicate employeeNumber wins", () => {
      const names = operatorNames({
        operators: [
          null,
          "x",
          { employeeNumber: "1" },
          { employeeNumber: 2, name: "Numeric" },
          { employeeNumber: "3", name: "First" },
          { employeeNumber: "3", name: "Second" },
          { employeeNumber: "4", name: 9 },
        ],
      });
      expect(names).toEqual(new Map([["3", "First"]]));
    });

    test("is empty when operators is not an array", () => {
      expect(operatorNames({ operators: "x" }).size).toBe(0);
      expect(operatorNames(undefined).size).toBe(0);
    });
  });

  describe("devUsers", () => {
    test("lists operators then supervisors, skipping malformed entries", () => {
      const users = devUsers({
        operators: [null, { employeeNumber: "1", name: "Op One" }, { employeeNumber: "2" }, 4],
        supervisors: ["x", { employeeNumber: "9", name: "Sup Nine" }, { name: "No Number" }],
      });
      expect(users).toEqual([
        { employeeNumber: "1", name: "Op One", roles: ["operator"] },
        { employeeNumber: "9", name: "Sup Nine", roles: ["shift-supervisor"] },
      ]);
    });

    test("the first duplicate employeeNumber wins", () => {
      const users = devUsers({
        operators: [
          { employeeNumber: "1", name: "First" },
          { employeeNumber: "1", name: "Second" },
        ],
        supervisors: [
          { employeeNumber: "9", name: "First Sup" },
          { employeeNumber: "9", name: "Second Sup" },
        ],
      });
      expect(users.map((user) => user.name)).toEqual(["First", "First Sup"]);
    });

    test("is empty when neither list is an array", () => {
      expect(devUsers({ operators: {}, supervisors: "x" })).toEqual([]);
    });
  });

  describe("exportStamp", () => {
    const allNull = { exportedAt: null, exportedAtUtcMinute: null, exportedAtSiteLocal: null, siteTimeZone: null };

    test("renders the sample roster's stamp", () => {
      expect(exportStamp(readSampleRosterRaw())).toEqual({
        exportedAt: "2027-03-07T08:00:00Z",
        exportedAtUtcMinute: "2027-03-07T08:00Z",
        exportedAtSiteLocal: "2027-03-07T02:00",
        siteTimeZone: "America/Chicago",
      });
    });

    test("is all null for a bad time zone", () => {
      expect(exportStamp({ exportedAt: "2027-03-07T08:00:00Z", site: { timeZone: "Mars/Olympus" } })).toEqual(allNull);
    });

    test("is all null when exportedAt or the time zone is missing or not a string", () => {
      expect(exportStamp({ site: { timeZone: "America/Chicago" } })).toEqual(allNull);
      expect(exportStamp({ exportedAt: "2027-03-07T08:00:00Z" })).toEqual(allNull);
      expect(exportStamp({ exportedAt: 5, site: { timeZone: "America/Chicago" } })).toEqual(allNull);
      expect(exportStamp({ exportedAt: "2027-03-07T08:00:00Z", site: { timeZone: 5 } })).toEqual(allNull);
      expect(exportStamp(null)).toEqual(allNull);
    });
  });

  describe("none of them throws, whatever the roster is", () => {
    function runAll(raw: unknown): void {
      expect(() => refusalShifts(raw)).not.toThrow();
      expect(() => listedShifts(raw)).not.toThrow();
      expect(() => operatorNumbers(raw)).not.toThrow();
      expect(() => operatorNames(raw)).not.toThrow();
      expect(() => devUsers(raw)).not.toThrow();
      expect(() => exportStamp(raw)).not.toThrow();
    }

    test("for any JSON value", () => {
      fc.assert(fc.property(fc.jsonValue(), runAll));
    });

    test("for any value at all", () => {
      fc.assert(fc.property(fc.anything(), runAll));
    });

    test("for any JSON value in the top-level fields they read", () => {
      fc.assert(
        fc.property(
          fc.record({
            shifts: fc.jsonValue(),
            operators: fc.jsonValue(),
            supervisors: fc.jsonValue(),
            exportedAt: fc.jsonValue(),
            site: fc.jsonValue(),
          }),
          runAll,
        ),
      );
    });
  });
});
