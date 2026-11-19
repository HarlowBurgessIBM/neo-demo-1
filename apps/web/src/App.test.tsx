import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";
import { getShifts, postSwapCheck } from "./api";
import { wcagViolations } from "./axe";
import { fixtures, installFixtureFetch, STEP_8_PICK } from "./test-support/fixtureFetch";
import type { RecordedCall } from "./test-support/fixtureFetch";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function switcher(): HTMLSelectElement {
  const element = screen.getByRole("combobox", { name: "Act as (development only)" });
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error("The switcher is not a select element.");
  }
  return element;
}

/** Renders outside production and waits for the dev users to fill the switcher. */
async function renderWithUsersLoaded() {
  const fetchStub = installFixtureFetch();
  const view = render(<App />);
  await waitFor(() => {
    expect(within(switcher()).getAllByRole("option")).toHaveLength(fixtures.devUsers.users.length + 1);
  });
  return { fetchStub, ...view };
}

function hasIdentityHeader(call: RecordedCall): boolean {
  return call.headers.has("X-Employee-Number") || call.headers.has("X-Roles");
}

describe("outside production", () => {
  test("the test environment is not production", () => {
    expect(import.meta.env.PROD).toBe(false);
  });

  test("renders the application heading", () => {
    installFixtureFetch();
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "ShiftSwap" })).toBeTruthy();
  });

  test("renders the switcher as a labelled combobox with the dev users as options", async () => {
    await renderWithUsersLoaded();
    const options = within(switcher()).getAllByRole("option");
    expect(options[0]?.textContent).toBe("Choose a user");
    expect(options.slice(1).map((option) => option.textContent)).toEqual(
      fixtures.devUsers.users.map((user) => `${user.name} (${user.employeeNumber})`),
    );
    expect(options.slice(1).map((option) => option.getAttribute("value"))).toEqual(
      fixtures.devUsers.users.map((user) => user.employeeNumber),
    );
  });

  test("calls made before a selection carry neither identity header", async () => {
    const { fetchStub } = await renderWithUsersLoaded();
    expect(fetchStub.callsTo("/api/dev/users")).toHaveLength(1);
    expect(fetchStub.callsTo("/api/shifts")).toHaveLength(0);
    expect(fetchStub.calls.some(hasIdentityHeader)).toBe(false);
  });

  test("selecting 104417 makes the next API call carry X-Employee-Number and X-Roles", async () => {
    const { fetchStub } = await renderWithUsersLoaded();

    fireEvent.change(switcher(), { target: { value: "104417" } });

    await waitFor(() => {
      expect(fetchStub.callsTo("/api/shifts")).toHaveLength(1);
    });
    const [shiftsCall] = fetchStub.callsTo("/api/shifts");
    expect(shiftsCall?.method).toBe("GET");
    expect(shiftsCall?.headers.get("X-Employee-Number")).toBe("104417");
    expect(shiftsCall?.headers.get("X-Roles")).toBe("operator");
    // The dev-users call that came first stayed anonymous.
    const [devUsersCall] = fetchStub.callsTo("/api/dev/users");
    expect(devUsersCall?.headers.has("X-Employee-Number")).toBe(false);
    expect(devUsersCall?.headers.has("X-Roles")).toBe(false);
    // The shifts shown are 104417's.
    const give = await screen.findByRole("combobox", { name: "Shift to give" });
    expect(within(give).getAllByRole("option")).toHaveLength(fixtures.shifts104417.give.length + 1);
  });

  test("the switcher view has no axe-core WCAG A/AA violations with the options loaded", async () => {
    const { container } = await renderWithUsersLoaded();
    expect(await wcagViolations(container)).toEqual([]);
  });

  test("the picker view after selecting 104417 has no axe-core WCAG A/AA violations", async () => {
    const { container } = await renderWithUsersLoaded();
    fireEvent.change(switcher(), { target: { value: "104417" } });
    await screen.findByRole("form", { name: "Choose the shifts to swap" });
    expect(await wcagViolations(container)).toEqual([]);
  });
});

