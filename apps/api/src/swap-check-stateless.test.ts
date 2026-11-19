import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import type { FastifyInstance, LightMyRequestResponse, RouteOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildApp } from "./app";
import {
  ADD_3,
  ADD_6,
  fixedNow,
  headersFor,
  readFixture,
  readSampleRoster,
  SAMPLE_NOW_ISO,
  SAMPLE_ROSTER_PATH,
  sampleSweepPicks,
  STEP_1,
  STEP_2,
  type SwapPick,
} from "./test-support";

// Issue #8, criterion 9 (ADD-5), API part: nothing is stored. Every request of criteria 2-5 and 8
// is sent to two freshly built apps, and then:
//  - after the full pass, no route other than the four exists on either app;
//  - each request returns an identical body on the second app instance, compared as it goes;
//  - after the full pass, the SHA-256 and mtime of data/roster.sample.json are unchanged.
// Both apps read the real file on every request. Failures are collected, then asserted empty, so
// one mismatch does not hide the others. Failure output names shift ids and request labels only,
// never an employee number or a name (NFR-PRIV-001): bodies are compared as booleans, not printed.
//
// Known limit of "second app instance": both apps live in one process, so a module-level cache
// shared by the two would be invisible here. The app code has none.

const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 120_000;

const FOUR_ROUTES: { method: "GET" | "POST"; url: string }[] = [
  { method: "GET", url: "/api/dev/users" },
  { method: "GET", url: "/api/healthz" },
  { method: "GET", url: "/api/shifts" },
  { method: "POST", url: "/api/swap-checks" },
];
const FOUR_ROUTE_KEYS: string[] = FOUR_ROUTES.map((route) => `${route.method} ${route.url}`).sort();

/** The statuses a swap check may answer with: an answer, or a 422 refusal. Never a 5xx. */
const KNOWN_STATUSES = [200, 422];

/** The earlier requests, by name, with the fixture each one answers with. */
const NAMED: { name: string; pick: SwapPick; fixture: string }[] = [
  { name: "Step 1", pick: STEP_1, fixture: "step-1.json" },
  { name: "Step 2", pick: STEP_2, fixture: "step-2.json" },
  { name: "ADD-6", pick: ADD_6, fixture: "add-6.json" },
  { name: "ADD-3", pick: ADD_3, fixture: "add-3.json" },
];

/** Paths where a store for decisions, consent or approvals might plausibly be. None is a route. */
const STORAGE_PROBES = [
  "/api/swap-checks",
  "/api/swaps",
  "/api/approvals",
  "/api/decisions",
  "/api/consents",
  "/api/roster",
];

interface FileState {
  sha256: string;
  mtimeMs: number;
}

interface BuiltApp {
  app: FastifyInstance;
  /** Every route the onRoute hook saw, as "METHOD /path". */
  seen: string[];
  /** How many routes the hook had seen when the app became ready. */
  seenAtReady: number;
}

function fileState(): FileState {
  return {
    sha256: createHash("sha256").update(readFileSync(SAMPLE_ROSTER_PATH)).digest("hex"),
    mtimeMs: statSync(SAMPLE_ROSTER_PATH).mtimeMs,
  };
}

async function buildFreshApp(): Promise<BuiltApp> {
  const seen: string[] = [];
  const onRoute = (route: RouteOptions): void => {
    const methods: string[] = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      seen.push(`${method} ${route.url}`);
    }
  };
  const app = buildApp({
    rosterPath: SAMPLE_ROSTER_PATH,
    now: fixedNow(SAMPLE_NOW_ISO),
    nodeEnv: "development",
    onRoute,
  });
  await app.ready();
  return { app, seen, seenAtReady: seen.length };
}

/** The routes Fastify lists for `app`, as sorted "METHOD /path" keys, one per method. */
function listedRoutes(app: FastifyInstance): string[] {
  const keys: string[] = [];
  for (const line of app.printRoutes({ commonPrefix: false }).split("\n")) {
    const match = /(\/\S*) \(([^)]*)\)/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      for (const method of match[2].split(", ")) {
        keys.push(`${method} ${match[1]}`);
      }
    }
  }
  return keys.sort();
}

