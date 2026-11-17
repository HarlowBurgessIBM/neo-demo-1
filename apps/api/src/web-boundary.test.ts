import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { repoRoot } from "./test-support";

// Boundary guard: apps/web reaches the API only over HTTP. It must not import apps/api,
// @shiftswap/api or @shiftswap/rules, and must not depend on them in package.json.
// This file lives in apps/api so that its own patterns do not match when apps/web is scanned.

const webRoot = path.join(repoRoot, "apps", "web");

const FORBIDDEN_TEXT = /apps\/api|@shiftswap\/api|@shiftswap\/rules/;
const FORBIDDEN_PACKAGES = ["@shiftswap/api", "@shiftswap/rules"];
const DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];

/** Every file under `dir`, skipping node_modules, dist and dot-directories. Paths are relative to `dir`. */
function walk(dir: string, relative = ""): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(path.join(dir, relative), { withFileTypes: true })) {
    const entryPath = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      files.push(...walk(dir, entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

/** One message per line of `text` that mentions a forbidden path or package. */
function findForbiddenText(label: string, text: string): string[] {
  const hits: string[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (FORBIDDEN_TEXT.test(line)) hits.push(`${label}:${index + 1}: ${line.trim()}`);
  });
  return hits;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One message per forbidden package named in any dependency field of a parsed package.json. */
function findForbiddenDependencies(pkg: unknown): string[] {
  const hits: string[] = [];
  if (!isRecord(pkg)) return hits;
  for (const field of DEPENDENCY_FIELDS) {
    const section = pkg[field];
    if (!isRecord(section)) continue;
    for (const name of FORBIDDEN_PACKAGES) {
      if (name in section) hits.push(`${field}.${name}`);
    }
  }
  return hits;
}

describe("apps/web boundary", () => {
  const files = walk(webRoot);

  test("scans a meaningful set of apps/web files, including src/App.tsx", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.map((file) => file.split(path.sep).join("/"))).toContain("src/App.tsx");
  });

  test("no apps/web file references apps/api, @shiftswap/api or @shiftswap/rules", () => {
    const hits = files.flatMap((file) =>
      findForbiddenText(file.split(path.sep).join("/"), readFileSync(path.join(webRoot, file), "utf8")),
    );
    expect(hits).toEqual([]);
  });

  test("apps/web/package.json does not depend on @shiftswap/api or @shiftswap/rules", () => {
    const pkg: unknown = JSON.parse(readFileSync(path.join(webRoot, "package.json"), "utf8"));
    expect(findForbiddenDependencies(pkg)).toEqual([]);
  });

  describe("positive controls", () => {
    test.each([
      ['import x from "@shiftswap/rules";'],
      ['import { app } from "@shiftswap/api";'],
      ['import app from "../../apps/api/src/app";'],
      ['"@shiftswap/api": "*"'],
    ])("the text scanner flags %s", (text) => {
      const hits = findForbiddenText("synthetic.ts", `const ok = 1;\n${text}\n`);
      expect(hits).toHaveLength(1);
      expect(hits[0]).toContain("synthetic.ts:2:");
    });

    test("the text scanner does not flag unrelated text", () => {
      expect(findForbiddenText("synthetic.ts", 'import React from "react";\nfetch("/api/shifts");')).toEqual([]);
    });

    test.each(DEPENDENCY_FIELDS)("the dependency check flags a forbidden package in %s", (field) => {
      const pkg = { name: "synthetic", [field]: { "@shiftswap/rules": "*" } };
      expect(findForbiddenDependencies(pkg)).toEqual([`${field}.@shiftswap/rules`]);
    });

    test("the dependency check does not flag allowed dependencies", () => {
      expect(findForbiddenDependencies({ dependencies: { react: "^19.0.0" } })).toEqual([]);
    });
  });
});
