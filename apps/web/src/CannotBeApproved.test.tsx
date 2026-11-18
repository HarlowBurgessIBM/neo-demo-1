import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";
import { wcagViolations } from "./axe";
import type { CannotBeApprovedResponse, EmployeeResult, SwapPick } from "./contract";
import { fixtures, installFixtureFetch } from "./test-support/fixtureFetch";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Only the 104417 and 102286 shift lists exist as fixtures, so every test acts as Maya (104417). The
// stub answers with the fixture whatever the pick, and "You" is always the give party, so the pick
// does not change what is rendered.
const PICK: SwapPick = { giveShiftId: "CDU-CON1-0301-D", takeShiftId: "HCU-CON1-0301-D" };

const PROCEDURE = "VE-HSSE-PRC-021";
/** What a button or link must never be called on a page that cannot approve anything. */
const FORBIDDEN_ACTION_NAME = /approve|send|agree|submit|notify/i;
const UNEXPECTED_RESPONSE = "Could not check the swap. The server answered with an unexpected status (200).";

const MAYA_BEFORE_FINDING =
  "Maya Thibodeaux: § 3.1 — off duty 10 h between CDU-CON1-0313-D and HCU-CON1-0314-D, under the 11 h minimum; changed by this swap.";
const LUIS_FINDING =
  "Luis Fontenot: § 3.1 — off duty 0 h between CDU-CON1-0309-N and CDU-CON1-0310-D, under the 11 h minimum; changed by this swap.";
const PRIYA_CHANGED_FINDING =
  "Priya Raman: § 3.3 — HCU CONSOLE, shift HCU-CON1-0317-D starting 2027-03-17, valid through 2027-03-15; changed by this swap.";
const PRIYA_UNCHANGED_FINDING =
  "Priya Raman: § 3.3 — HCU CONSOLE, shift HCU-CON1-0323-D starting 2027-03-23, valid through 2027-03-15; not changed by this swap.";

/** The employee on one side of a fixture's swap, and the name the roster gave them. */
function employeeOf(body: CannotBeApprovedResponse, party: EmployeeResult["party"]): EmployeeResult {
  const employee = body.employees.find((candidate) => candidate.party === party);
  if (employee === undefined) {
    throw new Error(`The fixture has no ${party}.`);
  }
  return employee;
}

function nameOf(employee: EmployeeResult): string {
  if (employee.name === null) {
    throw new Error(`The ${employee.party} in the fixture has no name.`);
  }
  return employee.name;
}

// Names come from the fixtures; the rest of each sentence is the approved wording, spelled out.
const TOM = employeeOf(fixtures.step5, "give-shift-owner");
const JEROME = employeeOf(fixtures.step5, "take-shift-owner");
const LUIS_WINDOW_OWNER = employeeOf(fixtures.unchangedWindow, "take-shift-owner");
const TOM_WINDOW_FINDING = `${nameOf(TOM)}: § 3.2 — 84 h in the seven days 2027-03-15 to 2027-03-21, over the 72 h maximum; changed by this swap.`;
const LUIS_WINDOW_FINDING = `${nameOf(LUIS_WINDOW_OWNER)}: § 3.2 — 84 h in the seven days 2027-03-22 to 2027-03-28, over the 72 h maximum; not changed by this swap.`;