function send(app: FastifyInstance, pick: SwapPick): Promise<LightMyRequestResponse> {
  return app.inject({
    method: "POST",
    url: "/api/swap-checks",
    headers: headersFor(pick.caller),
    payload: { giveShiftId: pick.give, takeShiftId: pick.take },
  });
}

/** The parsed payload, or `undefined` when it is empty or not JSON. Never throws, so no payload text reaches an error. */
function parsedBody(payload: string): unknown {
  try {
    const body: unknown = JSON.parse(payload);
    return body;
  } catch {
    return undefined;
  }
}

/** The number of ordered cross-owner pairs, n² minus the sum over owners of (their shifts)². */
function expectedSweepSize(): number {
  const { shifts } = readSampleRoster();
  const perOwner = new Map<string, number>();
  for (const shift of shifts) {
    perOwner.set(shift.employeeNumber, (perOwner.get(shift.employeeNumber) ?? 0) + 1);
  }
  let sameOwnerPairs = 0;
  for (const count of perOwner.values()) {
    sameOwnerPairs += count * count;
  }
  return shifts.length * shifts.length - sameOwnerPairs;
}

describe("criterion 9 (API): nothing is stored across app instances", () => {
  let appA: BuiltApp | undefined;
  let appB: BuiltApp | undefined;
  let before: FileState | undefined;
  let after: FileState | undefined;
  const mismatches: string[] = [];
  const firstPayloads = new Map<string, string>();
  const repeatPayloads = new Map<string, string>();
  let compared = 0;
  let afterPassRoutes: { a: string[]; b: string[]; seenA: number; seenB: number } | undefined;
  const probeStatuses: { app: string; url: string; status: number }[] = [];
  const sweepPicks = sampleSweepPicks();

  beforeAll(async () => {
    before = fileState();
    const built = await Promise.all([buildFreshApp(), buildFreshApp()]);
    const [a, b] = built;
    appA = a;
    appB = b;

    // One pass: each request goes to A, then to B, and the two answers are compared at once.
    const everyRequest: { label: string; pick: SwapPick }[] = [
      ...NAMED.map(({ name, pick }) => ({ label: name, pick })),
      ...sweepPicks.map((pick) => ({ label: `pick ${pick.give}→${pick.take}`, pick })),
    ];
    for (const { label, pick } of everyRequest) {
      const fromA = await send(a.app, pick);
      const fromB = await send(b.app, pick);
      compared += 1;
      if (fromA.statusCode !== fromB.statusCode) {
        mismatches.push(`${label}: status differs between the two apps`);
      }
      // Two identical failures would otherwise compare equal: each answer must be a real one.
      for (const [appName, response] of [
        ["A", fromA],
        ["B", fromB],
      ] as const) {
        if (!KNOWN_STATUSES.includes(response.statusCode)) {
          mismatches.push(`${label}: app ${appName} answered a status that is not 200 or 422`);
        }
        if (parsedBody(response.payload) === undefined) {
          mismatches.push(`${label}: app ${appName} answered an empty or non-JSON payload`);
        }
      }
      if (!isDeepStrictEqual(parsedBody(fromA.payload), parsedBody(fromB.payload))) {
        mismatches.push(`${label}: parsed body differs between the two apps`);
      }
      if (fromA.payload !== fromB.payload) {
        mismatches.push(`${label}: raw payload differs between the two apps`);
      }
      if (NAMED.some((named) => named.name === label)) {
        firstPayloads.set(label, fromA.payload);
      }
    }

    // After the pass: the route listing, and a few plausible storage routes.
    afterPassRoutes = {
      a: listedRoutes(a.app),
      b: listedRoutes(b.app),
      seenA: a.seen.length,
      seenB: b.seen.length,
    };
    for (const [name, { app }] of [
      ["A", a],
      ["B", b],
    ] as const) {
      for (const url of STORAGE_PROBES) {
        const response = await app.inject({ method: "GET", url, headers: headersFor(STEP_1.caller) });
        probeStatuses.push({ app: name, url, status: response.statusCode });
      }
    }

    // The earlier requests again, on A, after the whole sweep.
    for (const { name, pick } of NAMED) {
      repeatPayloads.set(name, (await send(a.app, pick)).payload);
    }

    after = fileState();
  }, SETUP_TIMEOUT_MS);

  afterAll(async () => {
    await Promise.all([appA?.app.close(), appB?.app.close()]);
  }, SETUP_TIMEOUT_MS);

  test(
    "every request answers the same on two fresh app instances",
    () => {
      expect(mismatches).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "the compared requests are Steps 1 and 2, ADD-6, ADD-3 and every sweep pick",
    () => {
      // The sweep size is worked out from the roster, not from the helper, so a sampled
      // `sampleSweepPicks()` would fail here.
      expect(sweepPicks.length).toBe(expectedSweepSize());
      expect(sweepPicks.length).toBeGreaterThan(4_000);
      expect(compared).toBe(4 + sweepPicks.length);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "each app has exactly the four routes before any request",
    () => {
      expect(appA).toBeDefined();
      expect(appB).toBeDefined();
      expect([...(appA?.seen ?? [])].sort()).toEqual(FOUR_ROUTE_KEYS);
      expect([...(appB?.seen ?? [])].sort()).toEqual(FOUR_ROUTE_KEYS);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "after every request each app still lists exactly the four routes, and none was added",
    () => {
      expect(afterPassRoutes).toBeDefined();
      expect(afterPassRoutes?.a).toEqual(FOUR_ROUTE_KEYS);
      expect(afterPassRoutes?.b).toEqual(FOUR_ROUTE_KEYS);
      for (const built of [appA, appB]) {
        for (const route of FOUR_ROUTES) {
          expect(built?.app.hasRoute(route), `${route.method} ${route.url}`).toBe(true);
        }
      }
      expect(afterPassRoutes?.seenA).toBe(appA?.seenAtReady);
      expect(afterPassRoutes?.seenB).toBe(appB?.seenAtReady);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "plausible storage routes do not exist: GET /api/swap-checks, /api/swaps, /api/approvals and others give 404",
    () => {
      expect(probeStatuses).toHaveLength(2 * STORAGE_PROBES.length);
      expect(probeStatuses.filter((probe) => probe.status !== 404)).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "repeating Steps 1 and 2, ADD-6 and ADD-3 on the first app after the sweep gives byte-identical bodies",
    () => {
      expect(firstPayloads.size).toBe(NAMED.length);
      // Booleans, so a failure prints the label and never a response body.
      for (const { name } of NAMED) {
        const repeated = repeatPayloads.get(name);
        expect(repeated !== undefined, `${name}: no repeat response`).toBe(true);
        expect(repeated === firstPayloads.get(name), `${name}: repeat differs from the first answer`).toBe(true);
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "the repeated bodies still equal the step fixtures",
    () => {
      for (const { name, fixture } of NAMED) {
        const repeated = repeatPayloads.get(name);
        expect(repeated !== undefined, `${name}: no repeat response`).toBe(true);
        const body = parsedBody(repeated ?? "");
        expect(body !== undefined, `${name}: repeated payload is empty or not JSON`).toBe(true);
        expect(isDeepStrictEqual(body, readFixture(fixture)), `${name}: repeated body differs from ${fixture}`).toBe(true);
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "data/roster.sample.json has the same SHA-256 and mtime after the full pass",
    () => {
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      expect(after?.sha256).toBe(before?.sha256);
      expect(after?.mtimeMs).toBe(before?.mtimeMs);
    },
    TEST_TIMEOUT_MS,
  );
});
