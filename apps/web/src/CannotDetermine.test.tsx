import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";
import { wcagViolations } from "./axe";
import type { CannotDetermineResponse, ShiftsResponse, SwapPick } from "./contract";
import { fixtures, installFixtureFetch } from "./test-support/fixtureFetch";
import type { FixtureFetchOptions, FixtureReply } from "./test-support/fixtureFetch";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The picks are named literally: step-7.json answers the first (criterion 11), add-3.json the second,
// which 104417 can make, so the horizon reason is reached through the response option.
const STEP_7_PICK: SwapPick = { giveShiftId: "CDU-CON1-0318-N", takeShiftId: "CDU-CON1-0319-N" };
const HORIZON_PICK: SwapPick = { giveShiftId: "CDU-CON1-0326-N", takeShiftId: "CDU-CON1-0326-D" };

const ROSTER_UNAVAILABLE: FixtureReply = { status: 503, body: { code: "roster-unavailable" } };
const CHECKING_UNAVAILABLE =
  "The roster is unavailable right now, so the swap could not be checked. Try again later.";
const LOADING_UNAVAILABLE =
  "The roster is unavailable right now, so your shifts could not be loaded. Try again later.";
const EXPORT_UNAVAILABLE = "Roster export time unavailable.";
const INTRO = "This swap could not be checked with the roster data available, so there is no result.";
/** The words a cannot-determine page must never use, because it gives no result. */
const RESULT_WORDS = /approved without review|review required|cannot be approved|pass|fail/i;

function selectElement(name: string): HTMLSelectElement {
  const element = screen.getByRole("combobox", { name });
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`${name} is not a select element.`);
  }
  return element;
}

/** Renders the app against the fixtures, with the swap check answered by `body` for any pick. */
async function renderAnswering(body: CannotDetermineResponse | undefined, options: FixtureFetchOptions = {}) {
  const fetchStub = installFixtureFetch({
    swapCheck: () => (body === undefined ? undefined : { status: 200, body }),
    ...options,
  });
  const view = render(<App />);
  await waitFor(() => {
    expect(within(selectElement("Act as (development only)")).getAllByRole("option")).toHaveLength(
      fixtures.devUsers.users.length + 1,
    );
  });
  fireEvent.change(selectElement("Act as (development only)"), { target: { value: "104417" } });
  await screen.findByRole("form", { name: "Choose the shifts to swap" });
  return { fetchStub, ...view };
}

function submit(pick: SwapPick) {
  fireEvent.change(selectElement("Shift to give"), { target: { value: pick.giveShiftId } });
  fireEvent.change(selectElement("Shift to take"), { target: { value: pick.takeShiftId } });
  fireEvent.click(screen.getByRole("button", { name: "Check swap" }));
}

async function renderCannotDetermine(body: CannotDetermineResponse, pick: SwapPick = STEP_7_PICK) {
  const rendered = await renderAnswering(body);
  submit(pick);
  const section = await screen.findByRole("region", { name: "Cannot determine" });
  return { ...rendered, section };
}

describe("stale export (C11, Step 7)", () => {
  test("shows the 28 h age and the same one-line wording as the fixture, in a section with intro and one item per reason", async () => {
    const { section, fetchStub } = await renderCannotDetermine(fixtures.step7);

    const posts = fetchStub.callsTo("/api/swap-checks");
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0]?.body ?? "null")).toEqual(STEP_7_PICK);

    expect(within(section).getByRole("heading", { level: 2, name: "Cannot determine" })).toBeTruthy();
    expect(section.textContent).toContain(INTRO);
    expect(section.textContent).toContain("28 h");
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(fixtures.step7.reasons.length);
    expect(items[0]?.textContent).toBe("The roster export is 28 h old, more than the 26 h limit.");
    expect(within(section).getByRole("button", { name: "Choose again" })).toBeTruthy();
    // The picker is replaced by the result.
    expect(screen.queryByRole("form", { name: "Choose the shifts to swap" })).toBeNull();
  });

  test("the notices show the export stamp from the result and the three caveats, in one landmark", async () => {
    await renderCannotDetermine(fixtures.step7);

    expect(screen.getAllByRole("complementary", { name: "Pilot notices" })).toHaveLength(1);
    const notices = screen.getByRole("complementary", { name: "Pilot notices" });
    const paragraphs = within(notices)
      .getAllByText(/./)
      .map((node) => node.textContent);
    expect(paragraphs).toEqual([
      "Roster exported 2027-03-07T08:00Z UTC (2027-03-07T02:00 site time, America/Chicago).",
      "Checks use rostered shifts only.",
      "Pilot scope: CDU and HCU only; holdovers not assessed.",
    ]);
    for (const text of ["2027-03-07T08:00Z", "02:00", "rostered shifts only", "CDU and HCU only", "holdovers not assessed"]) {
      expect(notices.textContent).toContain(text);
    }
  });

  test("gives no result: neither the section nor the page says approved, review, pass or fail", async () => {
    const { section, container } = await renderCannotDetermine(fixtures.step7);
    expect(section.textContent).not.toMatch(RESULT_WORDS);
    expect(container.textContent).not.toMatch(RESULT_WORDS);
  });

  test("adds the minutes to the age when the export is not a whole number of hours old", async () => {
    const aged: CannotDetermineResponse = {
      ...fixtures.step7,
      reasons: [{ code: "export-stale", ageHours: 27, ageMinutes: 30, limitHours: 26 }],
    };
    const { section } = await renderCannotDetermine(aged);
    expect(within(section).getByRole("listitem").textContent).toBe(
      "The roster export is 27 h 30 min old, more than the 26 h limit.",
    );
  });
});