const cases: { name: string; body: CannotBeApprovedResponse; failures: string[] }[] = [
  { name: "Step 3 (step-3.json)", body: fixtures.step3, failures: [LUIS_FINDING] },
  { name: "Step 4 (step-4.json)", body: fixtures.step4, failures: [MAYA_BEFORE_FINDING] },
  { name: "Step 6 (step-6.json)", body: fixtures.step6, failures: [PRIYA_CHANGED_FINDING] },
  {
    name: "unchanged shift § 3.3 (unchanged-shift-qualification.json)",
    body: fixtures.unchangedShift,
    failures: [PRIYA_UNCHANGED_FINDING],
  },
  { name: "Step 5 (step-5.json)", body: fixtures.step5, failures: [TOM_WINDOW_FINDING] },
  {
    name: "unchanged window § 3.2 (unchanged-window-hours.json)",
    body: fixtures.unchangedWindow,
    failures: [LUIS_WINDOW_FINDING],
  },
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

async function renderCannotBeApproved(body: unknown) {
  const rendered = await renderAnswering(body);
  submit(PICK);
  const section = await screen.findByRole("region", { name: "Cannot be approved" });
  return { ...rendered, section };
}

/** The items of the "Failures" list: one per finding, across both employees. */
function failureItems(section: HTMLElement): string[] {
  const list = within(section).getByRole("heading", { level: 3, name: "Failures" }).nextElementSibling;
  if (!(list instanceof HTMLElement)) {
    throw new Error("The Failures heading is not followed by a list.");
  }
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

/** The block under an employee's heading: their shifts, off-duty figures and any "No failures." line. */
function employeeBlock(section: HTMLElement, name: string): HTMLElement {
  const block = within(section).getByRole("heading", { level: 3, name }).parentElement;
  if (block === null) {
    throw new Error(`The heading for ${name} has no block around it.`);
  }
  return block;
}

/** The caption the view gives an employee's window table. */
function windowCaption(employee: EmployeeResult): string {
  return `${nameOf(employee)}: hours in each seven-day window (§ 3.2, at most 72 h)`;
}

/** The one window table in an employee's block, found by its role and accessible name. */
function windowTable(section: HTMLElement, employee: EmployeeResult): HTMLElement {
  const block = employeeBlock(section, nameOf(employee));
  expect(within(block).getAllByRole("table")).toHaveLength(1);
  return within(block).getByRole("table", { name: windowCaption(employee) });
}

/** The body rows of a window table, as the texts of their cells. The header row is not included. */
function windowRows(table: HTMLElement): string[][] {
  const [header, ...rows] = within(table).getAllByRole("row");
  expect(header).toBeDefined();
  return rows.map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent ?? ""));
}

/** The "Hours" and "Changed by the swap" cells of the row for the window `dates`, e.g. "2027-03-15 to 2027-03-21". */
function windowRow(table: HTMLElement, dates: string): string[] {
  const matches = windowRows(table).filter((cells) => cells[0] === dates);
  expect(matches).toHaveLength(1);
  return (matches[0] ?? []).slice(1);
}

/** Body of the step-5 fixture with `change` applied to Tom's entry (the first employee). */
function withTom(change: (employee: EmployeeResult) => Record<string, unknown>) {
  return {
    ...fixtures.step5,
    employees: fixtures.step5.employees.map((employee, index) => (index === 0 ? change(employee) : employee)),
  };
}

/** Body of the step-5 fixture with `patch` applied to Tom's first window. */
function withWindow(patch: Record<string, unknown>) {
  return withTom((employee) => ({
    ...employee,
    windows: employee.windows.map((window, index) => (index === 0 ? { ...window, ...patch } : window)),
  }));
}

/** Body of the step-5 fixture with `patch` applied to Tom's § 3.2 finding. */
function withWindowFinding(patch: Record<string, unknown>) {
  return withTom((employee) => ({
    ...employee,
    findings: employee.findings.map((finding) => ({ ...finding, ...patch })),
  }));
}

/** Body of the step-4 fixture with `patch` applied to Maya's "before" figure. */
function withBeforeFigure(patch: Record<string, unknown>) {
  return {
    ...fixtures.step4,
    employees: fixtures.step4.employees.map((employee, index) =>
      index === 0 ? { ...employee, offDutyBefore: { ...employee.offDutyBefore, ...patch } } : employee,
    ),
  };
}

/** Body of the step-4 fixture with `patch` applied to Maya's one finding. */
function withFinding(patch: Record<string, unknown>) {
  return {
    ...fixtures.step4,
    employees: fixtures.step4.employees.map((employee, index) =>
      index === 0 ? { ...employee, findings: employee.findings.map((finding) => ({ ...finding, ...patch })) } : employee,
    ),
  };
}

