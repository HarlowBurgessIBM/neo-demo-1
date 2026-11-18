import { vi } from "vitest";
import type {
  CannotBeApprovedResponse,
  CannotDetermineResponse,
  DevUsersResponse,
  RefusedResponse,
  ShiftsResponse,
  SwapPick,
} from "../contract";
import add3Raw from "../../../../fixtures/responses/add-3.json?raw";
import missingExportedAtRaw from "../../../../fixtures/responses/cannot-determine-missing-exported-at.json?raw";
import nowBeforeExportRaw from "../../../../fixtures/responses/cannot-determine-now-before-export.json?raw";
import shiftEndNotAfterStartRaw from "../../../../fixtures/responses/cannot-determine-shift-end-not-after-start.json?raw";
import staleAndHorizonRaw from "../../../../fixtures/responses/cannot-determine-stale-and-horizon.json?raw";
import devUsersRaw from "../../../../fixtures/responses/dev-users.json?raw";
import shifts102286Raw from "../../../../fixtures/responses/shifts-102286.json?raw";
import shifts104417Raw from "../../../../fixtures/responses/shifts-104417.json?raw";
import step3Raw from "../../../../fixtures/responses/step-3.json?raw";
import step4Raw from "../../../../fixtures/responses/step-4.json?raw";
import step5Raw from "../../../../fixtures/responses/step-5.json?raw";
import step6Raw from "../../../../fixtures/responses/step-6.json?raw";
import step7Raw from "../../../../fixtures/responses/step-7.json?raw";
import step8Raw from "../../../../fixtures/responses/step-8.json?raw";
import unchangedShiftRaw from "../../../../fixtures/responses/unchanged-shift-qualification.json?raw";
import unchangedWindowRaw from "../../../../fixtures/responses/unchanged-window-hours.json?raw";

/** The shared response fixtures, parsed once, for assertions in view tests. */
export const fixtures = {
  devUsers: JSON.parse(devUsersRaw) as DevUsersResponse,
  shifts104417: JSON.parse(shifts104417Raw) as ShiftsResponse,
  shifts102286: JSON.parse(shifts102286Raw) as ShiftsResponse,
  step8: JSON.parse(step8Raw) as RefusedResponse,
  step3: JSON.parse(step3Raw) as CannotBeApprovedResponse,
  step4: JSON.parse(step4Raw) as CannotBeApprovedResponse,
  step5: JSON.parse(step5Raw) as CannotBeApprovedResponse,
  step6: JSON.parse(step6Raw) as CannotBeApprovedResponse,
  unchangedShift: JSON.parse(unchangedShiftRaw) as CannotBeApprovedResponse,
  unchangedWindow: JSON.parse(unchangedWindowRaw) as CannotBeApprovedResponse,
  step7: JSON.parse(step7Raw) as CannotDetermineResponse,
  add3: JSON.parse(add3Raw) as CannotDetermineResponse,
  staleAndHorizon: JSON.parse(staleAndHorizonRaw) as CannotDetermineResponse,
  nowBeforeExport: JSON.parse(nowBeforeExportRaw) as CannotDetermineResponse,
  missingExportedAt: JSON.parse(missingExportedAtRaw) as CannotDetermineResponse,
  shiftEndNotAfterStart: JSON.parse(shiftEndNotAfterStartRaw) as CannotDetermineResponse,
};

/** The pick the step-8 fixture answers: a CDU shift given for an FCC shift, which is outside the pilot. */
export const STEP_8_PICK: SwapPick = { giveShiftId: "CDU-CON1-0318-N", takeShiftId: "FCC-CON1-0318-D" };

/** One request the stub received. Headers are normalized, so lookups ignore case. */
export interface RecordedCall {
  url: string;
  path: string;
  method: string;
  headers: Headers;
  body: string | undefined;
}

/** What the stub answers with: a status and a JSON body. */
export interface FixtureReply {
  status: number;
  body: unknown;
}

export interface FixtureFetchOptions {
  /**
   * Overrides the answer to POST /api/swap-checks. Return undefined to fall through to the default,
   * which answers the step-8 pick with the step-8 fixture (422) and anything else with 404.
   */
  swapCheck?: (call: RecordedCall, pick: SwapPick | undefined) => FixtureReply | undefined;
  /**
   * Overrides the answer to GET /api/shifts, for example a different body or a 503. Return undefined
   * to fall through to the default, which serves the fixture for the acting employee.
   */
  shifts?: (call: RecordedCall) => FixtureReply | undefined;
}

export interface FixtureFetch {
  /** Every call, in order. */
  calls: RecordedCall[];
  /** The calls whose path is `path`. */
  callsTo: (path: string) => RecordedCall[];
}

function reply({ status, body }: FixtureReply): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function parsePick(body: string | undefined): SwapPick | undefined {
  if (body === undefined) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === "object" && parsed !== null) {
      const record = parsed as Record<string, unknown>;
      const give = record["giveShiftId"];
      const take = record["takeShiftId"];
      if (typeof give === "string" && typeof take === "string") {
        return { giveShiftId: give, takeShiftId: take };
      }
    }
  } catch {
    // Not JSON: no pick.
  }
  return undefined;
}

function answer(call: RecordedCall, options: FixtureFetchOptions): FixtureReply {
  const employee = call.headers.get("X-Employee-Number");
  if (call.method === "GET" && call.path === "/api/dev/users") {
    return { status: 200, body: fixtures.devUsers };
  }
  if (call.method === "GET" && call.path === "/api/shifts") {
    const override = options.shifts?.(call);
    if (override !== undefined) {
      return override;
    }
    if (employee === null) {
      return { status: 401, body: { kind: "unauthenticated" } };
    }
    if (employee === "104417") {
      return { status: 200, body: fixtures.shifts104417 };
    }
    if (employee === "102286") {
      return { status: 200, body: fixtures.shifts102286 };
    }
    return { status: 403, body: { kind: "forbidden", code: "not-a-roster-operator" } };
  }
  if (call.method === "POST" && call.path === "/api/swap-checks") {
    const pick = parsePick(call.body);
    const override = options.swapCheck?.(call, pick);
    if (override !== undefined) {
      return override;
    }
    if (pick?.giveShiftId === STEP_8_PICK.giveShiftId && pick.takeShiftId === STEP_8_PICK.takeShiftId) {
      return { status: 422, body: fixtures.step8 };
    }
  }
  return { status: 404, body: { kind: "not-found" } };
}

/**
 * Replaces the global `fetch` with a stub that serves the shared fixtures and records every call.
 * Undo it with `vi.unstubAllGlobals()`.
 */
export function installFixtureFetch(options: FixtureFetchOptions = {}): FixtureFetch {
  const calls: RecordedCall[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const call: RecordedCall = {
      url,
      path: new URL(url, "http://localhost").pathname,
      method: (init?.method ?? "GET").toUpperCase(),
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    calls.push(call);
    return Promise.resolve(reply(answer(call, options)));
  });
  return { calls, callsTo: (path) => calls.filter((call) => call.path === path) };
}