describe("getShifts response validation", () => {
  function stubShiftsBody(body: unknown) {
    vi.stubGlobal("fetch", () =>
      Promise.resolve(
        new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }),
      ),
    );
  }

  const identity = { employeeNumber: "104417", roles: ["operator"] };

  test("accepts the unmodified 104417 fixture", async () => {
    stubShiftsBody(fixtures.shifts104417);
    expect(await getShifts(identity)).toEqual({ kind: "ok", data: fixtures.shifts104417 });
  });

  test("accepts a take entry whose ownerName is null", async () => {
    const body = structuredClone(fixtures.shifts104417);
    const last = body.take[body.take.length - 1];
    expect(last).toBeDefined();
    if (last !== undefined) {
      last.ownerName = null;
    }
    stubShiftsBody(body);

    expect(await getShifts(identity)).toEqual({ kind: "ok", data: body });
  });

  test("rejects the whole response when a take entry's ownerName is neither a string nor null", async () => {
    const malformed: unknown = structuredClone(fixtures.shifts104417);
    const take = (malformed as { take: Record<string, unknown>[] }).take;
    const last = take[take.length - 1];
    expect(last).toBeDefined();
    if (last !== undefined) {
      last["ownerName"] = 42;
    }
    stubShiftsBody(malformed);

    expect(await getShifts(identity)).toEqual({
      kind: "error",
      status: 200,
      message: "The server answered with an unexpected response.",
    });
  });

  test("rejects the whole response when one take entry lacks ownerName", async () => {
    const malformed: unknown = structuredClone(fixtures.shifts104417);
    const take = (malformed as { take: Record<string, unknown>[] }).take;
    expect(take.length).toBeGreaterThan(1);
    const last = take[take.length - 1];
    expect(last).toBeDefined();
    delete last?.["ownerName"];
    stubShiftsBody(malformed);

    expect(await getShifts(identity)).toEqual({
      kind: "error",
      status: 200,
      message: "The server answered with an unexpected response.",
    });
  });
});

describe("in production", () => {
  test("renders no switcher, requests no dev users and attaches no identity header", async () => {
    vi.stubEnv("PROD", true);
    expect(import.meta.env.PROD).toBe(true);
    const fetchStub = installFixtureFetch();

    render(<App />);

    // Wait for the mount-time shifts call so the absence checks below are not vacuous.
    await waitFor(() => {
      expect(fetchStub.callsTo("/api/shifts")).toHaveLength(1);
    });
    await screen.findByRole("alert");
    expect(screen.getByRole("heading", { level: 1, name: "ShiftSwap" })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByLabelText(/development only/i)).toBeNull();
    expect(fetchStub.callsTo("/api/dev/users")).toHaveLength(0);
    expect(fetchStub.calls.some(hasIdentityHeader)).toBe(false);
  });

  test("the API client attaches no identity header even when handed an identity", async () => {
    vi.stubEnv("PROD", true);
    const fetchStub = installFixtureFetch();
    const identity = { employeeNumber: "104417", roles: ["operator"] };

    await getShifts(identity);
    await postSwapCheck(identity, STEP_8_PICK);

    expect(fetchStub.callsTo("/api/shifts")).toHaveLength(1);
    expect(fetchStub.callsTo("/api/swap-checks")).toHaveLength(1);
    expect(fetchStub.calls.some(hasIdentityHeader)).toBe(false);
  });

  test("the production view has no axe-core WCAG A/AA violations", async () => {
    vi.stubEnv("PROD", true);
    const fetchStub = installFixtureFetch();
    const { container } = render(<App />);
    await waitFor(() => {
      expect(fetchStub.callsTo("/api/shifts")).toHaveLength(1);
    });
    await screen.findByRole("alert");
    expect(await wcagViolations(container)).toEqual([]);
  });
});
