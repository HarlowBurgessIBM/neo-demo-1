import type { FastifyInstance, InjectOptions, RouteOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildApp } from "./app";
import { fixedNow, headersFor, readSampleRoster, SAMPLE_NOW_ISO } from "./test-support";

// C13 and NFR-PRIV-001: a log-capture harness over every route, with a positive control, finds
// zero employee names or numbers in log output.

const MAYA = "104417";
const LUIS = "102286";
const RENEE = "100231";
const NOT_ON_ROSTER = "999999";

const STEP_1 = { giveShiftId: "CDU-CON1-0318-N", takeShiftId: "CDU-CON1-0319-N" };
const STEP_8 = { giveShiftId: "CDU-CON1-0318-N", takeShiftId: "FCC-CON1-0318-D" };

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
  return people.flatMap((person): PersonalValue[] => [
    { kind: "employee number", value: person.employeeNumber },
    { kind: "name", value: person.name },
    // The surname alone is distinctive, and catches "Last, First" and "first.last" forms.
    { kind: "surname", value: person.name.split(" ").at(-1) ?? person.name },
  ]);
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

function loggedApp(capture: Capture, nodeEnv: string | undefined, onRoute: (route: RouteOptions) => void): FastifyInstance {
  return buildApp({
    nodeEnv,
    onRoute,
    now: fixedNow(SAMPLE_NOW_ISO),
    fastify: { logger: { level: "trace", stream: capture.stream } },
  });
}

type Exercise = (app: FastifyInstance) => Promise<void>;

describe("C13: log privacy across every route (NFR-PRIV-001)", () => {
  const values = personalValues();
  const registered = new Set<string>();
  const statuses = new Set<number>();
  const devCapture = newCapture();
  const productionCapture = newCapture();
  let devApp: FastifyInstance;
  let productionApp: FastifyInstance;
  /** Lines captured by both apps before the positive control writes anything. */
  let beforeProbe: string[];

  function recordRoute(route: RouteOptions): void {
    const methods: string[] = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      registered.add(`${method} ${route.url}`);
    }
  }

  async function call(app: FastifyInstance, options: InjectOptions, expected: number): Promise<void> {
    const response = await app.inject(options);
    expect(response.statusCode, `${options.method ?? "GET"} ${String(options.url)}`).toBe(expected);
    statuses.add(response.statusCode);
  }

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
      await post(STEP_1, headersFor(MAYA), 501);
      await post(STEP_8, headersFor(MAYA), 422);
      await post({ giveShiftId: "CDU-CON1-0319-N", takeShiftId: "CDU-CON1-0316-D" }, headersFor(MAYA), 403);
      await post({ giveShiftId: "CDU-CON1-0318-N", takeShiftId: "CDU-CON1-9999-N" }, headersFor(MAYA), 422);
      await post({ giveShiftId: {} }, headersFor(MAYA), 400);
      await post(STEP_1, { "x-employee-number": [MAYA, MAYA], "x-roles": "operator" }, 401);
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

    beforeProbe = [...devCapture.lines, ...productionCapture.lines];
  });

  afterAll(async () => {
    await devApp.close();
    await productionApp.close();
  });

  test("the roster supplies the people to look for: 8 operators and 2 supervisors", () => {
    const roster = readSampleRoster();
    expect(roster.operators).toHaveLength(8);
    expect(roster.supervisors).toHaveLength(2);
    // Per person: an employee number, a full name and a surname.
    expect(values).toHaveLength(30);
    expect(values.filter((entry) => entry.kind === "surname").map((entry) => entry.value)).toContain("Thibodeaux");
  });

  test("every registered route has an exercise", () => {
    expect(registered.size).toBeGreaterThan(0);
    const missing = [...registered].filter((key) => exercises[key] === undefined);
    expect(missing, `routes with no log-privacy exercise: ${missing.join(", ")}`).toEqual([]);
  });

  test("the exercises produced 200, 400, 401, 403, 404, 422 and 501", () => {
    for (const status of [200, 400, 401, 403, 404, 422, 501]) {
      expect(statuses.has(status), `status ${status} was not exercised`).toBe(true);
    }
  });

  test("the harness is wired up: both loggers captured lines, including Fastify's request lines", () => {
    expect(devCapture.lines.length).toBeGreaterThan(0);
    expect(productionCapture.lines.length).toBeGreaterThan(0);
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