describe("missing export time (C11)", () => {
  test("the notices say the roster export time is unavailable, and still carry the caveats", async () => {
    const { section } = await renderCannotDetermine(fixtures.missingExportedAt);

    expect(within(section).getAllByRole("listitem")).toHaveLength(fixtures.missingExportedAt.reasons.length);
    const notices = screen.getByRole("complementary", { name: "Pilot notices" });
    expect(within(notices).getAllByText(/./)[0]?.textContent).toBe(EXPORT_UNAVAILABLE);
    expect(notices.textContent).not.toContain("Roster exported");
    expect(notices.textContent).toContain("rostered shifts only");
    expect(screen.getAllByRole("complementary", { name: "Pilot notices" })).toHaveLength(1);
  });

  test("a shifts response whose four stamp fields are null shows the same line on the picker", async () => {
    const unstamped: ShiftsResponse = {
      ...fixtures.shifts104417,
      exportedAt: null,
      exportedAtUtcMinute: null,
      exportedAtSiteLocal: null,
      siteTimeZone: null,
    };
    const { container } = await renderAnswering(undefined, {
      shifts: () => ({ status: 200, body: unstamped }),
    });

    const notices = screen.getByRole("complementary", { name: "Pilot notices" });
    expect(within(notices).getAllByText(/./)[0]?.textContent).toBe(EXPORT_UNAVAILABLE);
    expect(notices.textContent).not.toContain("Roster exported");
    expect(screen.getByRole("form", { name: "Choose the shifts to swap" })).toBeTruthy();
    expect(await wcagViolations(container)).toEqual([]);
  });
});

describe("accessibility of each cannot-determine view (C13, NFR-A11Y-001)", () => {
  const cases: { name: string; body: CannotDetermineResponse; pick: SwapPick }[] = [
    { name: "stale export (step-7.json)", body: fixtures.step7, pick: STEP_7_PICK },
    { name: "outside the horizon (add-3.json)", body: fixtures.add3, pick: HORIZON_PICK },
    { name: "several reasons", body: fixtures.staleAndHorizon, pick: STEP_7_PICK },
    { name: "now before the export", body: fixtures.nowBeforeExport, pick: STEP_7_PICK },
  ];

  test.each(cases)("$name has the heading, one item per reason and no axe-core WCAG A/AA violations", async ({
    body,
    pick,
  }) => {
    const { container, section } = await renderCannotDetermine(body, pick);

    expect(within(section).getByRole("heading", { level: 2, name: "Cannot determine" })).toBeTruthy();
    expect(within(section).getAllByRole("listitem")).toHaveLength(body.reasons.length);
    expect(await wcagViolations(container)).toEqual([]);
  });

  test("the horizon fixture is served for a pick 104417 can make, and its shift is named", async () => {
    const { section } = await renderCannotDetermine(fixtures.add3, HORIZON_PICK);
    expect(fixtures.shifts104417.give.map((shift) => shift.shiftId)).toContain(HORIZON_PICK.giveShiftId);
    expect(fixtures.shifts104417.take.map((shift) => shift.shiftId)).toContain(HORIZON_PICK.takeShiftId);
    expect(section.textContent).toContain("CDU-CON1-0326-D");
    expect(section.textContent).toContain("2027-03-07 to 2027-03-22");
  });
});

describe("focus", () => {
  test("focus moves to the Cannot determine heading, and Choose again returns it to Shift to give", async () => {
    const { section } = await renderCannotDetermine(fixtures.step7);
    const heading = within(section).getByRole("heading", { level: 2, name: "Cannot determine" });
    await waitFor(() => {
      expect(document.activeElement).toBe(heading);
    });

    fireEvent.click(within(section).getByRole("button", { name: "Choose again" }));

    await screen.findByRole("form", { name: "Choose the shifts to swap" });
    await waitFor(() => {
      expect(document.activeElement).toBe(selectElement("Shift to give"));
    });
    expect(screen.queryByRole("region", { name: "Cannot determine" })).toBeNull();
    // Back on the picker, the notices are stamped from the shifts again.
    expect(screen.getByRole("complementary", { name: "Pilot notices" }).textContent).toContain("2027-03-07T08:00Z");
  });
});

describe("roster unavailable (503)", () => {
  test("a swap check answered with 503 shows the checking copy in an alert, and no cannot-determine view", async () => {
    const { container } = await renderAnswering(undefined, { swapCheck: () => ROSTER_UNAVAILABLE });
    submit(STEP_7_PICK);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(CHECKING_UNAVAILABLE);
    expect(screen.queryByRole("region", { name: "Cannot determine" })).toBeNull();
    // The picker stays, so the user can try again.
    expect(screen.getByRole("form", { name: "Choose the shifts to swap" })).toBeTruthy();
    expect(await wcagViolations(container)).toEqual([]);
  });

  test("a GET /api/shifts answered with 503 shows the loading copy in an alert", async () => {
    installFixtureFetch({ shifts: () => ROSTER_UNAVAILABLE });
    const { container } = render(<App />);
    await waitFor(() => {
      expect(within(selectElement("Act as (development only)")).getAllByRole("option")).toHaveLength(
        fixtures.devUsers.users.length + 1,
      );
    });
    fireEvent.change(selectElement("Act as (development only)"), { target: { value: "104417" } });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(LOADING_UNAVAILABLE);
    expect(screen.queryByRole("form", { name: "Choose the shifts to swap" })).toBeNull();
    expect(await wcagViolations(container)).toEqual([]);
  });
});
