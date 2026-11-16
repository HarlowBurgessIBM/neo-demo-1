# Feature 1 — Check a proposed swap by hand

Status: **Signed off by the Business Engineer, Harlow Burgess, 2026-11-16 (Gate 2).**
Source: [PRD v0.3](prd.md), segment F1 of the [approved segmentation](segmentation.md).
GitHub issue: [#3](https://github.com/HarlowBurgessIBM/neo-demo-1/issues/3) (label `feature`).

## Title

Check a proposed swap by hand against the fatigue standard and qualification records

## What

An operator picks one of their own shifts and one shift of another employee, both in the Crude
Distillation Unit (CDU) or Hydrocracker Unit (HCU). They immediately see the result for **both**
employees under VE-HSSE-STD-014 §§ 3–4, as exactly one of four outcomes:

- approved without review
- review required
- cannot be approved
- cannot determine

For each employee the result shows the off-duty periods next to the swapped shifts, the hours in
the seven-day windows, the qualification outcome, and the § rule that determined the outcome. The
result is built from the nightly roster export and its qualification records.

Every view carries two notices: the export's `exportedAt` time with a statement that only rostered
shifts are counted (PRD F1), and the pilot scope — CDU and HCU only, holdovers not assessed (PRD F2).

A pick that involves a shift outside CDU or HCU is refused **visibly**, with the reason shown,
before any evaluation. It is not one of the four results.

It is a check only. Nothing is stored. Nobody is asked to agree and nobody is notified. No
supervisor task is created. "Approved without review" is a classification, not a stored approval;
there is no approval path at all. A result that fails § 3 says "cannot be approved" and points to
VE-HSSE-PRC-021.

Identity comes from `X-Employee-Number` and `X-Roles` (engineering-standard § 8). Locally it comes
from the development-only user switcher (§ 8.3), which is disabled when `NODE_ENV=production`.
Only the `operator` role may run the check.

### Decided behaviour (BE decisions at sign-off)

1. **Result precedence.** Any B3 condition that makes the check not definitive (stale export,
   shift outside the horizon, missing record, missing or inconsistent export fields) yields
   **cannot determine**, with no pass, fail or review conclusion shown. Otherwise a § 3 failure
   beats review required, which beats approved without review. All failing rules for both
   employees are listed.
2. **Shifts outside the pilot units** are shown and refused with the reason, not hidden. A shift
   that is both outside the pilot units and outside the horizon is refused.
3. **Naming the reviewing unit(s)** on a "review required" result is optional in Feature 1.
   Routing is Feature 3.
4. **Missing versus not qualified.** No qualification data at all for an employee → cannot
   determine. Data present but none covering the shift's unit and role, or expired on the shift's
   start date → § 3.3 failure.
5. **Who may use the check:** the `operator` role only.
6. **B1 all-windows behaviour** is kept as in PRD v0.2 while Q25 is open. Every seven-date window
   within coverage is checked, and windows the swap does not change are labelled as such.

### B3 in Feature 1

Feature 1 covers only the B3 conditions that need no stored requests:

- a missing roster shift or qualification record;
- missing or inconsistent `exportedAt` or `coverage`;
- a shift outside the horizon;
- export age over 26 hours.

The other B3 conditions are first verified later:

| Condition | First verified in |
| --- | --- |
| Employee or shift in another undecided request | Feature 2 |
| Approved-but-not-exported swaps applied on top of the export | Feature 3 |
| Overlay not reapplied once an export shows both shifts | Feature 5 |
| Approved swap contradicted by a later export (B6) | Feature 5 |

## Why

- VE-HSSE-STD-014 § 4.1 permits a swap only if each employee's resulting schedule meets § 3.
- Supervisors say they do not calculate rest hours and cannot see the other unit's roster
  (`docs/discovery/supervisor-interviews.md`, lines 41–44).
- Operators asked for the reason when the answer is "no" (PRD User Goals).
- This is PRD Group B, and it underpins M-1 and M-2.
- It comes first because every later feature depends on a trusted answer to "is this swap
  approvable, and why". A hand-run check lets the Business Engineer, HSSE and the supervisors test
  the rules against real examples before anything is stored or approved. It is PRD milestone M1,
  "Rules check against the sample roster, verified locally".

## KPIs

**Omitted.** No KPI for Feature 1 meets the KPI rule in `AGENTS.md`:

- Feature 1 stores nothing and approves nothing. The pilot outcome metrics M-1 to M-4 need
  approved swaps, decisions and records, which come from Features 3–5, measured over the four-week
  pilot window against the tally baselines.
- The only things Feature 1 could count are checks run or users reaching a result. That is usage,
  which the sponsor will not accept (`docs/discovery/operations-manager-brief.md`, items 10–11).
- No outcome baseline exists for a hand check.

## Constraints

Register: `docs/design/quality/nfr-register.md` (owner Marcus Ellery). PRD-tier NFRs: none
("Standing only"). Feature-tier NFRs: none.

```text
Constraints:
  - NFR-PRIV-001    mapped (standing) — Feature 1 receives employee numbers in headers and handles
                    names and numbers from the roster. Proved at integration · task: every endpoint
                    exercised and captured logs searched for the test data's personal values.
  - NFR-COMP-001    n/a — the record binds a state-changing business decision. Feature 1 makes none
                    and stores nothing; "approved without review" is a classification. The approval
                    record (kickoff § 2.2) first arises in Features 2 and 3, which must map it
                    (segmentation seam S1). Checkable by step ADD-5 and by the absence of any write
                    to any store. Lapses if Feature 1 ever stores or decides.
  - NFR-A11Y-001    mapped (standing) — every Feature 1 view (picker, each of the four results, the
                    refusal) has zero axe-core violations, at static-analysis · task. Colour contrast
                    is not evaluated in the jsdom test environment, so this is partial evidence and
                    not a conformance claim.
  - NFR-PERF-001    mapped (standing) — p95 ≤ 500 ms at 2 req/s for 10 min on staging (kickoff § 5.3),
                    at load/performance · feature-verification. BLOCKED: no staging exists
                    (kickoff § 5.2; engineering-standard § 9). Residual risk owned by Marcus Ellery.
                    No waiver; no Pass will be claimed.
  - NFR-REL-001     mapped (standing) — 99.5 % monthly probe availability, at live-procedure ·
                    operations. Deferred: the production platform is planned and not provisioned
                    (kickoff §§ 5.1, 5.2). No result at feature verification.
  - NFR-COMPAT-001  mapped (standing) — every verification step is completed by hand in the current
                    Microsoft Edge release. The previous major release is NOT TESTED; residual risk
                    owned by Marcus Ellery. Not claimed as met for the previous release.
  - NFR-COMPAT-002  waived — rationale: the pilot is used from control-room desktops only;
                    risk: the application is unverified on tablets and must not be used outside the
                    control rooms; owner: Marcus Ellery; revisit: before any use outside the control
                    rooms, or at the end-of-pilot decision, whichever comes first;
                    signed-by: Harlow Burgess (Business Engineer), Marcus Ellery (register owner;
                    signature relayed by Harlow Burgess at Feature 1 sign-off). Terms: kickoff § 5.4.
```

The COMPAT-002 waiver applies to Feature 1. Whether Features 2–5 each need their own signed copy
is an open item.

## Out of scope

- Storage of any kind, consent and counterparty agreement, sending a request to the other
  employee, supervisor review tasks, routing (C2–C6), decision records (D1–D3), timestamps (H1),
  the approved-swaps list, scheduler handoff and confirmation (E1–E4), the P2 timeline (H2),
  one-way handovers (A2), re-check before approval (B5), and any exception path or override.
- The B3 conditions listed above as first verified in later features.
- Holdovers, units other than CDU and HCU, tablets, any client other than control-room desktops,
  hosting and provisioning, the production export, and any change to `docs/standards/`,
  `docs/discovery/`, `data/` or the NFR register.

## Open items carried (not resolved)

- **Q25** (owner Simone Arceneaux): does an existing breach or trigger the swap does not change
  stop the swap? B1 keeps the v0.2 all-windows behaviour meanwhile. Step ADD-6 depends on it. It
  changes none of the expected results of steps 1–8.
- **Q26** (owners Marcus Ellery and Simone Arceneaux): the scheduler's role and unit-scoped
  review. Feature 1 gates on `X-Roles` but builds no review actions.
- **Q16:** requests around shift change. Feature 1 records no times, so it is not engaged.
- **Tablet waiver for Features 2–5:** whether each needs its own signed copy.
- **Three-year retention candidate:** Feature 1 writes no record, so it is not engaged. Carried
  to Features 2–4.

## Verification steps

Run by hand in the local environment, in the current Microsoft Edge release.

### Setup

- Start the API and web app (`npm run dev:api`, `npm run dev:web`).
- Set `SHIFTSWAP_NOW=2027-03-07T14:00:00Z` unless a step says otherwise. Restart the API after
  changing it.
- Use the user switcher to act as the named operator, role `operator`.

| Operator | Employee number |
| --- | --- |
| Maya Thibodeaux | 104417 |
| Luis Fontenot | 102286 |
| Aisha Okafor | 106640 |
| Priya Raman | 107903 |
| Tom Broussard | 103078 |
| Jerome Guidry | 108529 |
| Dwayne Hebert | 101152 |
| Nadia Trahan | 109364 |

Facts used by every step:

- Times are site-local (America/Chicago). Clocks go forward on Sun 14 Mar 2027 at 02:00 CST →
  03:00 CDT, so an interval crossing that instant has one hour less elapsed than the clock
  difference.
- `exportedAt` is 2027-03-07T08:00Z, which is 02:00 on 7 Mar site time, so the export date is
  7 Mar. Coverage is 1–28 Mar. Determinable shifts start 7–22 Mar.
- At the default clock the export is 6 h old.

**Pass condition for every step:** the result, the employee named, the rule and the figures all
match what is stated. Steps 3–6 must also show the VE-HSSE-PRC-021 pointer and no approve control.

### Step 1 — Approved without review

Act as Maya Thibodeaux. Give CDU-CON1-0318-N; take Luis Fontenot's CDU-CON1-0319-N.

**Expected: approved without review.** No § 3 failure and no § 4.2 trigger for either employee.

- Maya takes 0319-N (19 Mar 18:00 → 20 Mar 06:00):
  - before: her 0317-N ends 18 Mar 06:00 → 19 Mar 18:00 = **36 h**;
  - after: 20 Mar 06:00 → 0326-N on 26 Mar 18:00 = 6 d 12 h = **156 h**;
  - worst window containing the swapped shift: 13–19 Mar = 0313-D, 0316-N, 0317-N, 0319-N =
    4 × 12 = **48 h**;
  - CDU/CONSOLE valid through 2028-01-31;
  - her untouched rest 0316-N → 0317-N is exactly 12 h — not under 12, so no trigger.
- Luis takes 0318-N (18 Mar 18:00 → 19 Mar 06:00):
  - before: his 0316-D ends 16 Mar 18:00 → 18 Mar 18:00 = **48 h**;
  - after: 19 Mar 06:00 → 0320-N on 20 Mar 18:00 = **36 h**;
  - worst window: 12–18 Mar = 0312-D, 0315-D, 0316-D, 0318-N = **48 h**;
  - CDU/CONSOLE valid through 2027-12-31.

### Step 2 — Review required

Act as Aisha Okafor. Give HCU-CON2-0312-N; take Priya Raman's HCU-CON1-0310-D.

**Expected: review required**, § 4.2(a), for Aisha. Neither employee fails § 3.

- Aisha takes 0310-D (10 Mar 05:00–17:00):
  - before: her CDU-CON2-0309-D ends 9 Mar 18:00 → 10 Mar 05:00 = **11 h** — not under 11, so
    § 3.1 passes; under 12, so review is triggered;
  - after: 10 Mar 17:00 → HCU-CON2-0315-D on 15 Mar 05:00 = 4 d 12 h = 108 h on the clock,
    minus 1 h for the clock change = **107 h** elapsed;
  - worst window containing the swapped shift: **36 h** (0308-D, 0309-D, 0310-D);
  - untouched window 14–20 Mar = 0315, 0316, 0318, 0319, 0320 = **60 h** exactly — not over 60;
  - HCU/CONSOLE valid through 2028-03-31.
- Priya takes 0312-N (12 Mar 17:00 → 13 Mar 05:00 CST):
  - before: her 0309-D ends 9 Mar 17:00 → 12 Mar 17:00 = **72 h**;
  - after: 13 Mar 05:00 → HCU-FLD1-0316-D on 16 Mar 05:00 CDT = 72 h on the clock, **71 h**
    elapsed;
  - worst window: **36 h**;
  - HCU/CONSOLE valid through 2027-03-15, which is on or after 12 Mar, so valid.
- Both swapped shifts are HCU. If the result names a reviewing unit, it is HCU only.

### Step 3 — Cannot be approved: § 3.1, Luis

Act as Maya Thibodeaux. Give CDU-CON1-0310-D; take Luis Fontenot's CDU-CON1-0312-D.

**Expected: cannot be approved**, § 3.1, for **Luis Fontenot** (0 h).

- Luis takes 0310-D: his CDU-CON1-0309-N ends 10 Mar 06:00 and 0310-D starts 10 Mar 06:00 →
  **0 h** off duty, under 11.
- Maya passes with no trigger:
  - before: 0309-D ends 9 Mar 18:00 → 0312-D on 12 Mar 06:00 = **60 h**;
  - after: 0312-D ends 12 Mar 18:00 → 0313-D on 13 Mar 06:00 = **12 h** exactly;
  - window 12–18 Mar = 0312-D, 0313-D, 0316-N, 0317-N, 0318-N = **60 h** exactly.
- Only Luis is named as failing.

### Step 4 — Cannot be approved: § 3.1, Maya, across the clock change

Act as Maya Thibodeaux. Give CDU-CON1-0310-D; take Dwayne Hebert's HCU-CON1-0314-D.

**Expected: cannot be approved**, § 3.1, for **Maya** — **10 h** elapsed, although the clock
difference is 11 h.

- Maya takes 0314-D (14 Mar 05:00–17:00 CDT):
  - before: her 0313-D ends 13 Mar 18:00 CST → 14 Mar 05:00 CDT = 11 h on the clock, **10 h**
    elapsed;
  - after: 14 Mar 17:00 → CDU-CON1-0316-N on 16 Mar 18:00 = **49 h**;
  - windows 12–18 and 13–19 Mar = 0313-D, 0314-D, 0316-N, 0317-N, 0318-N = **60 h**;
  - HCU/CONSOLE valid through 2027-09-30.
- Dwayne passes with no trigger:
  - takes CDU-CON1-0310-D; before: his HCU-CON1-0302-N ends 3 Mar 05:00 → 10 Mar 06:00 =
    7 d 1 h = **169 h**;
  - after: 10 Mar 18:00 → HCU-CON1-0312-N on 12 Mar 17:00 = **47 h**;
  - window 10–16 Mar = 0310-D, 0312-N, 0315-D, 0316-D = **48 h**; untouched window 15–21 Mar =
    **60 h** exactly;
  - CDU/CONSOLE valid through 2027-11-30.
- The screen must say 10 h. A figure of 11 h means the clock change is not applied (PRD B2).

### Step 5 — Cannot be approved: § 3.2, Tom

Act as Tom Broussard. Give CDU-FLD1-0309-D; take Jerome Guidry's CDU-FLD1-0318-D.

**Expected: cannot be approved**, § 3.2, for **Tom Broussard** — **84 h** in 15–21 Mar, over 72.

- Tom: the 15–21 Mar window holds 0315-D, 0316-D, 0317-D, 0318-D, 0319-N, 0320-N, 0321-N =
  7 × 12 = **84 h**. Windows 14–20 and 16–22 Mar are 72 h exactly. Rests next to 0318-D are
  12 h and 24 h. CDU/FIELD valid through 2028-05-31.
- Jerome passes with no trigger:
  - takes CDU-FLD1-0309-D; before: his 0302-D ends 2 Mar 18:00 → 9 Mar 06:00 = **156 h**;
  - after: 9 Mar 18:00 → 0311-D on 11 Mar 06:00 = **36 h**;
  - his 0313-N (13 Mar 18:00 CST → 14 Mar 06:00 CDT) is **11 h** elapsed;
  - window 7–13 Mar = 12 + 12 + 12 + 11 = **47 h**;
  - CDU/FIELD valid through 2028-01-31.

### Step 6 — Cannot be approved: § 3.3, Priya

Act as Priya Raman. Give HCU-CON1-0308-D; take Dwayne Hebert's HCU-CON1-0317-D.

**Expected: cannot be approved**, § 3.3, for **Priya Raman**.

- Priya's HCU/CONSOLE qualification is valid through 2027-03-15. The shift starts 17 Mar, so it
  is not valid on the start date. Her rests (0316-D → 0317-D = **12 h**; 0317-D → 0318-D =
  **12 h**) and worst window (**48 h**) are fine, so § 3.3 is the only failure.
- Dwayne passes with no trigger:
  - takes HCU-CON1-0308-D; before: 0302-N ends 3 Mar 05:00 → 8 Mar 05:00 = **120 h**;
  - after: 8 Mar 17:00 → 0312-N on 12 Mar 17:00 = **96 h**;
  - worst window 8–14 Mar = 0308-D, 0312-N, 0314-D = **36 h**;
  - HCU/CONSOLE valid through 2028-02-29.

### Step 7 — Cannot determine: export too old

Restart the API with `SHIFTSWAP_NOW=2027-03-08T12:00:00Z`. Act as Maya Thibodeaux and repeat
step 1: give CDU-CON1-0318-N; take Luis Fontenot's CDU-CON1-0319-N.

**Expected: cannot determine** — the export is older than 26 hours. No pass, fail or review
conclusion is shown.

- Age: 2027-03-08T12:00Z − 2027-03-07T08:00Z = 24 h + 4 h = **28 h**, over 26.
- The shifts are still inside the horizon, which is anchored to the export date, not the clock.
- The result still shows `exportedAt` and the pilot notices.

### Step 8 — Refused: shift outside the pilot units

Act as Maya Thibodeaux. Give CDU-CON1-0318-N; take Nadia Trahan's FCC-CON1-0318-D.

**Expected: refused as outside the pilot units** (CDU and HCU only), naming the FCC shift, before
any evaluation. It is not one of the four results, and no § 3 outcome appears.

### ADD-1 — Notices on every view

During steps 1, 2, 3, 7 and 8, confirm on the pick view, on each result view and on the refusal
view: the `exportedAt` time (2027-03-07T08:00Z, which is 02:00 on 7 Mar site time); the
statement that only rostered shifts are counted; and the pilot-scope notice (CDU and HCU only,
holdovers not assessed).

### ADD-2 — Only your own shifts to give

Act as Maya Thibodeaux: the shifts offered to give are Maya's only. Switch to Luis Fontenot:
Luis's only. The other employee's shifts are offered on the take side.

### ADD-3 — Horizon

Act as Jerome Guidry. Give CDU-FLD1-0318-D (18 Mar, inside); take Luis Fontenot's
CDU-CON1-0326-D (26 Mar, outside 7–22 Mar).

**Expected: cannot determine**, naming the 26 Mar shift as outside the determinable range. Had it
been evaluated, both would pass: Jerome's rests are 288 h (14 Mar 06:00 → 26 Mar 06:00) and 24 h;
Luis's are 36 h and 24 h with a worst window of 60 h exactly; qualifications valid. The horizon
alone causes the result.

### ADD-5 — Nothing stored, no approval path

After steps 1–6, restart the API and web app. Open as Maya Thibodeaux, then Luis Fontenot, then
Priya Raman.

**Expected:** no history of earlier checks; no pending request or notification for anyone; no
approve, send, agree or submit control on any result, including "approved without review"; every
"cannot be approved" result points to VE-HSSE-PRC-021. This is the evidence for NFR-COMP-001 `n/a`.

### ADD-6 — Q25 observation (conditional on Q25 staying unanswered)

Act as Tom Broussard. Give CDU-FLD1-0309-D; take Jerome Guidry's CDU-FLD1-0311-D.

Tom's untouched window 15–21 Mar = 0315-D, 0316-D, 0317-D, 0319-N, 0320-N, 0321-N = 6 × 12 =
**72 h** — not over 72, so § 3.2 passes; over 60, so § 4.2(b) triggers on a window the swap does
not change.

**Expected while Q25 is open: review required**, with the 15–21 Mar window labelled as not changed
by this swap. If Q25 is answered the other way, the expected result becomes approved without
review, and this step is revised.

## Left to task validation criteria

- The exact 26-hour age boundary (exactly 26 h is definitive; any amount over is cannot determine).
- The exact horizon boundaries (shifts starting 7 and 22 Mar inside; 6 and 23 Mar outside). The
  sample has no shift starting on those dates.
- Missing or inconsistent export data and qualification records, as fixtures.
- The user switcher disabled when `NODE_ENV=production`.

## Signed off by (BE)

Harlow Burgess, Business Engineer (IT Applications; kickoff § 1.2) — 2026-11-16.
