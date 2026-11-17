import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "./App";
import { wcagViolations } from "./axe";
import { fixtures, installFixtureFetch } from "./test-support/fixtureFetch";
import type { FixtureFetchOptions } from "./test-support/fixtureFetch";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const GIVE_PICK = "CDU-CON1-0318-N";
// Named literally because criterion C11 names it; the first test under C15 ties it to the fixture.
const FCC_TAKE = "FCC-CON1-0318-D";
const SECTION_SIGN = "\u00a7";

/** The step-8 fixture's outside-pilot-units reason, which is the one the refusal view words by unit. */
function outsidePilotReason() {
  for (const reason of fixtures.step8.reasons) {
    if (reason.code === "outside-pilot-units") {
      return reason;
    }
  }
  throw new Error("step-8.json has no outside-pilot-units reason.");
}

function selectElement(name: string): HTMLSelectElement {
  const element = screen.getByRole("combobox", { name });
  if (!(element instanceof HTMLSelectElement)) {
    throw new Error(`${name} is not a select element.`);
  }
  return element;
}

/** The values of a select's options, without the empty placeholder. */
function optionValues(select: HTMLSelectElement): string[] {
  const values = within(select)
    .getAllByRole("option")
    .map((option) => option.getAttribute("value") ?? "");
  expect(values.filter((value) => value === "")).toHaveLength(1);
  return values.filter((value) => value !== "");
}

function ids(shifts: { shiftId: string }[]): string[] {
  return shifts.map((shift) => shift.shiftId);
}

async function renderWithUsersLoaded(options?: FixtureFetchOptions) {
  const fetchStub = installFixtureFetch(options);
  const view = render(<App />);
  await waitFor(() => {
    expect(within(selectElement("Act as (development only)")).getAllByRole("option")).toHaveLength(
      fixtures.devUsers.users.length + 1,
    );
  });
  return { fetchStub, ...view };
}

/** Chooses a user and waits until that user's picker has loaded. */
async function chooseUser(employeeNumber: string) {
  fireEvent.change(selectElement("Act as (development only)"), { target: { value: employeeNumber } });
  await screen.findByRole("form", { name: "Choose the shifts to swap" });
}

function pick(give: string, take: string) {
  fireEvent.change(selectElement("Shift to give"), { target: { value: give } });
  fireEvent.change(selectElement("Shift to take"), { target: { value: take } });
}

function checkSwap() {
  fireEvent.click(screen.getByRole("button", { name: "Check swap" }));
}

async function renderPickerFor104417() {
  const rendered = await renderWithUsersLoaded();
  await chooseUser("104417");
  return rendered;
}

async function renderRefusal() {
  const rendered = await renderPickerFor104417();
  pick(GIVE_PICK, FCC_TAKE);
  checkSwap();
  const refusal = await screen.findByRole("region", { name: "Swap refused" });
  return { ...rendered, refusal };
}

const NOTICE_TEXT = ["2027-03-07T08:00Z", "02:00", "rostered shifts only", "CDU and HCU only", "holdovers not assessed"];

