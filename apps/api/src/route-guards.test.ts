import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import type { FastifyInstance, RouteOptions } from "fastify";
import { describe, expect, test } from "vitest";
import { buildApp } from "./app";
import { headersFor, SAMPLE_ROSTER_PATH } from "./test-support";

// C12: the API exposes no route that writes to the roster file, and has no route for storing a
// decision, consent or approval.

const MAYA = "104417";

const STEP_1 = { giveShiftId: "CDU-CON1-0318-N", takeShiftId: "CDU-CON1-0319-N" };
const STEP_8 = { giveShiftId: "CDU-CON1-0318-N", takeShiftId: "FCC-CON1-0318-D" };

const BASE_ROUTES = ["GET /api/healthz", "GET /api/shifts", "POST /api/swap-checks"];
const DEV_ROUTES = [...BASE_ROUTES, "GET /api/dev/users"];

interface RegisteredRoute {
  method: string;
  url: string;
}

/** Builds an app and returns every route Fastify registered for it, one entry per method. */
async function registeredRoutes(nodeEnv: string | undefined): Promise<RegisteredRoute[]> {
  const routes: RegisteredRoute[] = [];
  const onRoute = (route: RouteOptions): void => {
    const methods: string[] = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      routes.push({ method, url: route.url });
    }
  };
  const app = buildApp({ nodeEnv, onRoute });
  await app.ready();
  await app.close();
  return routes;
}

function keysOf(routes: RegisteredRoute[]): string[] {
  return routes.map((route) => `${route.method} ${route.url}`).sort();
}

function sha256OfFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("C12: the registered route set is exactly the known routes", () => {
  test.each([
    ["nodeEnv undefined", undefined],
    ["nodeEnv development", "development"],
  ])("%s registers exactly the four routes", async (_label, nodeEnv) => {
    const routes = await registeredRoutes(nodeEnv);
    expect(keysOf(routes)).toEqual([...DEV_ROUTES].sort());
    expect(routes.filter((route) => route.method === "HEAD")).toEqual([]);
  });

  test("nodeEnv production registers exactly the three routes, without /api/dev/users", async () => {
    const routes = await registeredRoutes("production");
    expect(keysOf(routes)).toEqual([...BASE_ROUTES].sort());
    expect(routes.some((route) => route.url === "/api/dev/users")).toBe(false);
    expect(routes.filter((route) => route.method === "HEAD")).toEqual([]);
  });

  test.each([undefined, "development", "production"])(
    "no registered path (nodeEnv %s) mentions roster, decision, consent or approval",
    async (nodeEnv) => {
      const routes = await registeredRoutes(nodeEnv);
      for (const route of routes) {
        for (const word of ["roster", "decision", "consent", "approval"]) {
          expect(route.url.toLowerCase(), `${route.method} ${route.url} mentions "${word}"`).not.toContain(word);
        }
      }
    },
  );
});

describe("C12: no write routes", () => {
  test("GET /api/healthz needs no identity headers", async () => {
    const app = buildApp();
    await app.ready();
    try {
      const response = await app.inject({ method: "GET", url: "/api/healthz" });
      expect(response.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  const unregistered: [string, string][] = [
    ...["PUT", "PATCH", "DELETE"].flatMap((method) =>
      ["/api/shifts", "/api/swap-checks", "/api/dev/users", "/api/healthz"].map(
        (url): [string, string] => [method, url],
      ),
    ),
    ["POST", "/api/shifts"],
  ];

  test.each(unregistered)("%s %s gives 404 for a valid operator", async (method, url) => {
    const app = buildApp();
    await app.ready();
    try {
      const response = await app.inject({
        method: method as "PUT" | "PATCH" | "DELETE" | "POST",
        url,
        headers: headersFor(MAYA),
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

describe("C12: the roster file is never written", () => {
  test("every route leaves data/roster.sample.json unchanged", async () => {
    const hashBefore = sha256OfFile(SAMPLE_ROSTER_PATH);
    const mtimeBefore = statSync(SAMPLE_ROSTER_PATH).mtimeMs;

    const app: FastifyInstance = buildApp({ rosterPath: SAMPLE_ROSTER_PATH });
    await app.ready();
    try {
      const operator = headersFor(MAYA);
      const responses = [
        await app.inject({ method: "GET", url: "/api/healthz" }),
        await app.inject({ method: "GET", url: "/api/shifts", headers: operator }),
        await app.inject({ method: "POST", url: "/api/swap-checks", headers: operator, payload: STEP_1 }),
        await app.inject({ method: "POST", url: "/api/swap-checks", headers: operator, payload: STEP_8 }),
        await app.inject({ method: "POST", url: "/api/swap-checks", headers: operator, payload: { giveShiftId: {} } }),
        await app.inject({ method: "GET", url: "/api/dev/users" }),
      ];
      // The routes were really exercised: 200, 200, 501, 422, 400, 200.
      expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 501, 422, 400, 200]);
    } finally {
      await app.close();
    }

    expect(sha256OfFile(SAMPLE_ROSTER_PATH)).toBe(hashBefore);
    expect(statSync(SAMPLE_ROSTER_PATH).mtimeMs).toBe(mtimeBefore);
  });
});
