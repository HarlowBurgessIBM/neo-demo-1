import { expect, test } from "vitest";
import { buildApp } from "./app";
import { openDatabase } from "./db";

test("C1: GET /api/healthz with no identity headers returns 200 and status ok", async () => {
  const app = buildApp();
  const response = await app.inject({ method: "GET", url: "/api/healthz" });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: "ok" });
  await app.close();
});

// Toolchain smoke test.
test("node:sqlite opens an in-memory database", () => {
  const db = openDatabase(":memory:");
  db.exec("CREATE TABLE probe (value TEXT NOT NULL)");
  db.prepare("INSERT INTO probe (value) VALUES (?)").run("ok");
  expect(db.prepare("SELECT value FROM probe").get()).toEqual({ value: "ok" });
  db.close();
});