describe("picker from the shared fixtures (C10)", () => {
  test("the give options equal the 104417 fixture's give list, in order", async () => {
    await renderPickerFor104417();
    expect(optionValues(selectElement("Shift to give"))).toEqual(ids(fixtures.shifts104417.give));
  });

  test("switching to 102286 replaces the give options with Luis's, and back again restores 104417's", async () => {
    await renderPickerFor104417();

    await chooseUser("102286");
    await waitFor(() => {
      expect(optionValues(selectElement("Shift to give"))).toEqual(ids(fixtures.shifts102286.give));
    });
    const luisGive = optionValues(selectElement("Shift to give"));
    for (const mayaId of ids(fixtures.shifts104417.give)) {
      expect(luisGive).not.toContain(mayaId);
    }

    await chooseUser("104417");
    await waitFor(() => {
      expect(optionValues(selectElement("Shift to give"))).toEqual(ids(fixtures.shifts104417.give));
    });
    expect(optionValues(selectElement("Shift to take"))).toContain(FCC_TAKE);
    expect(optionValues(selectElement("Shift to take"))).toEqual(ids(fixtures.shifts104417.take));
  });

  test("selecting the FCC shift and checking posts the pick with 104417's identity and renders the refusal", async () => {
    const { fetchStub, refusal } = await renderRefusal();

    const posts = fetchStub.callsTo("/api/swap-checks");
    expect(posts).toHaveLength(1);
    const [post] = posts;
    expect(post?.method).toBe("POST");
    expect(JSON.parse(post?.body ?? "null")).toEqual({ giveShiftId: GIVE_PICK, takeShiftId: FCC_TAKE });
    expect(post?.headers.get("X-Employee-Number")).toBe("104417");
    expect(post?.headers.get("X-Roles")).toBe("operator");

    expect(within(refusal).getByRole("heading", { level: 2, name: "Swap refused" })).toBeTruthy();
    const reason = outsidePilotReason();
    expect(refusal.textContent).toContain(`${reason.shiftId} is in ${reason.unit},`);
    // The picker is replaced by the refusal.
    expect(screen.queryByRole("form", { name: "Choose the shifts to swap" })).toBeNull();
  });
});

describe("pilot notices (C11)", () => {
  test("the picker view contains the roster export instant and every pilot caveat", async () => {
    const { container } = await renderPickerFor104417();
    for (const text of NOTICE_TEXT) {
      expect(container.textContent).toContain(text);
    }
  });

  test("the refusal view contains the same notices, names the FCC shift and has no section-sign text", async () => {
    const { container } = await renderRefusal();
    const notices = screen.getByRole("complementary", { name: "Pilot notices" });
    for (const text of NOTICE_TEXT) {
      expect(notices.textContent).toContain(text);
    }
    expect(container.textContent).toContain(FCC_TAKE);
    // The page must not cite a section of the rules; any section sign is a leak.
    expect(container.textContent).not.toContain(SECTION_SIGN);
  });
});

describe("accessibility (C14)", () => {
  test("the picker with the switcher shown and a selection made has no axe-core WCAG A/AA violations", async () => {
    const { container } = await renderPickerFor104417();
    pick(GIVE_PICK, FCC_TAKE);
    expect(selectElement("Act as (development only)").value).toBe("104417");
    expect(selectElement("Shift to give").value).toBe(GIVE_PICK);
    expect(selectElement("Shift to take").value).toBe(FCC_TAKE);
    expect(await wcagViolations(container)).toEqual([]);
  });

  test("the refusal view has no axe-core WCAG A/AA violations", async () => {
    const { container } = await renderRefusal();
    expect(await wcagViolations(container)).toEqual([]);
  });
});

