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
  SAMPLE_NOW_ISO,
  SAMPLE_ROSTER_PATH,
  sampleSweepPicks,
  STEP_1,
  STEP_2,
  type SwapPick,
} from "./test-support";

// Issue #8, criterion 9 (ADD-5), API part: nothing is stored. After every request of criteria
// 2-5 and 8, sent to a freshly built app:
//  - no route other than the four exists;
//  - the same request returns an identical body on a second app instance;
//  - the SHA-256 of data/roster.sample.json is unchanged.
// Both apps read the real file on every request. Failures are collected, then asserted empty, so
// one mismatch does not hide the others. Messages name shift ids only, never an employee number
// or a name (NFR-PRIV-001).

const SETUP_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 120_000;

const FOUR_ROUTES = ["GET /api/dev/users", "GET /api/healthz", "GET /api/shifts", "POST /api/swap-checks"];

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

function parsedBody(response: LightMyRequestResponse): unknown {
  const body: unknown = JSON.parse(response.payload);
  return body;
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
      if (!isDeepStrictEqual(parsedBody(fromA), parsedBody(fromB))) {
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
      expect(sweepPicks.length).toBeGreaterThan(0);
      expect(compared).toBe(4 + sweepPicks.length);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "each app has exactly the four routes before any request",
    () => {
      expect(appA).toBeDefined();
      expect(appB).toBeDefined();
      expect([...(appA?.seen ?? [])].sort()).toEqual(FOUR_ROUTES);
      expect([...(appB?.seen ?? [])].sort()).toEqual(FOUR_ROUTES);
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "after every request each app still lists exactly the four routes, and none was added",
    () => {
      expect(afterPassRoutes).toBeDefined();
      expect(afterPassRoutes?.a).toEqual(FOUR_ROUTES);
      expect(afterPassRoutes?.b).toEqual(FOUR_ROUTES);
      for (const built of [appA, appB]) {
        for (const key of FOUR_ROUTES) {
          const [method, url] = key.split(" ");
          expect(
            method !== undefined && url !== undefined && built?.app.hasRoute({ method: method as "GET" | "POST", url }),
            key,
          ).toBe(true);
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
      for (const { name } of NAMED) {
        expect(repeatPayloads.get(name), name).toBeDefined();
        expect(repeatPayloads.get(name), name).toBe(firstPayloads.get(name));
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "the repeated bodies still equal the step fixtures",
    () => {
      for (const { name, fixture } of NAMED) {
        const repeated = repeatPayloads.get(name);
        expect(repeated, name).toBeDefined();
        expect(JSON.parse(repeated ?? "null"), name).toEqual(readFixture(fixture));
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "data/roster.sample.json has the same SHA-256 and mtime after every request",
    () => {
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      expect(after?.sha256).toBe(before?.sha256);
      expect(after?.mtimeMs).toBe(before?.mtimeMs);
    },
    TEST_TIMEOUT_MS,
  );
});