describe("every fixture (C10 web half)", () => {
  test.each(cases)("$name names the exception procedure and offers no approve, send, agree, submit or notify control", async ({
    body,
  }) => {
    const { section, container } = await renderCannotBeApproved(body);

    expect(section.textContent).toContain(PROCEDURE);
    expect(container.textContent).toContain(PROCEDURE);
    const controls = [...screen.getAllByRole("button"), ...screen.queryAllByRole("link")];
    expect(controls.map((control) => control.textContent)).toEqual(["Choose again"]);
    expect(screen.queryByRole("button", { name: FORBIDDEN_ACTION_NAME })).toBeNull();
    expect(screen.queryByRole("link", { name: FORBIDDEN_ACTION_NAME })).toBeNull();
  });
});

describe("rendered from the shared fixtures (C12, C17)", () => {
  test("step-4.json: Maya's before figure is 10 h and not 11 h", async () => {
    const { section } = await renderCannotBeApproved(fixtures.step4);

    const maya = employeeBlock(section, "Maya Thibodeaux");
    expect(within(maya).getByText("Off duty before HCU-CON1-0314-D: 10 h.")).toBeTruthy();
    expect(maya.textContent).not.toContain("11 h");
    expect(within(maya).getByText("Off duty after HCU-CON1-0314-D: 49 h.")).toBeTruthy();
    expect(within(maya).getByText("Gave CDU-CON1-0310-D, took HCU-CON1-0314-D.")).toBeTruthy();
  });

  test("step-4.json: the finding shows the employee's name, the § reference, the figure and the swap's effect, and the notices are present", async () => {
    const { section } = await renderCannotBeApproved(fixtures.step4);

    expect(within(section).getByRole("heading", { level: 2, name: "Cannot be approved" })).toBeTruthy();
    expect(failureItems(section)).toEqual([MAYA_BEFORE_FINDING]);
    // The other party has no failure, and the page says so.
    expect(within(employeeBlock(section, "Dwayne Hebert")).getByText("No failures.")).toBeTruthy();
    const notices = screen.getByRole("complementary", { name: "Pilot notices" });
    expect(notices.textContent).toContain("Roster exported 2027-03-07T08:00Z UTC (2027-03-07T02:00 site time, America/Chicago).");
    expect(notices.textContent).toContain("rostered shifts only");
  });

  test("step-3.json: Luis is the only employee named as failing", async () => {
    const { section } = await renderCannotBeApproved(fixtures.step3);

    expect(failureItems(section)).toEqual([LUIS_FINDING]);
    expect(within(employeeBlock(section, "Maya Thibodeaux")).getByText("No failures.")).toBeTruthy();
    expect(within(employeeBlock(section, "Luis Fontenot")).queryByText("No failures.")).toBeNull();
    expect(within(employeeBlock(section, "Luis Fontenot")).getByText("Off duty before CDU-CON1-0310-D: 0 h.")).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Pilot notices" }).textContent).toContain("2027-03-07T08:00Z");
  });

  test("step-6.json: the § 3.3 finding names Priya, the § reference, the shift and the expiry, as changed by the swap", async () => {
    const { section } = await renderCannotBeApproved(fixtures.step6);

    expect(failureItems(section)).toEqual([PRIYA_CHANGED_FINDING]);
    expect(within(employeeBlock(section, "Dwayne Hebert")).getByText("No failures.")).toBeTruthy();
    // "You" is always the give party; the roster name is shown when there is one.
    expect(within(section).queryByRole("heading", { level: 3, name: "You" })).toBeNull();
  });

  test("unchanged-shift-qualification.json: the § 3.3 finding is shown as not changed by the swap", async () => {
    const { section } = await renderCannotBeApproved(fixtures.unchangedShift);

    expect(failureItems(section)).toEqual([PRIYA_UNCHANGED_FINDING]);
    expect(section.textContent).toContain("not changed by this swap");
    expect(section.textContent).not.toMatch(/(?<!not )changed by this swap/);
    expect(within(employeeBlock(section, "Aisha Okafor")).getByText("No failures.")).toBeTruthy();
  });
});

