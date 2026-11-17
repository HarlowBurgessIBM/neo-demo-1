import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "./app";
import type { DevUsersResponse } from "./routes/dev-users";
import { headersFor, readFixture, readSampleRoster } from "./test-support";

const roster = readSampleRoster();

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function getDevUsers(nodeEnv: string | undefined, headers: Record<string, string> = {}) {
  app = buildApp({ nodeEnv });
  await app.ready();
  return app.inject({ method: "GET", url: "/api/dev/users", headers });
}

describe("C8: GET /api/dev/users outside production", () => {
  test.each([
    ["NODE_ENV unset", undefined],
    ["NODE_ENV development", "development"],
  ])("%s gives 200 with the fixture body and needs no identity headers", async (_label, nodeEnv) => {
    const response = await getDevUsers(nodeEnv);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(readFixture("dev-users.json"));
  });

  test("lists exactly 8 operators and 2 supervisors", async () => {
    const response = await getDevUsers(undefined);
    const { users } = response.json<DevUsersResponse>();

    expect(users.filter((user) => user.roles.length === 1 && user.roles[0] === "operator")).toHaveLength(8);
    expect(users.filter((user) => user.roles.length === 1 && user.roles[0] === "shift-supervisor")).toHaveLength(2);
    expect(users).toHaveLength(10);
  });

  test("the fixture matches the sample roster: operators then supervisors, in roster order", () => {
    const fixture = readFixture("dev-users.json") as DevUsersResponse;
    const expected = [
      ...roster.operators.map(({ employeeNumber, name }) => ({ employeeNumber, name, roles: ["operator"] })),
      ...roster.supervisors.map(({ employeeNumber, name }) => ({
        employeeNumber,
        name,
        roles: ["shift-supervisor"],
      })),
    ];

    expect(roster.operators).toHaveLength(8);
    expect(roster.supervisors).toHaveLength(2);
    expect(fixture).toEqual({ users: expected });
  });
});

describe("C8: GET /api/dev/users in production", () => {
  const personalValues = [...roster.operators, ...roster.supervisors].flatMap((person) => [
    person.employeeNumber,
    person.name,
  ]);

  test("gives 404 and the body holds no roster employee number or name", async () => {
    const response = await getDevUsers("production");

    expect(personalValues).toHaveLength(20);
    expect(response.statusCode).toBe(404);
    for (const value of personalValues) {
      expect(response.body).not.toContain(value);
    }
  });

  test("still gives 404 with valid identity headers", async () => {
    const operator = roster.operators[0];
    expect(operator).toBeDefined();

    const response = await getDevUsers("production", headersFor(operator?.employeeNumber ?? ""));

    expect(response.statusCode).toBe(404);
    for (const value of personalValues) {
      expect(response.body).not.toContain(value);
    }
  });
});
