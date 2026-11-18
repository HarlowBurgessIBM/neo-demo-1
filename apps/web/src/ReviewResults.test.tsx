import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";
import { wcagViolations } from "./axe";
import type { ApprovedWithoutReviewResponse, ReviewRequiredResponse, SwapPick } from "./contract";
import { fixtures, installFixtureFetch } from "./test-support/fixtureFetch";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Only the 104417 and 102286 shift lists exist as fixtures, so every test acts as Maya (104417). The
// stub answers with the fixture whatever the pick, so the pick does not change what is rendered.
const PICK: SwapPick = { giveShiftId: "CDU-CON1-0301-D", takeShiftId: "HCU-CON1-0301-D" };

/** What a button or link must never be called on a page that cannot approve, send or notify anything. */
const FORBIDDEN_ACTION_NAME = /approve|send|agree|submit|notify/i;
/** A named reviewing unit or reviewer: the views say "each unit affected" and never list which. */
const REVIEWER_NAMED = /(CDU|HCU|FCC) supervisor|units affected:|reviewing units?:|reviewer/i;
const UNEXPECTED_RESPONSE = "Could not check the swap. The server answered with an unexpected status (200).";
const NOTICE_TEXT = ["2027-03-07T08:00Z", "02:00", "rostered shifts only", "CDU and HCU only", "holdovers not assessed"];

const APPROVED_GUIDANCE =
  "This swap meets VE-HSSE-STD-014 § 3 and triggers neither condition in § 4.2, so under § 4.3 it may be approved without supervisor review. This is a check only: nothing has been approved, stored or sent.";
const REVIEW_GUIDANCE =
  "This swap meets VE-HSSE-STD-014 § 3, but it triggers § 4.2, so it needs review and approval by the shift supervisor of each unit affected. This is a check only: nothing has been sent for review, stored or approved.";

const APPROVED_HEADING = "Approved without review";
const REVIEW_HEADING = "Review required";
const CANNOT_HEADING = "Cannot be approved";
const ALL_RESULT_HEADINGS = [APPROVED_HEADING, REVIEW_HEADING, CANNOT_HEADING];

const views: { name: string; heading: string; body: ApprovedWithoutReviewResponse | ReviewRequiredResponse }[] = [
  { name: "Step 1 (step-1.json)", heading: APPROVED_HEADING, body: fixtures.step1 },
  { name: "Step 2 (step-2.json)", heading: REVIEW_HEADING, body: fixtures.step2 },
  { name: "ADD-6 (add-6.json)", heading: REVIEW_HEADING, body: fixtures.add6 },
];

function selectElement(name: string): HTMLSelectElement {
  const element = screen.getByRole("combobox", { name });
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`${name} is not a select element.`);
  }
  return element;
}

/** Renders the app as Maya (104417), with the swap check answered by `body` for any pick. */
async function renderAnswering(body: unknown) {
  installFixtureFetch({ swapCheck: () => ({ status: 200, body }) });
  const view = render(<App />);
  await waitFor(() => {
    expect(within(selectElement("Act as (development only)")).getAllByRole("option")).toHaveLength(
      fixtures.devUsers.users.length + 1,
    );
  });
  fireEvent.change(selectElement("Act as (development only)"), { target: { value: "104417" } });
  await screen.findByRole("form", { name: "Choose the shifts to swap" });
  return view;
}

function submit(pick: SwapPick) {
  fireEvent.change(selectElement("Shift to give"), { target: { value: pick.giveShiftId } });
  fireEvent.change(selectElement("Shift to take"), { target: { value: pick.takeShiftId } });
  fireEvent.click(screen.getByRole("button", { name: "Check swap" }));
}

/** Renders the app, checks a swap the stub answers with `body`, and returns the result region named `heading`. */
async function renderResult(body: unknown, heading: string) {
  const rendered = await renderAnswering(body);
  submit(PICK);
  const section = await screen.findByRole("region", { name: heading });
  return { ...rendered, section };
}

/** The block under an employee's heading: their shifts, off-duty figures, windows and any triggers. */
function employeeBlock(section: HTMLElement, name: string): HTMLElement {
  const block = within(section).getByRole("heading", { level: 3, name }).parentElement;
  if (block === null) {
    throw new Error(`The heading for ${name} has no block around it.`);
  }
  return block;
}

