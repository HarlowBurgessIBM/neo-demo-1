import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { FastifyInstance, InjectOptions, LightMyRequestResponse, RouteOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildApp, type BuildAppOptions } from "./app";
import type { CannotBeApprovedBody } from "./swap-result";
import {
  failListingRoster,
  fixedNow,
  headersFor,
  readSampleRoster,
  readSampleRosterRaw,
  SAMPLE_NOW_ISO,
  STEP_1,
  STEP_2,
  STEP_3,
  STEP_4,
  STEP_6,
  unchangedShiftQualificationRoster,
  type SwapPick,
} from "./test-support";

// C13 and NFR-PRIV-001: a log-capture harness over every route, with a positive control, finds
// zero employee names or numbers in log output. It also covers the swap-check gate outcomes
// (Step 7, ADD-3 and the malformed-roster fixtures), the cannot-be-approved outcomes (Steps 3, 4
// and 6, the fail-listing fixture and the unchanged-shift § 3.3 fixture) and the
// roster-unavailable 503.

const MAYA = "104417";
const LUIS = "102286";
const RENEE = "100231";
const NOT_ON_ROSTER = "999999";

/** The request body for a pick. */
function payloadOf(pick: SwapPick): { giveShiftId: string; takeShiftId: string } {
  return { giveShiftId: pick.give, takeShiftId: pick.take };
}

const STEP_8 = { giveShiftId: "CDU-CON1-0318-N", takeShiftId: "FCC-CON1-0318-D" };
/** Step 7's pick is the same pair as Step 1: only the clock differs. */
const STEP_7 = payloadOf(STEP_1);
const STEP_7_NOW_ISO = "2027-03-08T12:00:00Z";
const ADD_3 = { giveShiftId: "CDU-FLD1-0318-D", takeShiftId: "CDU-CON1-0326-D" };
const ADD_3_CALLER = "108529";
const ADD_3_NOW_ISO = "2027-03-07T14:00:00Z";
const BEFORE_EXPORT_NOW_ISO = "2027-03-07T07:59:59Z";

/** A pino-compatible destination that keeps every line written to it. */
interface Capture {
  lines: string[];
  stream: { write(line: string): void };
}

function newCapture(): Capture {
  const lines: string[] = [];
  return {
    lines,
    stream: {
      write(line: string): void {
        lines.push(line);
      },
    },
  };
}

/** Something personal that must not appear in a log line. */
interface PersonalValue {
  kind: "employee number" | "name" | "surname";
  value: string;
}

function personalValues(): PersonalValue[] {
  const roster = readSampleRoster();
  const people = [...roster.operators, ...roster.supervisors];
  const fromPeople = people.flatMap((person): PersonalValue[] => [
    { kind: "employee number", value: person.employeeNumber },
    { kind: "name", value: person.name },
    // The surname alone is distinctive, and catches "Last, First" and "first.last" forms.
    { kind: "surname", value: person.name.split(" ").at(-1) ?? person.name },
  ]);
  // Every number a shift holds, including any that is not a listed person.
  const known = new Set(people.map((person) => person.employeeNumber));
  const fromShifts = [...new Set(roster.shifts.map((shift) => shift.employeeNumber))]
    .filter((employeeNumber) => !known.has(employeeNumber))
    .map((employeeNumber): PersonalValue => ({ kind: "employee number", value: employeeNumber }));
  return [...fromPeople, ...fromShifts];
}

/** A fresh, mutable copy of the sample roster as raw JSON, for building a fixture. */
function sampleRosterCopy(): Record<string, unknown> {
  return readSampleRosterRaw() as Record<string, unknown>;
}

function operatorsOf(roster: Record<string, unknown>): Record<string, unknown>[] {
  return roster["operators"] as Record<string, unknown>[];
}

/** A roster scenario: the app options that make it, the exercise that runs against it. */
interface Scenario {
  name: string;
  options: Pick<BuildAppOptions, "roster" | "rosterPath">;
  nowIso: string;
  run: (app: FastifyInstance) => Promise<void>;
}