describe("seven-day windows rendered from step-5.json (C8, C11 web half)", () => {
  test("the § 3.2 failure names Tom, the 84 h and the window, and no other failure is listed", async () => {
    const { section } = await renderCannotBeApproved(fixtures.step5);

    expect(failureItems(section)).toEqual([
      "Tom Broussard: § 3.2 — 84 h in the seven days 2027-03-15 to 2027-03-21, over the 72 h maximum; changed by this swap.",
    ]);
    expect(nameOf(TOM)).toBe("Tom Broussard");
    expect(within(employeeBlock(section, nameOf(JEROME))).getByText("No failures.")).toBeTruthy();
  });

  test("Tom's block has one table, named by its caption, with the three column headers", async () => {
    const { section } = await renderCannotBeApproved(fixtures.step5);

    const tom = employeeBlock(section, nameOf(TOM));
    expect(within(tom).getAllByRole("table")).toHaveLength(1);
    const table = within(tom).getByRole("table", { name: windowCaption(TOM) });
    expect(table.querySelector("caption")?.textContent).toBe(
      "Tom Broussard: hours in each seven-day window (§ 3.2, at most 72 h)",
    );
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Dates",
      "Hours",
      "Changed by the swap",
    ]);
    for (const header of within(table).getAllByRole("columnheader")) {
      expect(header.getAttribute("scope")).toBe("col");
    }
    expect(windowRows(table)).toHaveLength(22);
  });

  test.each([
    { name: "Tom", employee: TOM },
    { name: "Jerome", employee: JEROME },
  ])("$name's table has one row per fixture window, with the dates, the hours as sent and the label", async ({
    employee,
  }) => {
    const { section } = await renderCannotBeApproved(fixtures.step5);

    const expected = employee.windows.map((window) => [
      `${window.from} to ${window.to}`,
      window.minutes > 0 ? `${window.hours} h ${window.minutes} m` : `${window.hours} h`,
      window.changedBySwap ? "Changed" : "Not changed",
    ]);
    expect(expected).toHaveLength(22);
    expect(windowRows(windowTable(section, employee))).toEqual(expected);
  });

  test("Tom's 2027-03-15 to 2027-03-21 window shows 84 h and Changed; the windows either side show 72 h", async () => {
    const { section } = await renderCannotBeApproved(fixtures.step5);

    const table = windowTable(section, TOM);
    expect(windowRow(table, "2027-03-15 to 2027-03-21")).toEqual(["84 h", "Changed"]);
    expect(windowRow(table, "2027-03-14 to 2027-03-20")[0]).toBe("72 h");
    expect(windowRow(table, "2027-03-16 to 2027-03-22")[0]).toBe("72 h");
  });

  test("Jerome's 2027-03-07 to 2027-03-13 window shows 47 h, not 48 h", async () => {
    const { section } = await renderCannotBeApproved(fixtures.step5);

    expect(windowRow(windowTable(section, JEROME), "2027-03-07 to 2027-03-13")[0]).toBe("47 h");
  });
});

describe("a § 3.2 window the swap does not change, rendered from unchanged-window-hours.json (C6 web half)", () => {
  test("the one failure ends 'not changed by this swap.' and the section never says the window was changed", async () => {
    const { section } = await renderCannotBeApproved(fixtures.unchangedWindow);

    const items = failureItems(section);
    expect(items).toEqual([LUIS_WINDOW_FINDING]);
    expect(items[0]).toMatch(/ not changed by this swap\.$/);
    expect(section.textContent).not.toMatch(/(?<!not )changed by this swap/);
  });

  test("Luis's 2027-03-22 to 2027-03-28 row shows 84 h and Not changed, and the other employee has no failures", async () => {
    const { section } = await renderCannotBeApproved(fixtures.unchangedWindow);

    expect(nameOf(LUIS_WINDOW_OWNER)).toBe("Luis Fontenot");
    expect(windowRow(windowTable(section, LUIS_WINDOW_OWNER), "2027-03-22 to 2027-03-28")).toEqual(["84 h", "Not changed"]);
    const maya = employeeOf(fixtures.unchangedWindow, "give-shift-owner");
    expect(within(employeeBlock(section, nameOf(maya))).getByText("No failures.")).toBeTruthy();
  });
});

describe("accessibility of each cannot-be-approved view (C14, NFR-A11Y-001)", () => {
  test.each(cases)("$name has no axe-core WCAG A/AA violations", async ({ body, failures }) => {
    const { container, section } = await renderCannotBeApproved(body);

    expect(within(section).getByRole("heading", { level: 2, name: "Cannot be approved" })).toBeTruthy();
    expect(failureItems(section)).toEqual(failures);
    // Each employee's window table is on the page when the axe check runs.
    expect(within(section).getAllByRole("table")).toHaveLength(body.employees.length);
    expect(await wcagViolations(container)).toEqual([]);
  });
});