describe("owner names on take options (C18)", () => {
  const HELD_BY = " held by ";

  test("the take options for CDU-CON1-0319-N and FCC-CON1-0318-D name Luis Fontenot and Nadia Trahan", async () => {
    await renderPickerFor104417();
    const takeSelect = selectElement("Shift to take");

    const luis = within(takeSelect).getByRole("option", { name: /CDU-CON1-0319-N.*Luis Fontenot/ });
    expect(luis.getAttribute("value")).toBe("CDU-CON1-0319-N");

    const nadia = within(takeSelect).getByRole("option", { name: /FCC-CON1-0318-D.*Nadia Trahan/ });
    expect(nadia.getAttribute("value")).toBe("FCC-CON1-0318-D");
  });

  test("every take option's accessible name contains the owner name from its fixture entry", async () => {
    await renderPickerFor104417();
    const takeSelect = selectElement("Shift to take");
    expect(fixtures.shifts104417.take.length).toBeGreaterThan(0);

    for (const entry of fixtures.shifts104417.take) {
      const matches = within(takeSelect).getAllByRole("option", {
        name: (accessibleName) => accessibleName.includes(entry.shiftId) && accessibleName.includes(entry.ownerName),
      });
      expect(matches.map((option) => option.getAttribute("value"))).toEqual([entry.shiftId]);
    }
  });

  test("every take option says who holds it, and no give option does", async () => {
    await renderPickerFor104417();
    const heldBy = { name: (accessibleName: string) => accessibleName.includes(HELD_BY) };

    const takeHeld = within(selectElement("Shift to take")).getAllByRole("option", heldBy);
    expect(takeHeld).toHaveLength(fixtures.shifts104417.take.length);

    const giveOptions = within(selectElement("Shift to give")).getAllByRole("option");
    expect(giveOptions).toHaveLength(fixtures.shifts104417.give.length + 1);
    expect(within(selectElement("Shift to give")).queryAllByRole("option", heldBy)).toEqual([]);
    for (const owner of new Set(fixtures.shifts104417.take.map((entry) => entry.ownerName))) {
      expect(giveOptions.some((option) => (option.textContent ?? "").includes(owner))).toBe(false);
    }
  });

  test("the picker showing owner names has no axe-core WCAG A/AA violations", async () => {
    const { container } = await renderPickerFor104417();
    expect(
      within(selectElement("Shift to take")).getByRole("option", { name: /CDU-CON1-0319-N.*Luis Fontenot/ }),
    ).toBeTruthy();
    expect(await wcagViolations(container)).toEqual([]);
  });
});

describe("refusal from the fixture file (C15)", () => {
  test("the FCC shift the tests pick is the step-8 fixture's refused shift", () => {
    expect(FCC_TAKE).toBe(outsidePilotReason().shiftId);
  });

  test("the refusal list has one item per reason in step-8.json", async () => {
    const { refusal } = await renderRefusal();
    expect(within(refusal).getAllByRole("listitem")).toHaveLength(fixtures.step8.reasons.length);
  });
});

describe("not evaluated (501)", () => {
  const notEvaluated: FixtureFetchOptions = {
    swapCheck: (_call, requested) =>
      requested?.giveShiftId === GIVE_PICK && requested.takeShiftId === "CDU-CON1-0319-N"
        ? { status: 501, body: { kind: "not-evaluated" } }
        : undefined,
  };

  async function renderNotEvaluated() {
    const rendered = await renderWithUsersLoaded(notEvaluated);
    await chooseUser("104417");
    pick(GIVE_PICK, "CDU-CON1-0319-N");
    checkSwap();
    const section = await screen.findByRole("region", { name: "Not evaluated" });
    return { ...rendered, section };
  }

  test("shows the not-evaluated view with the notices and exactly the shipped copy", async () => {
    const { section } = await renderNotEvaluated();

    expect(within(section).getByRole("heading", { level: 2, name: "Not evaluated" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Swap refused" })).toBeNull();
    const notices = screen.getByRole("complementary", { name: "Pilot notices" });
    for (const text of NOTICE_TEXT) {
      expect(notices.textContent).toContain(text);
    }
    // Heading, paragraph and the "Choose again" button, in order. Any other wording is a copy change to review.
    expect(section.textContent).toBe(
      "Not evaluated" +
        "The pick passed the pilot-scope checks. Evaluation is not available yet." +
        "Choose again",
    );
    expect(section.textContent).not.toMatch(/outcome/i);
  });

  test("the not-evaluated view has no axe-core WCAG A/AA violations", async () => {
    const { container } = await renderNotEvaluated();
    expect(await wcagViolations(container)).toEqual([]);
  });
});

describe("focus on view changes", () => {
  test("focus moves to the refusal heading, and Choose again returns focus to the Shift to give select", async () => {
    const { refusal } = await renderRefusal();
    const heading = within(refusal).getByRole("heading", { level: 2, name: "Swap refused" });
    await waitFor(() => {
      expect(document.activeElement).toBe(heading);
    });

    fireEvent.click(within(refusal).getByRole("button", { name: "Choose again" }));

    await screen.findByRole("form", { name: "Choose the shifts to swap" });
    await waitFor(() => {
      expect(document.activeElement).toBe(selectElement("Shift to give"));
    });
  });
});