/**
 * The personal values found in `lines`. An employee number matches as a whole number, so a
 * timestamp or a response time that happens to contain the digits is not a hit: it must not
 * follow a digit or a digit-then-dot (a decimal fraction such as 0.104417), nor precede a digit.
 * A number after any other dot, such as `user.104417`, is a hit. A full name matches ignoring
 * case; a surname matches ignoring case, as a whole word.
 */
function findPersonalData(lines: readonly string[], values: readonly PersonalValue[]): string[] {
  const hits: string[] = [];
  for (const line of lines) {
    for (const { kind, value } of values) {
      let found: boolean;
      if (kind === "employee number") {
        found = new RegExp(`(?<!\\d\\.?)${value}(?!\\d)`).test(line);
      } else if (kind === "surname") {
        found = new RegExp(`\\b${value}\\b`, "i").test(line);
      } else {
        found = line.toLowerCase().includes(value.toLowerCase());
      }
      if (found) {
        hits.push(`${kind} ${value} in log line: ${line.trim()}`);
      }
    }
  }
  return hits;
}

function loggedApp(
  capture: Capture,
  nodeEnv: string | undefined,
  onRoute: (route: RouteOptions) => void,
  extra: Pick<BuildAppOptions, "roster" | "rosterPath"> & { nowIso?: string } = {},
): FastifyInstance {
  const { nowIso, ...rosterOptions } = extra;
  return buildApp({
    nodeEnv,
    onRoute,
    ...rosterOptions,
    now: fixedNow(nowIso ?? SAMPLE_NOW_ISO),
    fastify: { logger: { level: "trace", stream: capture.stream } },
  });
}

type Exercise = (app: FastifyInstance) => Promise<void>;