describe("notices stamp", () => {
  test("the notices show the response's export stamp when it differs from the shifts stamp", async () => {
    const restamped: CannotBeApprovedResponse = {
      ...fixtures.step4,
      exportedAt: "2027-03-07T09:30:00Z",
      exportedAtUtcMinute: "2027-03-07T09:30Z",
      exportedAtSiteLocal: "2027-03-07T03:30",
      siteTimeZone: "America/Chicago",
    };
    const rendered = await renderAnswering(restamped);

    const before = screen.getByRole("complementary", { name: "Pilot notices" });
    expect(before.textContent).toContain("2027-03-07T08:00Z");

    submit(PICK);
    await screen.findByRole("region", { name: "Cannot be approved" });

    const notices = screen.getByRole("complementary", { name: "Pilot notices" });
    expect(notices.textContent).toContain(
      "Roster exported 2027-03-07T09:30Z UTC (2027-03-07T03:30 site time, America/Chicago).",
    );
    expect(notices.textContent).not.toContain("2027-03-07T08:00Z");
    expect(screen.getAllByRole("complementary", { name: "Pilot notices" })).toHaveLength(1);
    expect(await wcagViolations(rendered.container)).toEqual([]);
  });
});

describe("guard rejects malformed figures", () => {
  const malformed: { name: string; body: unknown }[] = [
    { name: "negative hours (-3)", body: withBeforeFigure({ hours: -3 }) },
    { name: "fractional hours (1.5)", body: withBeforeFigure({ hours: 1.5 }) },
    { name: "minutes over 59 (75)", body: withBeforeFigure({ minutes: 75 }) },
    { name: "negative minutes (-1)", body: withBeforeFigure({ minutes: -1 }) },
    { name: "missing hours", body: withBeforeFigure({ hours: undefined }) },
    { name: "minutes over 59 in a finding", body: withFinding({ minutes: 75 }) },
    {
      name: "a finding with an unknown rule and no changedBySwap",
      body: withFinding({ rule: "9.9", code: "other", changedBySwap: undefined }),
    },
    { name: "a window with negative hours (-1)", body: withWindow({ hours: -1 }) },
    { name: "a window with fractional hours (1.5)", body: withWindow({ hours: 1.5 }) },
    { name: "a window with minutes over 59 (60)", body: withWindow({ minutes: 60 }) },
    { name: "a window with changedBySwap as a string", body: withWindow({ changedBySwap: "yes" }) },
    { name: "a window with no from date", body: withWindow({ from: undefined }) },
    { name: "an employee with no windows", body: withTom((employee) => ({ ...employee, windows: undefined })) },
    { name: "windows that are not an array", body: withTom((employee) => ({ ...employee, windows: {} })) },
    { name: "a § 3.2 finding with a maximum of 60 h", body: withWindowFinding({ maximumHours: 60 }) },
    { name: "a § 3.2 finding with minutes over 59 (75)", body: withWindowFinding({ minutes: 75 }) },
    { name: "a § 3.2 finding with the wrong code", body: withWindowFinding({ code: "seven-day-hours-under-maximum" }) },
  ];

  test.each(malformed)("a 200 body with $name shows the unexpected-response error, not the view", async ({ body }) => {
    const { container } = await renderAnswering(body);
    submit(PICK);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(UNEXPECTED_RESPONSE);
    expect(screen.queryByRole("region", { name: "Cannot be approved" })).toBeNull();
    // The picker stays, so the user can try again.
    expect(screen.getByRole("form", { name: "Choose the shifts to swap" })).toBeTruthy();
    expect(await wcagViolations(container)).toEqual([]);
  });

  test("a whole number of hours with minutes from 0 to 59 is accepted", async () => {
    const { section } = await renderCannotBeApproved(withBeforeFigure({ hours: 10, minutes: 59 }));

    expect(within(employeeBlock(section, "Maya Thibodeaux")).getByText("Off duty before HCU-CON1-0314-D: 10 h 59 m.")).toBeTruthy();
  });
});