/** The items of the "Review triggers" list in an employee's block. */
function triggerItems(block: HTMLElement): string[] {
  const list = within(block).getByRole("heading", { level: 4, name: "Review triggers" }).nextElementSibling;
  if (!(list instanceof HTMLElement)) {
    throw new Error("The Review triggers heading is not followed by a list.");
  }
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

/** Body of `base` with `patch` applied to the employee at `index`. */
function withEmployee<T extends { employees: object[] }>(base: T, index: number, patch: Record<string, unknown>) {
  return { ...base, employees: base.employees.map((employee, at) => (at === index ? { ...employee, ...patch } : employee)) };
}

/** Body of a review-required fixture with `patch` applied to the first employee's first trigger. */
function withFirstTrigger(base: ReviewRequiredResponse, patch: Record<string, unknown>) {
  const [first] = base.employees;
  if (first === undefined) {
    throw new Error("The fixture has no employees.");
  }
  return withEmployee(base, 0, {
    triggers: first.triggers.map((trigger, index) => (index === 0 ? { ...trigger, ...patch } : trigger)),
  });
}

describe("approved without review, rendered from step-1.json (C4 step 1)", () => {
  test("shows the exact guidance, the determining rule and the figures as sent", async () => {
    const { section } = await renderResult(fixtures.step1, APPROVED_HEADING);

    expect(fixtures.step1.guidance).toBe(APPROVED_GUIDANCE);
    expect(within(section).getByText(APPROVED_GUIDANCE)).toBeTruthy();
    expect(within(section).getByRole("heading", { level: 3, name: "Determining rule" })).toBeTruthy();
    expect(
      within(section).getByText("§ 4.3: the swap meets § 3 and triggers neither condition in § 4.2."),
    ).toBeTruthy();

    const maya = employeeBlock(section, "Maya Thibodeaux");
    expect(within(maya).getByText("Gave CDU-CON1-0318-N, took CDU-CON1-0319-N.")).toBeTruthy();
    expect(within(maya).getByText("Off duty before CDU-CON1-0319-N: 36 h.")).toBeTruthy();
    expect(within(maya).getByText("Off duty after CDU-CON1-0319-N: 156 h.")).toBeTruthy();
    expect(within(maya).getByText("No failures and no triggers.")).toBeTruthy();
    expect(within(employeeBlock(section, "Luis Fontenot")).getByText("No failures and no triggers.")).toBeTruthy();
    expect(within(section).queryByRole("heading", { name: "Review triggers" })).toBeNull();
    expect(within(section).queryByRole("heading", { name: "Failures" })).toBeNull();
  });
});

describe("review required, rendered from step-2.json and add-6.json (C4 ADD-6)", () => {
  test("step-2.json: Aisha's § 4.2(a) trigger shows the 11 h figure, both shifts and 'changed by this swap'", async () => {
    const { section } = await renderResult(fixtures.step2, REVIEW_HEADING);

    expect(fixtures.step2.guidance).toBe(REVIEW_GUIDANCE);
    expect(within(section).getByText(REVIEW_GUIDANCE)).toBeTruthy();
    expect(within(section).getByText("§ 4.2: the swap meets § 3 but triggers at least one condition in § 4.2.")).toBeTruthy();

    const items = triggerItems(employeeBlock(section, "Aisha Okafor"));
    expect(items).toEqual([
      "§ 4.2(a) — off duty 11 h from 2027-03-09T18:00 to 2027-03-10T05:00 between CDU-CON2-0309-D and HCU-CON1-0310-D, under the 12 h review threshold; changed by this swap.",
    ]);
    expect(items[0]).not.toContain("not changed by this swap");
    expect(within(employeeBlock(section, "Priya Raman")).getByText("No triggers.")).toBeTruthy();
    expect(within(section).queryByRole("heading", { name: "Failures" })).toBeNull();
  });

  test("add-6.json: Tom's § 4.2(b) trigger for 2027-03-15 to 2027-03-21 shows 72 h and 'not changed by this swap'", async () => {
    const { section } = await renderResult(fixtures.add6, REVIEW_HEADING);

    const items = triggerItems(employeeBlock(section, "Tom Broussard"));
    expect(items).toEqual([
      "§ 4.2(b) — 72 h in the seven days 2027-03-15 to 2027-03-21, over the 60 h review threshold; not changed by this swap.",
    ]);
    expect(items[0]).not.toMatch(/(?<!not )changed by this swap/);
    expect(within(employeeBlock(section, "Jerome Guidry")).getByText("No triggers.")).toBeTruthy();
  });
});

describe("no action and no named reviewer (C9 web half)", () => {
  test.each(views)("$name has no approve, send, agree, submit or notify control and only Choose again", async ({
    body,
    heading,
  }) => {
    const { section } = await renderResult(body, heading);

    // The whole document, not just the region.
    const controls = [...screen.queryAllByRole("button"), ...screen.queryAllByRole("link")];
    expect(controls.map((control) => control.textContent)).toEqual(["Choose again"]);
    expect(screen.queryByRole("button", { name: FORBIDDEN_ACTION_NAME })).toBeNull();
    expect(screen.queryByRole("link", { name: FORBIDDEN_ACTION_NAME })).toBeNull();
    expect(
      [...within(section).queryAllByRole("button"), ...within(section).queryAllByRole("link")].map(
        (control) => control.textContent,
      ),
    ).toEqual(["Choose again"]);
  });

  test.each(views)("$name names no reviewing unit or reviewer and renders no employee number", async ({ body, heading }) => {
    const { section } = await renderResult(body, heading);

    expect(section.textContent).not.toMatch(REVIEWER_NAMED);
    expect(fixtures.devUsers.users.length).toBeGreaterThan(0);
    for (const user of fixtures.devUsers.users) {
      expect(section.textContent).not.toContain(user.employeeNumber);
    }
  });

  test("the cannot-be-approved views still name the exception procedure VE-HSSE-PRC-021", async () => {
    const { section } = await renderResult(fixtures.step4, CANNOT_HEADING);

    expect(section.textContent).toContain("VE-HSSE-PRC-021");
  });
});

describe("pilot notices (C10)", () => {
  test.each(views)("$name carries the three notices", async ({ body, heading }) => {
    await renderResult(body, heading);

    const notices = screen.getByRole("complementary", { name: "Pilot notices" });
    for (const text of NOTICE_TEXT) {
      expect(notices.textContent).toContain(text);
    }
    expect(notices.querySelectorAll("p")).toHaveLength(3);
  });

  test.each(views)("$name shows the export stamp from the response body", async ({ body, heading }) => {
    const restamped = {
      ...body,
      exportedAt: "2027-03-07T09:30:00Z",
      exportedAtUtcMinute: "2027-03-07T09:30Z",
      exportedAtSiteLocal: "2027-03-07T03:30",
    };
    await renderAnswering(restamped);
    expect(screen.getByRole("complementary", { name: "Pilot notices" }).textContent).toContain("2027-03-07T08:00Z");

    submit(PICK);
    await screen.findByRole("region", { name: heading });

    const notices = screen.getByRole("complementary", { name: "Pilot notices" });
    expect(notices.textContent).toContain(
      "Roster exported 2027-03-07T09:30Z UTC (2027-03-07T03:30 site time, America/Chicago).",
    );
    expect(notices.textContent).not.toContain("2027-03-07T08:00Z");
    expect(screen.getAllByRole("complementary", { name: "Pilot notices" })).toHaveLength(1);
  });
});

describe("accessibility (C12, NFR-A11Y-001)", () => {
  test.each(views)("$name has no axe-core WCAG A/AA violations", async ({ body, heading }) => {
    const { container, section } = await renderResult(body, heading);

    expect(within(section).getByRole("heading", { level: 2, name: heading })).toBeTruthy();
    expect(within(section).getAllByRole("table")).toHaveLength(body.employees.length);
    expect(await wcagViolations(container)).toEqual([]);
  });
});

describe("guard rejects malformed bodies (C4, C13)", () => {
  const malformed: { name: string; body: unknown }[] = [
    { name: "an unknown trigger rule (4.2(c))", body: withFirstTrigger(fixtures.step2, { rule: "4.2(c)" }) },
    {
      name: "a 4.2(a) trigger with the 4.2(b) code",
      body: withFirstTrigger(fixtures.step2, { code: "seven-day-hours-over-review-threshold" }),
    },
    { name: "a 4.2(a) trigger with a threshold of 11 h", body: withFirstTrigger(fixtures.step2, { thresholdHours: 11 }) },
    { name: "a 4.2(b) trigger with a threshold of 72 h", body: withFirstTrigger(fixtures.add6, { thresholdHours: 72 }) },
    { name: "a trigger with no changedBySwap", body: withFirstTrigger(fixtures.step2, { changedBySwap: undefined }) },
    { name: "a review-required employee with no triggers array", body: withEmployee(fixtures.step2, 1, { triggers: undefined }) },
    { name: "a cannot-be-approved employee with no triggers array", body: withEmployee(fixtures.step4, 0, { triggers: undefined }) },
    { name: "a review-required body with no guidance", body: { ...fixtures.step2, guidance: undefined } },
    {
      name: "an approved-without-review body carrying a trigger",
      body: withEmployee(fixtures.step1, 0, { triggers: fixtures.step2.employees[0]?.triggers }),
    },
    {
      name: "a review-required body with no triggers",
      body: withEmployee(withEmployee(fixtures.step2, 0, { triggers: [] }), 1, { triggers: [] }),
    },
    {
      name: "a review-required body carrying a finding",
      body: withEmployee(fixtures.step2, 1, { findings: fixtures.step4.employees[0]?.findings }),
    },
  ];

  test.each(malformed)("a 200 body with $name shows the unexpected-response error, not a result", async ({ body }) => {
    const { container } = await renderAnswering(body);
    submit(PICK);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(UNEXPECTED_RESPONSE);
    for (const heading of ALL_RESULT_HEADINGS) {
      expect(screen.queryByRole("region", { name: heading })).toBeNull();
    }
    // The picker stays, so the user can try again.
    expect(screen.getByRole("form", { name: "Choose the shifts to swap" })).toBeTruthy();
    expect(await wcagViolations(container)).toEqual([]);
  });
});