describe("C13: log privacy across every route (NFR-PRIV-001)", () => {
  const values = personalValues();
  const registered = new Set<string>();
  const statuses = new Set<number>();
  /** Every non-null `ownerName` returned by GET /api/shifts during the run. */
  const ownerNamesSeen = new Set<string>();
  const devCapture = newCapture();
  const productionCapture = newCapture();
  const scenarioCapture = newCapture();
  /** A path no file exists at. Its full path and basename must never reach a log line. */
  const missingRosterName = `shiftswap-missing-roster-${randomUUID()}.json`;
  const missingRosterPath = path.join(os.tmpdir(), missingRosterName);
  let devApp: FastifyInstance;
  let productionApp: FastifyInstance;
  const scenarioApps: FastifyInstance[] = [];
  /** Lines captured by every app before the positive control writes anything. */
  let beforeProbe: string[];

  function recordRoute(route: RouteOptions): void {
    const methods: string[] = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      registered.add(`${method} ${route.url}`);
    }
  }

  function recordOwnerNames(response: LightMyRequestResponse): void {
    const body: unknown = response.json();
    const take = typeof body === "object" && body !== null ? (body as { take?: unknown }).take : undefined;
    if (!Array.isArray(take)) {
      return;
    }
    for (const entry of take as { ownerName?: unknown }[]) {
      if (typeof entry.ownerName === "string") {
        ownerNamesSeen.add(entry.ownerName);
      }
    }
  }

  async function call(app: FastifyInstance, options: InjectOptions, expected: number): Promise<LightMyRequestResponse> {
    const response = await app.inject(options);
    expect(response.statusCode, `${options.method ?? "GET"} ${String(options.url)}`).toBe(expected);
    statuses.add(response.statusCode);
    if (options.url === "/api/shifts" && response.statusCode === 200) {
      recordOwnerNames(response);
    }
    return response;
  }

  /** POST /api/swap-checks as `caller`; expects 200 `cannot-determine`. */
  async function expectCannotDetermine(
    app: FastifyInstance,
    pick: { giveShiftId: string; takeShiftId: string },
    caller: string,
  ): Promise<void> {
    const response = await call(
      app,
      { method: "POST", url: "/api/swap-checks", headers: headersFor(caller), payload: pick },
      200,
    );
    expect(response.json<{ outcome?: unknown }>().outcome).toBe("cannot-determine");
  }

  /**
   * POST /api/swap-checks as the pick's caller; expects 200 `cannot-be-approved` with exactly the
   * `expected` findings, in employee order (give-shift-owner, then take-shift-owner). The
   * assertion keeps a scenario from passing the privacy scan on a response that is not the one
   * it is meant to exercise, such as a 501.
   */
  async function expectCannotBeApproved(
    app: FastifyInstance,
    pick: SwapPick,
    expected: { party: string; rule: string; changedBySwap: boolean }[],
  ): Promise<void> {
    const response = await call(
      app,
      { method: "POST", url: "/api/swap-checks", headers: headersFor(pick.caller), payload: payloadOf(pick) },
      200,
    );
    const body = response.json<CannotBeApprovedBody>();
    expect(body.outcome).toBe("cannot-be-approved");
    const found = body.employees.flatMap((employee) =>
      employee.findings.map((finding) => ({
        party: employee.party,
        rule: finding.rule,
        changedBySwap: finding.changedBySwap,
      })),
    );
    expect(found).toEqual(expected);
  }

  async function expectRosterUnavailable(app: FastifyInstance, options: InjectOptions): Promise<void> {
    const response = await call(app, options, 503);
    expect(response.json<{ code?: unknown }>().code).toBe("roster-unavailable");
  }

  const shiftsGet: InjectOptions = { method: "GET", url: "/api/shifts", headers: headersFor(MAYA) };
  const swapPost: InjectOptions = {
    method: "POST",
    url: "/api/swap-checks",
    headers: headersFor(MAYA),
    payload: payloadOf(STEP_1),
  };

  const scenarios: Scenario[] = [
    {
      name: "Step 3: a § 3.1 finding on the take shift owner",
      options: {},
      nowIso: SAMPLE_NOW_ISO,
      run: (app) =>
        expectCannotBeApproved(app, STEP_3, [{ party: "take-shift-owner", rule: "3.1", changedBySwap: true }]),
    },
    {
      name: "Step 4: a § 3.1 finding on the give shift owner across the clock change",
      options: {},
      nowIso: SAMPLE_NOW_ISO,
      run: (app) =>
        expectCannotBeApproved(app, STEP_4, [{ party: "give-shift-owner", rule: "3.1", changedBySwap: true }]),
    },
    {
      name: "Step 6: a § 3.3 finding on the give shift owner",
      options: {},
      nowIso: SAMPLE_NOW_ISO,
      run: (app) =>
        expectCannotBeApproved(app, STEP_6, [{ party: "give-shift-owner", rule: "3.3", changedBySwap: true }]),
    },
    {
      name: "fail-listing roster: a § 3.1 finding on the take shift owner and a § 3.3 finding on the give shift owner",
      options: { roster: failListingRoster() },
      nowIso: SAMPLE_NOW_ISO,
      run: (app) =>
        expectCannotBeApproved(app, STEP_6, [
          { party: "give-shift-owner", rule: "3.3", changedBySwap: true },
          { party: "take-shift-owner", rule: "3.1", changedBySwap: true },
        ]),
    },
    {
      name: "unchanged-shift § 3.3 roster: a finding on a shift the swap did not touch",
      options: { roster: unchangedShiftQualificationRoster() },
      nowIso: SAMPLE_NOW_ISO,
      run: (app) =>
        expectCannotBeApproved(app, STEP_2, [{ party: "take-shift-owner", rule: "3.3", changedBySwap: false }]),
    },
    {
      name: "Step 7: the clock is a day after the export",
      options: {},
      nowIso: STEP_7_NOW_ISO,
      run: (app) => expectCannotDetermine(app, STEP_7, MAYA),
    },
    {
      name: "ADD-3: a give shift on a unit outside the caller's qualifications",
      options: {},
      nowIso: ADD_3_NOW_ISO,
      run: (app) => expectCannotDetermine(app, ADD_3, ADD_3_CALLER),
    },
    {
      name: "missing export field",
      options: {
        roster: (() => {
          const roster = sampleRosterCopy();
          delete roster["exportedAt"];
          return roster;
        })(),
      },
      nowIso: SAMPLE_NOW_ISO,
      run: (app) => expectCannotDetermine(app, STEP_7, MAYA),
    },
    {
      name: "missing record: an operator with no qualifications",
      options: {
        roster: (() => {
          const roster = sampleRosterCopy();
          const luis = operatorsOf(roster).find((operator) => operator["employeeNumber"] === LUIS);
          if (luis === undefined) {
            throw new Error("fixture: operator not found");
          }
          delete luis["qualifications"];
          return roster;
        })(),
      },
      nowIso: SAMPLE_NOW_ISO,
      run: (app) => expectCannotDetermine(app, STEP_7, MAYA),
    },
    {
      name: "now before the export",
      options: {},
      nowIso: BEFORE_EXPORT_NOW_ISO,
      run: (app) => expectCannotDetermine(app, STEP_7, MAYA),
    },
    {
      name: "invalid time zone",
      options: {
        roster: (() => {
          const roster = sampleRosterCopy();
          (roster["site"] as Record<string, unknown>)["timeZone"] = "Mars/Olympus";
          return roster;
        })(),
      },
      nowIso: SAMPLE_NOW_ISO,
      run: async (app) => {
        await expectCannotDetermine(app, STEP_7, MAYA);
        const response = await call(app, shiftsGet, 200);
        expect(response.json<{ exportedAtSiteLocal?: unknown }>().exportedAtSiteLocal).toBeNull();
      },
    },
    {
      name: "503: the roster file is unavailable",
      options: { rosterPath: missingRosterPath },
      nowIso: SAMPLE_NOW_ISO,
      run: async (app) => {
        await expectRosterUnavailable(app, shiftsGet);
        await expectRosterUnavailable(app, swapPost);
        await expectRosterUnavailable(app, { method: "GET", url: "/api/dev/users" });
      },
    },
    {
      name: "503: operators is absent",
      options: {
        roster: (() => {
          const roster = sampleRosterCopy();
          delete roster["operators"];
          return roster;
        })(),
      },
      nowIso: SAMPLE_NOW_ISO,
      run: async (app) => {
        await expectRosterUnavailable(app, shiftsGet);
        await expectRosterUnavailable(app, swapPost);
      },
    },
    {
      name: "503: operators is not an array",
      options: { roster: { ...sampleRosterCopy(), operators: {} } },
      nowIso: SAMPLE_NOW_ISO,
      run: async (app) => {
        await expectRosterUnavailable(app, shiftsGet);
        await expectRosterUnavailable(app, swapPost);
      },
    },
  ];

  // One exercise per route. A route registered without an entry here fails the coverage test.
  const exercises: Record<string, Exercise> = {
    "GET /api/healthz": async (app) => {
      await call(app, { method: "GET", url: "/api/healthz" }, 200);
    },
    "GET /api/shifts": async (app) => {
      await call(app, { method: "GET", url: "/api/shifts", headers: headersFor(MAYA) }, 200);
      await call(app, { method: "GET", url: "/api/shifts", headers: headersFor(LUIS) }, 200);
      await call(app, { method: "GET", url: "/api/shifts" }, 401);
      await call(app, { method: "GET", url: "/api/shifts", headers: headersFor(NOT_ON_ROSTER) }, 403);
      await call(app, { method: "GET", url: "/api/shifts", headers: headersFor(RENEE, "shift-supervisor") }, 403);
    },
    "POST /api/swap-checks": async (app) => {
      const post = (payload: object, headers: Record<string, string | string[]>, expected: number) =>
        call(app, { method: "POST", url: "/api/swap-checks", headers, payload }, expected);
      await post(payloadOf(STEP_1), headersFor(MAYA), 501);
      await post(STEP_8, headersFor(MAYA), 422);
      await post({ giveShiftId: "CDU-CON1-0319-N", takeShiftId: "CDU-CON1-0316-D" }, headersFor(MAYA), 403);
      await post({ giveShiftId: "CDU-CON1-0318-N", takeShiftId: "CDU-CON1-9999-N" }, headersFor(MAYA), 422);
      await post({ giveShiftId: {} }, headersFor(MAYA), 400);
      await post(payloadOf(STEP_1), { "x-employee-number": [MAYA, MAYA], "x-roles": "operator" }, 401);
    },
    "GET /api/dev/users": async (app) => {
      await call(app, { method: "GET", url: "/api/dev/users" }, 200);
    },
  };

  beforeAll(async () => {
    devApp = loggedApp(devCapture, undefined, recordRoute);
    productionApp = loggedApp(productionCapture, "production", recordRoute);
    await devApp.ready();
    await productionApp.ready();

    for (const exercise of Object.values(exercises)) {
      await exercise(devApp);
    }
    await call(devApp, { method: "GET", url: "/api/no-such-route" }, 404);
    // Absent in production: 404. Its logs are scanned too.
    await call(productionApp, { method: "GET", url: "/api/dev/users" }, 404);
    await call(productionApp, { method: "GET", url: "/api/healthz" }, 200);

    // Each scenario has its own app, so its roster and clock differ. All share one log capture and
    // register their routes into the same collection, so every route is enumerated across all apps.
    for (const scenario of scenarios) {
      const app = loggedApp(scenarioCapture, undefined, recordRoute, { ...scenario.options, nowIso: scenario.nowIso });
      scenarioApps.push(app);
      await app.ready();
      await scenario.run(app);
    }

    beforeProbe = [...devCapture.lines, ...productionCapture.lines, ...scenarioCapture.lines];
  });

  afterAll(async () => {
    await devApp.close();
    await productionApp.close();
    for (const app of scenarioApps) {
      await app.close();
    }
  });

  test("the roster supplies the people to look for: 8 operators and 2 supervisors", () => {
    const roster = readSampleRoster();
    expect(roster.operators).toHaveLength(8);
    expect(roster.supervisors).toHaveLength(2);
    // Per person: an employee number, a full name and a surname. Every shift holder is a person.
    expect(values).toHaveLength(30);
    expect(values.filter((entry) => entry.kind === "surname").map((entry) => entry.value)).toContain("Thibodeaux");
  });

  test("the scanned set holds every sample operator and supervisor name and employee number, and every shift holder", () => {
    const roster = readSampleRoster();
    const scannedNames = new Set(values.filter((entry) => entry.kind === "name").map((entry) => entry.value));
    const scannedNumbers = new Set(
      values.filter((entry) => entry.kind === "employee number").map((entry) => entry.value),
    );
    for (const person of [...roster.operators, ...roster.supervisors]) {
      expect(scannedNames.has(person.name), `name of ${person.employeeNumber} is not scanned`).toBe(true);
      expect(scannedNumbers.has(person.employeeNumber), `number ${person.employeeNumber} is not scanned`).toBe(true);
    }
    for (const shift of roster.shifts) {
      expect(scannedNumbers.has(shift.employeeNumber), `holder of ${shift.shiftId} is not scanned`).toBe(true);
    }
  });

  test("every ownerName returned in a shifts response during the run is in the scanned set", () => {
    const scannedNames = new Set(values.filter((entry) => entry.kind === "name").map((entry) => entry.value));
    expect(ownerNamesSeen.size).toBeGreaterThan(0);
    for (const ownerName of ownerNamesSeen) {
      expect(scannedNames.has(ownerName), `ownerName "${ownerName}" is not scanned`).toBe(true);
    }
  });

  test("the scenarios built one app each, all feeding the same route collection", () => {
    expect(scenarioApps).toHaveLength(scenarios.length);
    expect(scenarioCapture.lines.length).toBeGreaterThan(0);
    expect(registered.has("POST /api/swap-checks")).toBe(true);
  });

  test("the scenarios include Steps 3, 4 and 6, the fail-listing roster and the unchanged-shift § 3.3 roster", () => {
    const names = scenarios.map((scenario) => scenario.name);
    for (const prefix of ["Step 3:", "Step 4:", "Step 6:", "fail-listing roster:", "unchanged-shift § 3.3 roster:"]) {
      expect(
        names.some((name) => name.startsWith(prefix)),
        `no scenario starts with "${prefix}"`,
      ).toBe(true);
    }
  });

  test("the unavailable roster path and its basename appear in no captured log line", () => {
    const lines = [...devCapture.lines, ...productionCapture.lines, ...scenarioCapture.lines];
    expect(lines.filter((line) => line.includes(missingRosterName))).toEqual([]);
    expect(lines.filter((line) => line.includes(missingRosterPath))).toEqual([]);
  });

  test("the scenario apps' lines hold no employee number or name", () => {
    expect(scenarioCapture.lines.length).toBeGreaterThan(0);
    expect(findPersonalData(scenarioCapture.lines, values)).toEqual([]);
  });

  test("every registered route has an exercise", () => {
    expect(registered.size).toBeGreaterThan(0);
    const missing = [...registered].filter((key) => exercises[key] === undefined);
    expect(missing, `routes with no log-privacy exercise: ${missing.join(", ")}`).toEqual([]);
  });

  test("the exercises produced 200, 400, 401, 403, 404, 422, 501 and 503", () => {
    for (const status of [200, 400, 401, 403, 404, 422, 501, 503]) {
      expect(statuses.has(status), `status ${status} was not exercised`).toBe(true);
    }
  });

  test("the harness is wired up: every logger captured lines, including Fastify's request lines", () => {
    expect(devCapture.lines.length).toBeGreaterThan(0);
    expect(productionCapture.lines.length).toBeGreaterThan(0);
    expect(scenarioCapture.lines.some((line) => line.includes("incoming request"))).toBe(true);
    expect(devCapture.lines.some((line) => line.includes("incoming request"))).toBe(true);
    expect(devCapture.lines.some((line) => line.includes("request completed"))).toBe(true);
    expect(productionCapture.lines.some((line) => line.includes("incoming request"))).toBe(true);
  });

  test("no log line from any route holds an employee number or a name", () => {
    expect(beforeProbe.length).toBeGreaterThan(0);
    expect(findPersonalData(beforeProbe, values)).toEqual([]);
  });

  test("positive control: the scanner finds an employee number and a name written on purpose", () => {
    const probeStart = devCapture.lines.length;
    devApp.log.info("probe 104417");
    devApp.log.info({ who: "Maya Thibodeaux" }, "probe");
    const probeLines = devCapture.lines.slice(probeStart);

    expect(probeLines).toHaveLength(2);
    expect(findPersonalData([probeLines[0] ?? ""], values).join("\n")).toContain("employee number 104417");
    expect(findPersonalData([probeLines[1] ?? ""], values).join("\n")).toContain("name Maya Thibodeaux");
    // The probe lines are outside the snapshot the zero-hit scan used.
    expect(findPersonalData(beforeProbe, values)).toEqual([]);
  });

  test("positive control: the scanner finds a number after a dot, a surname alone and name variants", () => {
    const probeStart = devCapture.lines.length;
    devApp.log.info("op.104417");
    devApp.log.info("probe Thibodeaux");
    devApp.log.info("probe Thibodeaux, Maya");
    devApp.log.info("probe maya.thibodeaux");
    const probeLines = devCapture.lines.slice(probeStart);
    const scan = (index: number): string => findPersonalData([probeLines[index] ?? ""], values).join("\n");

    expect(probeLines).toHaveLength(4);
    expect(scan(0)).toContain("employee number 104417");
    expect(scan(1)).toContain("surname Thibodeaux");
    expect(scan(2)).toContain("surname Thibodeaux");
    expect(scan(3)).toContain("surname Thibodeaux");
  });

  test("the scanner skips a decimal fraction and a longer number, which are not employee numbers", () => {
    const lines = ["responseTime 0.104417", "id 1104417", "id 1044179"];
    expect(findPersonalData(lines, values)).toEqual([]);
  });
});
