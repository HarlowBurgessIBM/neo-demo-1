# Product Requirements Document (PRD)

**Product/Feature Name:** ShiftSwap — shift-swap pilot (Crude Distillation Unit and Hydrocracker Unit, control-room desktops)
**Author:** Product Coach agent; reviewed by Product Engineer
**Status:** **Accepted**, version 0.3. On 2026-11-15, the requester identified themselves as the Business Engineer
assigned by IT Applications under kickoff § 1.2 and accepted this PRD with Q16, Q25 and Q26 open. Their name was not
provided. Earlier statements in this document that no acceptance is recorded describe the status before this
acceptance. No signed waiver exists. Where this PRD says "proposed", an owner or threshold is a suggestion, not an
existing authority.
**Last Updated:** 2026-11-15 (system date of this revision; see Contradictions in the change log — the kickoff record,
including its revision 2, is dated 2026-11-16; that mismatch is **not resolved** here)
**Version:** 0.3 (applies kickoff revision 2 — §§ 3.2 corrected, 3.6 reworded; §§ 1.8, 2.6, 2.7, 4.4, 4.5, 5.7 new —
without changing pilot scope; see the change log)

> **Fictional demo content.** Every source this PRD cites (company, refinery, people, standards, figures) is fictional,
> per the notice in each source file. Source locators below are `path:line` in this repository, except kickoff
> decisions, which are cited by section.
>
> **Evidence convention.** `FACT` = stated in a repository file I read in this session, with a locator. `DECISION` =
> a client decision recorded in `docs/discovery/pilot-kickoff-decisions.md`, cited as "kickoff § n.n"; it is a decision
> or a client statement, not independent verification of the underlying fact. `PROPOSAL` = my recommendation, not a
> sourced fact. `OPEN` = nobody has supplied it. No external statistic is used anywhere in this PRD. Historical figures
> are sourced; illustrative test cases and version identifiers are not historical claims. Numbers that come from the
> kickoff (30 approved swaps, 26 hours, 2 requests per second, 02:00, four weeks, six days, 28 dates, 21 days, 15 days,
> three years) are client decisions or client-stated parameters, cited where used, not measured evidence. A kickoff
> revision records what the client decided; it is not proof that any outcome holds.

---

## TL;DR

> Pilot a tool for the Crude Distillation Unit (CDU) and Hydrocracker Unit (HCU) that checks **both employees'
> resulting schedules, to the extent the roster export covers them**, against the fatigue standard and qualification
> records at request time, routes the swaps the standard says need review to the right supervisors, records every
> decision, and tracks each approved swap until a later roster export shows it entered. The export covers a bounded
> 28-date range (six days before the export date through 21 days after it, kickoff § 3.2), so a swap whose surrounding
> windows fall outside it is reported "cannot determine", never "fine" (kickoff § 3.6). HSSE does not require anything
> outside that coverage to be checked for the swap process (kickoff § 2.6); this PRD does not claim that anything outside
> it is safe. The pilot is the vehicle for *validating* whether this works — it is not presented as proven, and it
> does not address holdovers.

---

## Problem Statement

**Decision context (FACT, with one gap).** The Operations Manager's brief explicitly had not decided to build anything
(`docs/discovery/operations-manager-brief.md:27-28`). The decision to proceed to a PRD for a pilot was made by the
requester of this PRD, who rejected a recommendation to defer because the standard requires checking both employees'
full resulting schedules, and the supervisors say they do not calculate rest hours and cannot see the other unit's
roster (decision recorded verbatim in the Appendix). **Update (v0.2, DECISION):** the sponsor, Dana Whitlock, approved
the pilot (CDU and HCU, control-room desktops), having read the recommendation to defer and the reasons for proceeding
(kickoff § 1.1), and set the success targets (kickoff § 1.4). She delegated accepting this PRD, signing off features and
approving task sets to the Business Engineer assigned by IT Applications, and reviews the pilot's results herself at the
end (kickoff § 1.2). Sponsor approval of the pilot is not acceptance of this PRD.

**Current state (FACT).**

- Operators arrange swaps by text message; a shift supervisor approves and records it in a shared spreadsheet
  (`operations-manager-brief.md:14-15`).
- Nobody checks fatigue limits or qualification at approval; "the supervisor relies on memory"
  (`operations-manager-brief.md:16-17`).
- Supervisors: "I don't calculate rest hours" (`docs/discovery/supervisor-interviews.md:41-42`); cross-unit rosters
  are not visible (`supervisor-interviews.md:43-44`); a Hydrocracker supervisor emails the scheduler after approval,
  "sometimes … two days later" (`supervisor-interviews.md:52`) and cannot know of a lapsed console qualification
  unless training tells him (`supervisor-interviews.md:53`).
- The scheduling system is the system of record, has no swap workflow, and exports the published roster as JSON each
  night (`operations-manager-brief.md:32-34`).
- There is no record of who approved the near-miss swap or what was checked
  (`docs/discovery/near-miss-PA-NM-2026-0193.md:31-32`), while the standard requires a decision record
  (`docs/standards/fatigue-management-policy.md:78-82`).

**Pain — the four-week tally (FACT; self-reported by the two supervisors, not observer-timed;
`supervisor-interviews.md:10-15`, `:35`).** Tally period 2026-10-05 to 2026-11-01, CDU and HCU:

| Measure | Count | Locator |
| --- | --- | --- |
| Swap requests received | 46 | `supervisor-interviews.md:19` |
| Approved / declined | 41 / 5 | `supervisor-interviews.md:20-21` |
| Approved swaps later found to leave an off-duty period under 11 hours | 3 | `supervisor-interviews.md:22` |
| Approved swaps later found to put an operator on a unit or role without a current qualification | 1 | `supervisor-interviews.md:23` |
| Approved swaps not entered in the scheduling system before the shift was worked | 7 | `supervisor-interviews.md:24` |
| Supervisor handling time per request, median (shortest–longest), minutes | 14 (4–55) | `supervisor-interviews.md:26-33` |

Rest-hours and qualification counts are **kept separate**. The tally does not say whether any approved swap is in both
groups, so they are never added. "Not entered in the scheduler" (7) is a different event from "supervisor was told"; the
tally counts entry, not notification. The tally does not record request *times*, so how many requests arrive near a shift
change is unknown (`supervisor-interviews.md:70-71`). The sponsor is not interested in usage figures
(`operations-manager-brief.md:42-43`).

**Why now (FACT + PROPOSAL).** The September near miss (PA-NM-2026-0193, `near-miss-PA-NM-2026-0193.md:8-12`) involved
a swap approved by text without the other unit's roster (`docs/discovery/near-miss-PA-NM-2026-0193.md:27-28`); its recommendations include
checking the off-duty period, seven-day hours and qualification of both employees *before* approval and recording every
decision (`docs/discovery/near-miss-PA-NM-2026-0193.md:36-38`). Revision 3 of the standard, effective 2026-07-01, added the no-review path (§ 4.3) and the
decision-record requirement (§ 4.5) (`fatigue-management-policy.md:94`). The near-miss record lacked the approver
and checks, but the evidence does not establish that every current record is deficient. The
requester has decided that a pilot is the way to learn whether software can do what the supervisors say they cannot.
There is no source for any deadline beyond that.

**What this PRD does not claim.** The near miss's shortfall — 11 hours scheduled, 9 hours 30 minutes actual, after a
holdover to 19:30 (`docs/discovery/near-miss-PA-NM-2026-0193.md:16-19`, `:29-30`) — came from a holdover, which the summary says is "outside the swap
process" and to be reviewed separately (`docs/discovery/near-miss-PA-NM-2026-0193.md:39`). This PRD does not claim the pilot would have prevented it.
Nor does it infer that fatigue caused the 11-minute alarm response (`docs/discovery/near-miss-PA-NM-2026-0193.md:21-23`); the summary draws no such
causal conclusion.

---

## Narrative

*Illustrative scenario — not a recorded event. It is built only from behaviours described in the sources.*

A CDU console operator and an HCU console operator agree to swap a day shift for a day shift. Today the request becomes
a text, then a printout check some time later, then a spreadsheet line; nobody sees both operators' whole schedules, and
the two operators may not learn the outcome until they either both turn up or neither does
(`supervisor-interviews.md:39-40`, `:62`).

In the pilot, the first operator picks the two shifts in ShiftSwap and the second operator agrees on their own screen.
Before any supervisor is involved, ShiftSwap reads the published roster, applies the swap to *both* operators'
schedules, and reports for each person the off-duty period, the hours in every seven-day window, and the qualification
for the unit and role. If a limit is failed, both operators see which rule failed and for whom, immediately — the
operators asked for exactly that (`supervisor-interviews.md:61`, `:63`) — and the swap cannot be approved by this
route. If the data needed to decide is missing, stale or unreconciled, ShiftSwap says "cannot determine" and does not
say "fine". If the swap is compliant but leaves either operator under 12 hours' rest or over 60 hours in a seven-day
window, the supervisor of each affected unit gets a review item showing the figures, rather than a request to
calculate them. Otherwise the standard allows approval without review (`fatigue-management-policy.md:68-71`), and the
supervisors who said "I shouldn't have to touch those at all" (`supervisor-interviews.md:45-46`) do not.

Then the hard part the sponsor named: ShiftSwap cannot write to the roster. An approved swap sits on a visible list as
"awaiting scheduler entry". The site scheduler (Hannah Beaulieu) enters it by hand, and the supervisor of the unit whose
swapped shift starts first makes sure she has it; both work from that list (kickoff § 4.1). It is confirmed only when a
later nightly export shows both shifts against the swapped operators — the next day at the earliest (kickoff § 4.2).
The pilot's job is to find out, against the supervisors' own tally, whether fewer approved swaps breach a limit, fewer
take supervisor time, and fewer reach the shift unentered — and to say plainly if they do not.

---

## Goals & Success Metrics

Success is judged on **outcomes, not usage** (`operations-manager-brief.md:42-45`; `AGENTS.md`, KPIs section). All
baselines below are the **tally figures** from `supervisor-interviews.md`; the pilot results are **self-reported by the
same two supervisors on the same tally-sheet method**, reviewed afterwards by HSSE and payroll as the baseline was
(`supervisor-interviews.md:14-15`). They are not observer-timed and not independently audited. **Targets are now
sponsor decisions (DECISION, kickoff § 1.4):** for M-1, M-3 and M-4 the result must be *strictly better than the tally
baseline*; for M-2 the target is *zero*. Process benefits (fewer supervisor touches, fewer unchecked swaps) are
hypotheses the pilot tests, not proven effects; a pass is an indicative result, not proof the tool caused it.

**Pilot window (DECISION, kickoff § 1.3).** Four weeks (the same length as the tally), starting on a Monday. The start
date is set only once the application is running for pilot users; **no calendar date is set**, and none is given here.

### Business Goals

| # | Goal | Metric (outcome) | Baseline (FACT) | Target / failure condition (DECISION, kickoff § 1.4, unless stated) | Measured by | Window |
| --- | --- | --- | --- | --- | --- | --- |
| M-1 | Fewer approved swaps that breach the minimum off-duty period | Approved swaps later found to leave an off-duty period under 11 h ÷ approved swaps in the window | 3 of 41 approved (`:22`, `:20`) | Proportion strictly better (lower) than the tally baseline of 3/41. **Failed** if equal or higher. **Inconclusive** if fewer than 30 swaps are approved (kickoff § 1.3). | Same post-worked review by HSSE and payroll as the tally, on the roster as swapped (scheduled off-duty periods, not hours actually worked; holdover-caused breaches not counted — kickoff § 2.3); self-reported tally | Four weeks from a Monday (kickoff § 1.3) |
| M-2 | Fewer approved swaps that put someone on a unit/role without a current qualification | Approved swaps later found to leave an operator without a qualification valid on the shift start date ÷ approved swaps in the window | 1 of 41 approved (`:23`, `:20`) | **Zero.** One such swap is a **failure** (kickoff § 1.4). This is a qualification *breach* rule and is distinct from the 30-swap sample rule below; see rule 3. (The earlier strict-improvement-over-1/41 target is superseded.) | As M-1 (qualifications as on the roster as swapped, kickoff § 2.3) | As M-1 |
| M-3 | Less supervisor time per swap request | Median minutes of supervisor handling per request received, including checking. **Every request received counts** (kickoff § 1.8); the figure for each is the supervisor time actually spent on it | 14 min median; 4–55 range; 46 requests; self-reported (`:26-35`) | Median strictly lower than the tally baseline of 14 min. **Failed** if equal or higher. A request is recorded as **zero** supervisor minutes **and is included** in the median where no supervisor acted: a swap approved without supervisor review (kickoff § 1.5), a swap the check blocked, a swap the check could not determine, and a request withdrawn before review (kickoff § 1.8). The **median for reviewed swaps only** is also reported separately (kickoff § 1.5). | Supervisors' self-reported tally sheet, same definition | As M-1 |
| M-4 | Fewer approved swaps that never reach the scheduler in time | Approved swaps not entered in the scheduling system before the shift was worked ÷ approved swaps in the window | 7 of 41 approved (`:24`, `:20`) | Proportion strictly better (lower) than the tally baseline of 7/41. **Failed** if equal or higher. **Inconclusive** if fewer than 30 swaps are approved. | **Payroll's review, run by Gloria Menard, independently of ShiftSwap**, as for the tally (kickoff § 4.3); ShiftSwap's list is supporting information only | As M-1 |

(Locators in the Baseline column are lines of `docs/discovery/supervisor-interviews.md`.)

**Self-reported baselines (kept explicit).** Every baseline above is the supervisors' own four-week tally, not
observer-timed and not independently audited (`supervisor-interviews.md:10-15`, `:35`); the 30-swap threshold and the
"strictly better" rule are sponsor decisions, not statistical tests. The M-3 baseline of 14 minutes was recorded per
request received, and the pilot counts every request received too (kickoff § 1.8), so the populations are aligned.
The baseline measures time from reading the request to recording a decision, including roster checks
(`supervisor-interviews.md:26-27`); the pilot records time actually spent (§ 1.8), so comparability of those
measurement methods remains a limitation. The
pilot's median, however, adds zero-minute requests (no-review approvals, blocked, cannot-determine, and withdrawn before
review — kickoff §§ 1.5, 1.8); the tally's shortest request was 4 minutes (`supervisor-interviews.md:26-33`). A lower
median can therefore reflect requests that need no supervisor at all rather than faster review — which is why the
reviewed-only median is reported alongside. How a request withdrawn after a supervisor has begun reviewing it is
classed for the reviewed-only median is not stated; its actual minutes still count in the all-requests median.

Rules for reading the results:

1. **Separate measures.** M-1 and M-2 are never combined. Missed *entry* (M-4) is never counted as merely *notified*.
2. **Denominators.** The pilot's volume may differ from 46 requests / 41 approved; compare proportions with the stated
   denominators, not raw counts.
3. **Small numbers vs. breaches (DECISION, kickoff §§ 1.3, 1.4).** Two different outcomes must not be confused:
   (a) an **inconclusive sample** — if fewer than 30 swaps are approved in the window, the measures that divide by
   approved swaps (M-1, M-2 proportion, M-4) are reported as *inconclusive*, never as passed; and (b) a **target
   qualification breach** — one swap that put an operator on a unit or role without a current qualification fails the
   zero-breach target (kickoff § 1.4). With fewer than 30 approved swaps, report that failure if observed, while the
   approval-based proportion is inconclusive; with no breach, the proportion is inconclusive, not passed. M-3 is a
   median, not a measure dividing by approved swaps, so the 30-approval rule does not apply to it. A strict improvement
   is an *indicative* result, not statistical
   evidence, and assumption A1 (tally is typical) remains unvalidated. No significance claim is made. If no swaps are
   approved, the approval-based measures are **inconclusive**.
4. **Comparable detection (DECISION, kickoff § 2.3).** The tally's breaches were found by comparing the roster as
   swapped — scheduled off-duty periods and qualifications — not hours actually worked; breaches caused by holdovers
   were not counted. The pilot review uses the same method, so holdover-driven breaches are not counted in M-1 and the
   pilot does not address holdovers (kickoff § 2.4). *Not provided:* the written procedure HSSE followed beyond this
   description.
5. **Declines.** Declines (baseline 5 of 46, `:21`) are not a success or failure measure; more declines are not
   evidence of failure. The pilot records them with the rule cited.
6. **Overall decision.** Whether the pilot "worked" in aggregate, and whether to continue, stop, or extend to field
   tablets (`operations-manager-brief.md:36-37`), is the sponsor's and team's decision, not this document's.

Descriptive only (**no baseline exists, so no target**): time from request to answer for operators, and how many
requests arrive near a shift change (`supervisor-interviews.md:61`, `:70-71`). The pilot records request, agreement
and decision times so that a target can be set later (DECISION, kickoff § 1.6); no time target is set for reviewed
swaps, and the number of requests around a shift change stays **unknown until the pilot records it** (kickoff § 1.7,
Q16). They are not success criteria.

### User Goals

- **Operators:** an answer before they leave shift, with the reason if it is "no", and no more guessing whether a swap
  is approved (`supervisor-interviews.md:61-63`).
- **Supervisors:** not to calculate rest hours or hunt for the other unit's roster, to see the figures when review is
  required, and not to touch swaps the standard says need no review (`supervisor-interviews.md:41-46`).
- **HSSE:** a decision record that meets § 4.5 for every swap (`fatigue-management-policy.md:78-82`).

### Non-Goals (Out of Scope)

1. **Holdovers.** How holdovers are controlled is outside this pilot (`docs/discovery/near-miss-PA-NM-2026-0193.md:39`). The pilot does not prevent,
   detect or model them, and no success criterion depends on them.
2. **Claiming the pilot would have prevented the near miss's rest shortfall.** See Problem Statement.
3. **Proving the pilot is better than a process-only alternative.** That alternative was considered and not chosen
   (see Solution Overview); no comparison is measured.
4. **Any unit other than CDU and HCU, and any client other than control-room desktops.** Field tablets come later, if
   the pilot works (`operations-manager-brief.md:36-37`).
5. **Writing to the roster or integrating with the scheduler.** The scheduler stays the system of record and ShiftSwap
   never writes to it (`operations-manager-brief.md:32-33`; `AGENTS.md`, Gotchas). No scheduler integration is promised
   (none is known to exist).
6. **One-way shift handovers.** Handing a shift over without taking one in return is not a swap
   (`fatigue-management-policy.md:57-58`).
7. **Exceptions to § 3.** These go through VE-HSSE-PRC-021, separate from the swap process
   (`fatigue-management-policy.md:73-76`). The pilot offers no override.
8. **Counting unrostered training time toward hours.** For the pilot, hours and off-duty periods are calculated from rostered shifts
   only, including training rostered as a shift (DECISION, kickoff § 2.1). Whether other training time *should* count is a question for revision 4 of
   VE-HSSE-STD-014 and is outside the pilot (Q1, closed for the pilot only).
9. **Changing the fatigue standard** (`operations-manager-brief.md:38`), **new vendor licences or modules**
   (`operations-manager-brief.md:35`), **usage/adoption KPIs**, and **any claim about ANSI/API RP 755** — the policy
   states it does not reproduce that practice (`fatigue-management-policy.md:84-88`), and that research is not
   part of this PRD.
10. **Revising the standing NFR register** (owner: Marcus Ellery; only he changes it —
    `docs/design/quality/nfr-register.md:7-9`).

---

## Target Users

**Primary persona — Operator (CDU or HCU).** Arranges swaps with a colleague, potentially across units; wants a fast,
reasoned answer before leaving shift. Interviewed: two console operators, together, names withheld
(`supervisor-interviews.md:59-63`). Gateway role value: `operator` (`engineering-standard.md:76-78`).

**Primary persona — Shift supervisor, CDU (Renee Landry) / HCU (Carl Nguyen).** Currently approves by memory or by roster
printout, cannot see the other unit's roster, and emails the scheduler afterwards
(`supervisor-interviews.md:37-57`). Gateway role value: `shift-supervisor` (`engineering-standard.md:76-78`).

**Stakeholder map (from sources and kickoff; proposals marked):**

| Stakeholder | Benefits | Bears cost / risk | Can block |
| --- | --- | --- | --- |
| Operators | Timely reasoned answer | Must consent in-tool; sees refusals | — |
| Supervisors | Less calculating; cross-unit visibility | Review items when triggered; follow-up on scheduler entry | — |
| HSSE Manager (Simone Arceneaux) — owns the standard and NFR-COMP-001 | Decision records | Decided training days (kickoff § 2.1) and the § 4.5 "who decided" wording (kickoff § 2.2); decided that only what the export covers need be checked (§ 2.6) and agreed the 26-hour limit (§ 2.7); owns the separate holdover review (kickoff § 2.4) | Yes: owns the standard (`fatigue-management-policy.md:11`) |
| IT Applications Lead (Marcus Ellery) — owns IT standard and register | — | Hosting (provisions the Tier 3 platform, kickoff § 5.2), auditor extracts (§ 5.5), register revision (§ 5.6), evidence for NFRs | Yes: standard owner (`engineering-standard.md:10`) |
| Operations Manager (Dana Whitlock) — sponsor | Outcome evidence | Approved the pilot and targets (kickoff §§ 1.1, 1.4); reviews results herself at the end (§ 1.2) | Has delegated PRD acceptance, feature sign-off and task-set approval to the Business Engineer (kickoff § 1.2) |
| Business Engineer (assigned by IT Applications; **identity not named in any source**) | — | Accepts this PRD, signs off features, approves task sets (kickoff § 1.2); co-signs the tablet waiver, if one is made (kickoff § 5.4) | Yes, by delegation |
| Payroll — Gloria Menard, Payroll Supervisor | Fewer corrections (`operations-manager-brief.md:20-21`) | Runs the independent review that judges whether swaps reached the scheduler in time (kickoff § 4.3); participates in the post-worked review (`supervisor-interviews.md:14-15`) | — |
| Site Scheduler — Hannah Beaulieu | Confirmed entries | Enters every approved swap by hand; no integration for the pilot (kickoff § 4.1); is given the `shift-supervisor` gateway role to see the list (kickoff § 5.7); is the person who corrects the scheduling system when an export disagrees with an approved swap (kickoff § 4.4) | — |
| Training function (qualification records) | — | Its training records system feeds the export immediately before it runs (kickoff § 3.3); the function itself is **not named in any source** | **Missing from conversation** |
| Auditors | Records | Receive extracts from IT on request; the gateway has no auditor role (kickoff § 5.5) | — |

---

## User Stories & Use Cases

### Core Use Cases

**Use Case 1: Compliant swap needing no review**

- Actor: Operator A (requester), Operator B (counterparty)
- Trigger: A wants to exchange one scheduled shift with one of B's.
- Flow: A selects both shifts and submits; B agrees; ShiftSwap evaluates both employees' resulting schedules;
  result is compliant and neither employee triggers § 4.2.
- Outcome: Swap is approved at the moment B agrees (DECISION, kickoff § 1.6) with the rules that determined it; both
  operators are told in the application (the only channel in the pilot); the record names the decider as the system
  acting under VE-HSSE-STD-014 § 4.3 at the stated revision, with the time both employees agreed (kickoff § 2.2); the
  swap is listed as "awaiting scheduler entry" until a later export shows it (Group E).

**Use Case 2: Compliant swap needing review (§ 4.2)**

- Actor: Operators; supervisor of each affected unit
- Trigger: Either employee's resulting schedule has an off-duty period under 12 hours or over 60 scheduled hours in any
  seven consecutive calendar days.
- Flow: ShiftSwap shows each supervisor both employees' figures; each affected unit's supervisor approves or declines.
- Outcome: Approved only when every required supervisor approves; the decision record names each decider. No time
  target applies to reviewed swaps; request, agreement and decision times are recorded (kickoff § 1.6).

**Use Case 3: Swap that fails § 3**

- Actor: Operators
- Trigger: Either employee's resulting schedule breaks § 3.1, § 3.2 or § 3.3.
- Flow: ShiftSwap reports each failed limit and whose schedule failed.
- Outcome: The swap cannot be approved via ShiftSwap; the operators are pointed to the separate exception procedure.

**Use Case 4: Cannot determine**

- Actor: Operators, supervisors
- Trigger: Data needed is missing; a shift falls outside the determinable horizon (kickoff § 3.6: a shift starting from
  the export's site-local date through 15 days after it, whatever the weekday); the export is more
  than 26 hours old when the check is made (kickoff § 3.5); the request involves an employee or shift in another
  request that is still undecided (kickoff § 3.7); the request involves either employee or either shift of an approved
  swap that a later export contradicts (kickoff § 4.4); or currency otherwise cannot be established.
- Flow: ShiftSwap reports "cannot determine" and what is missing.
- Outcome: Not approved by the tool; never shown as safe.

### User Stories (prioritized)

Acceptance criteria use Given/When/Then and are the basis for the Functional Requirements below.

| # | Priority | Story | Acceptance criteria |
| --- | --- | --- | --- |
| US1 | P0 | As an operator, I want my swap checked against **both** employees' resulting schedules when I submit it so that I learn at once whether it can be approved. | Given a request whose shifts are determinable (kickoff § 3.6), when submitted, then the result lists, per employee, the off-duty periods next to each swapped shift, maximum scheduled hours over the seven-calendar-day windows that contain a swapped shift (kickoff § 2.6; B1 for what else is checked) and unit/role qualification outcomes, and the rule that determined any failure. Given a request that is not determinable, the result says "cannot determine" and why (B3). |
| US2 | P0 | As an operator, I want to see the specific rule that stops my swap so that "no" is not all I get. | Given a failed or indeterminate result, then the message names each rule (§ reference), the employee it applies to, and what is missing for "cannot determine". |
| US3 | P0 | As an operator, I want the other employee's agreement captured before approval so that nobody is swapped without consent. | Given a request, then no approval is made until both employees have agreed in the tool; either may withdraw before approval. |
| US4 | P0 | As a supervisor, I want to be asked to review only the swaps the standard says need review, with the figures shown, so that I neither calculate rest nor touch swaps that need none. | Given a compliant swap with no § 4.2 trigger, then no supervisor action is requested; given a § 4.2 trigger, then each affected unit's supervisor sees both employees' figures. |
| US5 | P0 | As a supervisor, I want a swap not to be treated as approved until every required supervisor has approved so that cross-unit approvals are not half-done. | Given two required supervisors where one has approved, then the status is pending, the operators see "awaiting second approval", and nothing is handed off. |
| US6 | P0 | As an HSSE Manager, I want every swap decision recorded with the content § 4.5 requires so that the decision can be audited for three years. | Given any decision, then a record exists with the fields listed in D1; it cannot be updated or deleted by application code, and no purge exists (kickoff § 5.6). Records are visible to the `shift-supervisor` role only; auditors receive extracts from IT on request (kickoff § 5.5). That rule is unchanged by the scheduler's role (kickoff § 5.7); see D2 and Q26. |
| US7 | P0 | As a supervisor (and the site scheduler), I want to see which approved swaps are not yet confirmed in the scheduler so that the swap is entered and chased before the shift. | Given an approved swap not yet shown in the latest roster export, then it appears as "awaiting scheduler entry" and not as complete. The site scheduler sees this list under the `shift-supervisor` gateway role she is given for the pilot (kickoff § 5.7). Given a later export that contradicts an approved swap (kickoff § 4.4), the item is marked as needing the scheduler's attention (B6). |
| US8 | P0 | As a supervisor, I want the check re-run at decision time so that I never approve on data that has since changed. | Given a roster export or relevant swap change between request and final decision, then the check uses current reconciled data and the export's age is re-tested against 26 hours (kickoff § 3.5); changed results require renewed review, any earlier approval that no longer holds is not reused, and the record states the data used. |
| US9 | P0 | As an operator, I want to see the status of my swap at any time so that we do not both turn up, or neither (`supervisor-interviews.md:62`). | Given a request in any state, then both employees can see its state and, when terminal, the reason. |
| US10 | P0 | As a pilot evaluator, I want request, agreement and decision timestamps recorded and exportable so that pilot timing can be examined and a time target set later (kickoff § 1.6; near-shift-change timing, `supervisor-interviews.md:70-71`). | Each request has a request time and, if agreement or decision occurs, the corresponding time; absent events are identified as not yet occurring or not applicable. An export lists these times without employee names in logs. Required for the pilot, not optional. |

---

## Solution Overview

**What (PROPOSAL).** A browser application for control-room desktops, used for CDU/HCU operator swaps. It reads the
nightly published roster (JSON; read-only input; `operations-manager-brief.md:32-34`, `AGENTS.md` Layout) and the
qualification records carried with it, evaluates the standard's limits for both employees' resulting schedules within
the export's coverage, routes by the standard's § 4.2/4.3 rules, records every decision, and tracks each approved swap
until a later export shows it entered. Identity comes from the site gateway headers; there is no login
(`engineering-standard.md:76-80`).

**The roster export (DECISION, kickoff § 3; sample `data/roster.sample.json`, fictional).**

| Item | Decision | Source |
| --- | --- | --- |
| Schedule | Nightly at 02:00 site time (America/Chicago); the file carries `exportedAt`, a UTC instant | kickoff § 3.1 |
| Coverage | 28 site-time dates: from six days before the export date through 21 days after it (**corrected in kickoff revision 2**; not Monday-based — revision 1's Monday-start wording described the sample, whose export date is a Sunday, not the rule); the file carries `coverage` (`from`/`to`, site-time dates). Complete for that range: an operator with no shift starting on a covered date is off duty that day | kickoff § 3.2 |
| Qualifications | Every operator's qualifications with valid-through dates, from the training records system immediately before the export runs | kickoff § 3.3 |
| Sample | Same structure as the production export; Hannah Beaulieu compared its fields with a production file (a field comparison, not a statement that every production export is complete) | kickoff § 3.4 |
| Currency | A check is definitive only if the export is no more than **26 hours** old when the check is made (measured from `exportedAt`); older means "cannot determine". HSSE agrees the limit | kickoff §§ 3.5, 2.7 |
| Horizon | A swap is determinable only if every seven-day window containing either swapped shift lies inside coverage, i.e. each swapped shift starts at least six days after `coverage.from` and at least six days before `coverage.to`. With § 3.2's coverage that is every shift starting from the export's site-local date through 15 days after it, inclusive, **whatever day of the week the export runs**; both swapped shifts must qualify, and every other safeguard still applies | kickoff § 3.6 |
| Swaps not yet exported | ShiftSwap applies its own approved swaps on top of the export when checking a later request; a request involving an employee or shift in another request that is still undecided is "cannot determine" until that request is decided | kickoff § 3.7 |
| Export disagrees with an approved swap | If a later export shows only one of the two shifts changed, or a different change, ShiftSwap stops applying that swap and marks it as needing the scheduler's attention; see the overlay paragraph below | kickoff § 4.4 |
| Local testing | The local environment sets the application clock to `2027-03-07T14:00:00Z` (08:00 site time on the morning of the sample's export) | kickoff § 3.8 |

*Worked check against the sample (arithmetic on the file, not a new fact):* `exportedAt` is `2027-03-07T08:00:00Z`, which
is 02:00 on 7 March 2027 in America/Chicago, so the export's site-local date is 7 March (`data/roster.sample.json:7`).
`coverage` is `2027-03-01` to `2027-03-28` (`:8-11`): six days before 7 March is 1 March and 21 days after it is
28 March, 28 dates in all, matching kickoff § 3.2. Six days after the first date is 7 March and six days before the last
is 22 March, so determinable swapped shifts start from 7 to 22 March 2027, matching kickoff § 3.6 (the export date
through 15 days after it). 7 March 2027 is a Sunday; that is why revision 1 of the kickoff, which said coverage starts on
the Monday of the export week, fitted the sample, and the sample remains a valid fixture under the corrected rule. At
the local test clock the export is 6 hours old (`2027-03-07T14:00:00Z` minus `2027-03-07T08:00:00Z`), inside the
26-hour limit; it becomes older than 26 hours at `2027-03-08T10:00:00Z`.

*Weekday-independent examples (illustrative arithmetic from kickoff §§ 3.2 and 3.6, not roster data; the dates are
invented fixtures):* let D be the export's site-local date, the date of `exportedAt` in America/Chicago, not its UTC
date. Then coverage is D − 6 through D + 21 and determinable shifts start D through D + 15, inclusive, on any weekday.
For a **Monday** export on 8 March 2027: coverage 2 March to 29 March; shifts starting 8 March to 23 March are
determinable (the export day itself, not six days ahead). For a **Wednesday** export on 3 March 2027: coverage
25 February to 24 March; shifts starting 3 March to 18 March are determinable. The offsets are the same in every case;
only the calendar dates move.

**Consequences and limits (kickoff §§ 3.2, 3.6; Q21 closed at v0.3).**
Under the corrected coverage the earliest determinable shift starts on the export's site-local date and the latest
15 days after it, whatever the weekday. The earlier "Monday export → six days ahead" effect came from revision 1's
wrong coverage wording and no longer applies. Requests involving a shift outside that horizon receive "cannot
determine". The proportion of requests affected is unknown; the pilot's recorded outcomes are the only source for it.

**What the check does not guarantee.** The standard requires the resulting schedule to meet § 3
(`fatigue-management-policy.md:53-55`), but a bounded 28-date export cannot show every resulting schedule across all
time. HSSE's decision (kickoff § 2.6): VE-HSSE-STD-014 § 4.1 judges the resulting schedule in the published roster; for
the swap process the published roster is the export; a swap can change only the off-duty periods next to a swapped shift
and the seven-day windows that contain one; § 3.6 keeps all of those inside coverage; and HSSE does not require anything
outside the coverage to be checked. This PRD records that as HSSE's statement of what the swap process must check. It
does **not** establish, and this PRD does not claim, that anything beyond the declared coverage is safe, nor that
holdovers or other changes outside the swap are covered. The checks that remain required are listed in B1 (both
employees; the 11-hour off-duty minimum; the 72-hour limit; the 12-hour and 60-hour review triggers). One
interpretation is **not** settled by the kickoff and is raised as Q25: whether an existing breach in a window the swap
does not touch should also stop the swap.

**Overlay of approved-but-not-exported swaps.** An approved swap is applied on top of the export until a later export
**shows both swapped shifts against the swapped operators** (kickoff § 4.2); from then on ShiftSwap must not apply it
again, so a swap reflected in an export is never double-applied. An unchanged export — one that still shows both shifts as
they were before the swap — is **not** a disagreement: the swap simply has not been entered yet, stays applied on top of
the export, and stays "awaiting scheduler entry".

*Contradictory export (kickoff § 4.4).* If a later export shows only one of the two shifts changed, or a different
change, ShiftSwap **stops applying that approved swap** and **marks it as needing the scheduler's attention**. Every
request involving **either employee or either shift** of that swap is then "cannot determine" until **Hannah corrects
the scheduling system and a later export agrees** — that is, shows both shifts against the swapped operators (§ 4.2). The
cases are distinguished as follows: (a) both shifts unchanged → awaiting entry, not contradictory; (b) both shifts
changed as approved → confirmed, no longer overlaid; (c) exactly one of the two shifts changed → contradictory; (d)
either shift changed otherwise than as approved (for example to a different employee) → contradictory. The kickoff does
not say the approval is withdrawn, and this PRD does not add that; the decision record stays as written (append-only).
The kickoff does not name where the mark appears; the list the scheduler works from is the proposed place (PROPOSAL,
B6). Edge cases the kickoff leaves unstated are listed in the change log (Contradictions, items 9–10).

*Tie on shift start (kickoff § 4.5).* When the two swapped shifts start at the same time, the supervisor responsible under
§ 4.1 is the supervisor of the unit of the shift the requester gave up.

A request that involves an employee or shift in an undecided request is "cannot
determine", never approved on an assumed order (kickoff § 3.7).

**Qualification timing (DECISION, kickoff § 2.5).** A qualification that lapses or is renewed during the day is not
visible until the next export. HSSE accepted this for the pilot. It means a definitive result can rest on a
qualification state that has since changed; the result and decision record carry the export time so this is visible.
Whether such a breach is excluded from M-2 is not stated; no exclusion is assumed.

**Policy rules the check must apply (FACT: `fatigue-management-policy.md:21-47`):** site time is America/Chicago and
dates are site-local; durations are actual elapsed time, including on the two clock-change nights; off-duty period of at
least 11 hours between consecutive shifts; at most 72 scheduled hours counted over shifts that *start* in any 7
consecutive site-time calendar dates; qualification for the shift's unit and role valid on the shift's start date
(expires the following day). Review thresholds: under 12 hours' off-duty or over 60 hours in seven days for either
employee → supervisor of each affected unit (`:60-66`); neither trigger → no review required (`:68-71`); failed § 3 →
cannot be approved by swap (`:73-76`).

**Training days (DECISION, kickoff § 2.1).** Under revision 3 of VE-HSSE-STD-014, scheduled hours and off-duty periods
are calculated from shifts on the published roster only; training counts only where it is rostered as a shift. Both
supervisors have been told to apply this reading. Whether training time should count is a question for revision 4 and
is not part of the pilot. The tool still displays that only rostered shifts are included (F1) and the decision record
carries the policy revision applied. This reading is HSSE's statement; the policy text read for this PRD was not
checked for a clause saying so.

**Alternatives considered.**

| Alternative | Description | Why not chosen for the pilot |
| --- | --- | --- |
| **Process-only** | A structured request form or checklist, a shared cross-unit roster view, and a required scheduler-confirmation step, with no new software. | **Not chosen because the requester decided on a pilot** as the validation vehicle. The reasoning given: the standard requires checking *both* employees' full resulting schedules (`fatigue-management-policy.md:53-55`), and the supervisors say they do not calculate rest hours and cannot see the other unit's roster (`supervisor-interviews.md:41-44`). This PRD does **not** assert that a process-only approach cannot work, and **no measured comparison of the two exists**. The pilot validates the software option; it does not prove it superior. |
| Do nothing / defer | Wait for more data. | A recommendation to defer was made; the requester rejected it. Recorded for traceability, not re-litigated here. |
| Buy a vendor module | — | No budget this fiscal year for new vendor licences or modules (`operations-manager-brief.md:35`). |

**Functional groupings (segmentable).** Each group is independently describable and carries its own business
justification, so the Specification loop can segment on them:

| Group | Name | Business justification |
| --- | --- | --- |
| A | Request and consent | Swaps today start as texts with no shared record; consent is required by the standard (`fatigue-management-policy.md:53-54`). |
| B | Rules check of both employees | The standard requires both resulting schedules to meet § 3; supervisors do not calculate this today (`supervisor-interviews.md:41-44`). Targets M-1, M-2. |
| C | Routing, review and decisions | Cuts supervisor effort on swaps needing no review and gives supervisors the figures when review is required. Targets M-3. |
| D | Decision records and audit | § 4.5 records; the near-miss record omitted who approved and what was checked (`docs/discovery/near-miss-PA-NM-2026-0193.md:31-32`). Supports NFR-COMP-001. |
| E | Scheduler handoff and entry confirmation | 7 of 41 approved swaps were not entered before the shift (`supervisor-interviews.md:24`). Targets M-4. |
| F | Transparency and pilot guardrails | Prevents false assurance; keeps the pilot's limits visible to users. |

---

## Functional Requirements

### P0 — Must Have (Launch Blockers)

| # | Requirement | Acceptance Criteria |
| --- | --- | --- |
| A1 | An operator can request a swap of one of their scheduled shifts for one scheduled shift of another employee, where both shifts are CDU or HCU shifts (same-unit and cross-unit). | Given a request for one-for-one shifts, then it is accepted for evaluation. Given a request involving a shift outside CDU/HCU, then it is refused as out of pilot scope with that reason shown. |
| A2 | A request that hands a shift over without a return shift is not processed as a swap. | Given a one-way handover, then the tool declines it as "not a swap" and says the scheduler handles it (`fatigue-management-policy.md:57-58`); no swap decision record is created. |
| A3 | The counterparty must explicitly agree before a swap approval; either employee can withdraw before approval. | No approval state is reachable without two recorded agreements; withdrawal sets a terminal "withdrawn" state with a record. |
| B1 | Evaluate § 3.1, § 3.2 and § 3.3 for **each** of the two employees on that employee's resulting schedule (every roster shift, any unit), with the swap applied, for swaps determinable under B3. **Required minimum (HSSE, kickoff § 2.6):** for both employees, the off-duty periods next to each swapped shift, every seven-consecutive-site-date window that contains either swapped shift, and qualification; nothing outside the export's coverage is required. | Fixture tests per limit: off-duty exactly 11 h passes, under 11 h fails, evaluated against consecutive shifts, including the periods immediately before and after each swapped shift; 72 h in a window passes, over 72 h fails, with every seven-consecutive-site-date window containing a swapped shift checked, and only shifts that *start* in the window counted; the 12 h / 60 h review triggers (C1) are evaluated on the same periods and windows for both employees; qualification valid on the shift's start date passes, expired the day before fails; each result is per employee and per rule. **Retained from v0.2 (not dropped):** every other seven-consecutive-site-date window within coverage, including windows containing no swapped shift, is still checked, and each result states whether the window or rest period is one the swap changes. Rostered shifts only are counted, training included only if rostered (kickoff § 2.1). Missing required coverage remains indeterminate under B3. A result that is compliant is not stated to cover anything outside coverage. *Whether an existing breach in a window the swap does not touch should stop the swap is not decided (Q25); until it is, the v0.2 behaviour is kept.* |
| B2 | Compute durations as actual elapsed time in America/Chicago, including the two clock-change nights. | Fixtures spanning the spring and fall clock changes yield elapsed hours differing by one from the wall-clock difference, matching `fatigue-management-policy.md:25-26`. |
| B3 | **No false safe.** The tool states "cannot determine" — never compliant, never auto-approved — when any needed input is unavailable or unresolved: a roster shift or qualification record missing for either employee; missing or inconsistent `exportedAt` or `coverage` data; a swapped shift that does not start from the export's site-local date through 15 days after it, inclusive — equivalently, at least six days after `coverage.from` and at least six days before `coverage.to`, whatever the weekday (kickoff §§ 3.2, 3.6), where **both** swapped shifts must qualify; an export more than 26 hours old when the check is made, measured from `exportedAt` (kickoff § 3.5); a request involving an employee or shift in another request that is still undecided (kickoff § 3.7); a request involving either employee or either shift of an approved swap that a later export contradicts (kickoff § 4.4; B6). Approved-but-not-yet-exported swaps are applied on top of the export (kickoff § 3.7) and are not applied again once an export shows both swapped shifts against the swapped operators (kickoff § 4.2). | One fixture per condition yields "cannot determine" naming the missing or inconsistent input and no approvable state, including coverage dates inconsistent with § 3.2. Boundary fixtures against the sample (kickoff §§ 3.2, 3.6, 3.8; export Sunday 7 March 2027, site-local): shifts starting 7 and 22 March 2027 are determinable and 6 and 23 March are not; a request is not determinable if either of its two shifts is outside that range even when the other is inside. **Weekday-independent fixtures** (Solution Overview, illustrative dates): for a Monday export on 8 March 2027 determinable starts are 8–23 March (6 March and 7 March, and 24 March, are not); for a Wednesday export on 3 March 2027 they are 3–18 March; the horizon is computed from the site-local (America/Chicago) date of `exportedAt`, so an `exportedAt` instant whose UTC date differs from its site-local date uses the site-local date. No fixture may assume the export runs on a Monday or that coverage starts on a Monday. At the local clock `2027-03-07T14:00:00Z` the export is 6 h old (definitive), at `2027-03-08T10:00:00Z` it is exactly 26 h old (definitive) and one instant later it is older ("cannot determine"). An overlay fixture proves a swap is applied once before the export shows it and not applied again after. *HSSE agrees the 26-hour limit (kickoff § 2.7); that is a decision, not a measurement of how stale a roster may safely be.* |
| B4 | Failed § 3 swaps cannot be approved through ShiftSwap. | No API or UI path moves a request with a failed § 3 result to approved, including by a supervisor; the message points to the separate exception procedure VE-HSSE-PRC-021 (`fatigue-management-policy.md:73-76`). |
| C1 | Classify each compliant swap: review required if for either employee off-duty < 12 h or > 60 scheduled hours in any 7 consecutive calendar days; otherwise review not required. | Boundary fixtures: exactly 12 h and exactly 60 h do not trigger; 11 h 59 m and 60 h 1 m do (`fatigue-management-policy.md:62-66`). |
| C2 | Swaps requiring no review are approved without supervisor action, and the decision is recorded as such. | Given a compliant, no-trigger swap with complete consents, then status becomes approved when the second operator agrees (kickoff § 1.6) with no supervisor task created, after the B5 re-check. The record's "who decided" names the system acting under VE-HSSE-STD-014 § 4.3 at the stated revision, with the time both employees agreed (kickoff § 2.2, which HSSE states satisfies § 4.5). |
| C3 | Swaps requiring review go to the supervisor of **each** unit affected (one supervisor when both shifts are in one unit), each shown both employees' figures and the triggering rule. | Cross-unit fixture creates two review tasks; same-unit creates one; each shows both employees' off-duty periods and seven-day hours. |
| C4 | **No partial approval.** Approval requires every required supervisor's approval; any decline declines the swap. | Given one of two approvals, status is "awaiting second approval", no handoff item exists, and the operators see that status. A decline by either ends the request with the supervisor's reason shown. |
| C5 | Both operators are told the outcome and the determining rule(s) or reason **in the application only** (kickoff § 1.6). | For every terminal state, both employees see the state and each determining rule (§ reference) or supervisor reason. A swap needing no review is answered when the second operator agrees. No time target is set for reviewed swaps. No text, email or other channel is provided. |
| D1 | Write one append-only decision record per decision with: the two employees and two shifts; outcome; each limit in §§ 3–4 that determined the outcome; who decided and when (UTC); policy revision applied; and the roster data as-of time used (`exportedAt`). For a swap approved without review, "who decided" is the system acting under VE-HSSE-STD-014 § 4.3 at the stated revision, and "when" is the time both employees had agreed (kickoff § 2.2). | Integration test: every decision outcome (approved, declined, withdrawn) produces one record containing every field; no update, delete or purge code path exists (also NFR-COMP-001; kickoff § 5.6). |
| D2 | Access to decision records is limited to the `shift-supervisor` role; the gateway has no auditor role, so auditors receive extracts from IT on request (kickoff § 5.5). Identity is taken only from `X-Employee-Number` and `X-Roles`. The site scheduler, Hannah Beaulieu, is given the `shift-supervisor` role at the gateway for the pilot so that she can see the approved-swaps list (kickoff § 5.7); no other role is created or widened. | A request carrying only the `operator` role is refused on the record-access endpoint; the app handles no credentials (`engineering-standard.md:37-38`, `:76-80`). No auditor role value is created, and no extra role value is created for the scheduler. The supervisor-only rule for decision records and the IT-extract route for auditors are unchanged. *How IT produces extracts (format, turnaround) is not specified. Holding the role also gives the scheduler access to decision records and the supervisor views; whether that is intended, and whether supervisor review actions are tied to a unit, is not stated (Q26).* |
| D3 | Logs, traces and metrics hold no employee name, number or contact detail; log references use an opaque identifier. | Meets NFR-PRIV-001's observable-violation test. |
| E1 | ShiftSwap never writes to the roster. After final approval, the swap is listed as **"Approved — awaiting scheduler entry"**. The list is what the site scheduler (Hannah Beaulieu) and the supervisor responsible under kickoff § 4.1 both work from. That supervisor is the supervisor of the unit whose swapped shift starts first; where the two swapped shifts start at the same time, it is the supervisor of the unit of the shift the requester gave up (kickoff § 4.5). The scheduler sees the list under the `shift-supervisor` gateway role she is given for the pilot (kickoff § 5.7). | Roster file is opened read-only in tests; approved swaps appear in the list with the two shifts and the earlier shift start. Tie fixture: two shifts starting at the same instant, one CDU and one HCU; the responsible supervisor shown is that of the unit of the shift the requester gave up, and swapping which operator is the requester changes the result accordingly. A request carrying the `shift-supervisor` role can view the list; a request carrying only `operator` cannot (D2). |
| E2 | Scheduler entry is confirmed only when a later roster export shows both swapped shifts against the swapped operators (kickoff § 4.2) — the next day at the earliest. Until then the swap is not "complete". | Given an export showing both changed shifts entered, the item becomes "Confirmed in scheduler"; given a shift start before confirmation, the item is flagged "Shift reached — entry not yet confirmed by an export". That flag is an observation about the export, **not** a finding that entry was late: the next nightly export may follow the shift, so absent confirmation at shift time does not establish late entry. Whether swaps reached the scheduler in time is judged by payroll's review (kickoff § 4.3). |
| E3 | Approved swaps are handed to the scheduler **by list**: the scheduler enters them by hand, with no integration (kickoff § 4.1), and the supervisor responsible under § 4.1 (earliest-starting shift's unit; on a tie, the unit of the shift the requester gave up, § 4.5) ensures the scheduler has the swap. | Given an approved swap, the list item identifies both shifts and employees and stays visible until an export confirms it (E2). No scheduler integration is assumed. *No delivery or acknowledgement mechanism beyond the list is decided; none is invented.* |
| B5 | Re-run the check against current reconciled data immediately before final approval, including the 26-hour age test against `exportedAt`; changes that alter the result require renewed applicable review. | If a roster update or another swap introduces a breach or indeterminate result between request and approval, approval is blocked. If the result or review basis changes, prior approvals are not reused without renewed review, and changed approvals are shown to the operators and supervisors affected. A check that was definitive at request time but is "cannot determine" at decision time (for example the export is now older than 26 hours) is not approved. |
| B6 | **Contradictory export.** When a later export shows only one of an approved swap's two shifts changed, or a different change, stop applying that swap and mark it as needing the scheduler's attention (kickoff § 4.4). Every request involving either employee or either shift of that swap is "cannot determine" until Hannah corrects the scheduling system and a later export agrees. An unchanged export is not a contradiction. | Fixtures on one approved swap (shifts S1, S2; employees E1, E2): (1) export shows S1 and S2 both unchanged → swap stays applied, stays "awaiting scheduler entry", **no** attention mark, requests are checked normally; (2) export shows both changed as approved → "Confirmed in scheduler", no longer applied on top (E2); (3) export shows only S1 changed → swap no longer applied, attention mark set; (4) export shows only S2 changed → same; (5) export shows S1 and S2 changed otherwise than as approved → same; (6) in cases 3–5 a new request involving E1 but neither shift, one involving E2 but neither shift, one involving S1 only, and one involving S2 only are each "cannot determine" naming the swap; a request involving none of E1, E2, S1, S2 is unaffected; (7) the block lifts only after a later export agrees (both shifts against the swapped operators), and not merely because time passes or a newer export is again unchanged; (8) the stopped swap's decision record is unchanged. *The attention mark's placement is a proposal (the approved-swaps list). Not stated: what "different change" means for changes to other shifts of the same employees, and whether a scheduler who reverts rather than completes the entry clears the block (Contradictions, items 9–10).* |
| F1 | The check result shows the roster export's `exportedAt` time and states that computed hours include rostered shifts only. | Both appear on each result view and in the decision record; a rostered training shift, if present, is counted (kickoff § 2.1). |
| H1 | Record request, agreement and decision timestamps when those events occur, and export them for evaluation (US10). Moved from P2 in v0.2: the pilot needs these times (kickoff § 1.6). | Each request has a request time; agreement and decision times are recorded when those events occur, with absent events identified as not yet occurring or not applicable. The export lists them; no employee names in logs. |

### P1 — Should Have

| # | Requirement | Acceptance Criteria |
| --- | --- | --- |
| C6 | Supervisor queue lists open review items and unconfirmed approved swaps ordered by shift start. | Ordering test on shift start; no review item is hidden by a default filter. |
| E4 | Show each approved-not-confirmed swap's shift start prominently to supervisors. | Item shows the shift start and which role must act; no numeric alert threshold is invented. |
| F2 | The pilot's scope (CDU/HCU only; holdovers not assessed) is stated on the request and result views. | A holdover-scope notice is present on result views. |

### P2 — Nice to Have

| # | Requirement | Acceptance Criteria |
| --- | --- | --- |
| H2 | Display each employee's full resulting schedule as a timeline. | Timeline for both employees renders and passes the automated accessibility checks. *Shows only what the export covers.* |

---

## User Experience

*PROPOSAL — opinionated flow; no design exists yet. Desktop Edge only (current and previous major release —
`engineering-standard.md:67`).*

1. **Open.** The employee opens ShiftSwap; the gateway supplies identity. No login screen.
2. **Request.** The operator chooses *their* shift and *the other employee's* shift. Shifts outside CDU/HCU are not
   offered; the tool says why. Handover-only requests are turned away with an explanation.
3. **Consent.** The counterparty sees a request addressed to them with the two shifts and agrees or declines on their
   own screen. Until they agree, the swap cannot be approved.
4. **Immediate check.** On submission the operator sees a two-column result — *each* employee — with off-duty period,
   worst seven-day total, qualification outcome, and the rule that failed, if any. The export's `exportedAt` time and the
   limitation that only rostered shifts are counted are always visible. Refusal reasons are in plain words with the §
   reference, naming the employee and the rule. A swap outside the determinable horizon, or checked on an export older
   than 26 hours, says "cannot determine" and why.
5. **Route.** The system decides one of: *approved without review* (answered when the second operator agrees) ·
   *awaiting supervisor review* (naming unit(s)) · *cannot be approved* · *cannot determine*.
6. **Review (if required).** Each affected supervisor sees both employees' figures and the trigger; approve/decline with
   a reason on decline. The operators see "awaiting second approval" when only one has approved.
7. **Status and reason.** Both operators always see the current status in the application; terminal states show the rule
   or reason.
8. **Scheduler wait.** The approved swap shows "Approved — awaiting scheduler entry" on the list the scheduler and the
   supervisor responsible under § 4.1 work from (the supervisor of the earliest-starting swapped shift; on a tie, of the
   unit of the shift the requester gave up — kickoff § 4.5), until a later export shows both shifts; if a shift starts first,
   it reads "Shift reached — entry not yet confirmed by an export" (not a finding of late entry). If a later export
   contradicts the swap (kickoff § 4.4), the item shows it needs the scheduler's attention and requests involving either
   employee or either shift show "cannot determine".
9. **Record.** Every decision leaves a record visible only to the `shift-supervisor` role; auditors get extracts from IT.
   The site scheduler holds that role for the pilot (kickoff § 5.7).

No notifications outside the application are provided (kickoff § 1.6).

---

## Technical Considerations

- **Architecture (FACT from repo):** `apps/web` → `apps/api` → `packages/rules`; rules are pure TypeScript with no I/O
  or clock; time arithmetic lives only in `packages/rules` (`AGENTS.md`, Layout and Style). Identity via gateway
  headers (`engineering-standard.md:76-83`). No feature is built yet (`AGENTS.md`, status).
- **Integrations:** read-only nightly JSON roster export (sample: `data/roster.sample.json`, fictional), with the
  schedule, coverage, currency, horizon and overlay rules in Solution Overview (kickoff § 3). The scheduler has no swap
  workflow and no integration for the pilot (`operations-manager-brief.md:32-33`; kickoff § 4.1). Production export
  structure is stated by the client to match the sample (kickoff § 3.4); this PRD has not seen a production file.
  Because the export is nightly, a swap approved today cannot appear in it until a later export, so ShiftSwap's own
  approved-but-unexported swaps are applied on top of the export (B3), and not again once an export shows them.
- **Data:** requests, consents, decisions and audit records are held by ShiftSwap; the roster stays external. Audit
  records may identify people and are not logs (`engineering-standard.md:35-38`). Retention is three years
  (`fatigue-management-policy.md:82`); for the pilot it is met by never deleting a decision record, and no purge is to be
  built (kickoff § 5.6). *Not provided:* when the register's retention record will be added ("at the register's next
  revision").
- **Environments:** ShiftSwap is a Tier 3 application (kickoff § 5.1). The pilot is to run on the Tier 3 production
  platform behind the site access gateway; IT provisions it and that is not part of the build (kickoff § 5.2). **It is
  planned but not yet provisioned**, and there is still no staging environment (kickoff § 5.2; `AGENTS.md`,
  Environments; `engineering-standard.md:85-91`). Until the platform is provisioned, verification is in the local
  environment only, which is non-production. The local application clock is set to `2027-03-07T14:00:00Z` for
  roster-sample testing (kickoff § 3.8). No provisioning date is given.

Performance, security, compliance and every other non-functional requirement are in the next section as records, not
here as prose.

---

## Non-Functional Requirements

Format, admission rule and tiers: `neo-nfr-authoring`. Elicitation: `neo-product-requirements`
`references/quality-attributes.md`.

Standing NFRs: `docs/design/quality/nfr-register.md` — owner **Marcus Ellery, IT Applications Lead**
(`nfr-register.md:5`). All seven records apply. The register's `Status` key is optional and absent on every record, so
each is `active` by default. No signed waiver exists in the register or here, and **this PRD waives nothing** — a
waiver needs every field and the signatures in `neo-nfr-authoring` § 6, and no agent signs one.

Standing only

No PRD-tier NFR is admitted. Candidates that fail admission — missing measure, source, layer/stage or owner — are in
Open Questions (Q14), not recorded here. The three-year retention is stated in
`fatigue-management-policy.md:82` but is **not** in any standing record's Statement. Marcus Ellery will add a standing
record at the register's next revision; until then the requirement is met by never deleting a decision record, and no
purge is built (kickoff § 5.6). The timing of that revision is not stated (Q14). This PRD does not edit the register.

**Peak request rate (DECISION, kickoff § 5.3).** For the performance requirement in VE-IT-STD-007 § 5, the peak request
rate for ShiftSwap is **2 requests per second**. NFR-PERF-001 reads "at the peak request rate stated in the
application's PRD" (`nfr-register.md:65-67`); this is that statement. The load test is therefore *ready* in the sense of
`engineering-standard.md:56-57`, but it cannot be run: it needs staging, and none exists.

### Standing NFRs that bind this work (proposed dispositions; the formal disposition is set at feature sign-off)

| NFR | Register locator | What it requires of this work | Proposed disposition | Evidence status today |
| --- | --- | --- | --- | --- |
| NFR-PRIV-001 — No personal data in logs | `nfr-register.md:11-24` | No name, number or contact detail in logs/traces/metrics; audit records are exempt and access-restricted | mapped | Provable locally (integration · task). |
| NFR-COMP-001 — Append-only audit record | `nfr-register.md:26-42` | One record per state-changing decision: actor, UTC time, action, outcome, policy revision; no update/delete | mapped | Provable locally. Owner: Simone Arceneaux. |
| NFR-A11Y-001 — axe-core wcag2a/2aa/21a/21aa/22aa zero violations per view | `nfr-register.md:44-57` | Every view passes the automated checks. The standard requires manual assistive-technology review before site-wide release but **not** for a pilot (`engineering-standard.md:47-48`) | mapped | Automated checks run locally; the test environment does not evaluate colour contrast (`AGENTS.md`, Gotchas), so this is partial evidence, not a conformance claim. |
| NFR-PERF-001 — p95 ≤ 500 ms | `nfr-register.md:59-72` | Staging, at the peak request rate stated in this PRD — **2 requests per second** (kickoff § 5.3) — for 10 minutes (`engineering-standard.md:52-54`) | mapped | **Blocked.** No staging exists (kickoff § 5.2; `engineering-standard.md:87-91`); the standard says the requirement "remains a requirement" (`:90-91`). The rate is now supplied, so the standard's "no peak rate" bar (`:56-57`) is cleared, but no p95 evidence exists and none can be produced until a staging environment exists. Residual risk owned by Marcus Ellery. **No waiver is presumed.** |
| NFR-REL-001 — 99.5% monthly availability | `nfr-register.md:74-87` | Production, platform probe every minute, excluding announced maintenance (`engineering-standard.md:61-63`) | mapped | ShiftSwap is Tier 3 (kickoff § 5.1), so § 6.1 applies. **Not evidenceable today:** a production measure, and the Tier 3 production platform is planned but not yet provisioned (kickoff § 5.2). It is *not* a staging requirement. |
| NFR-COMPAT-001 — Edge current and previous major | `nfr-register.md:89-102` | Verification steps complete on those releases | mapped | Provable by hand on a desktop; the pilot's client. |
| NFR-COMPAT-002 — Safari on iPadOS current and previous major | `nfr-register.md:104-117` | Verification steps complete on those releases | mapped; **waiver proposed, unsigned** (Q6) | **Not waived.** The record is active today; a waiver exists only when signed. Proposed terms (kickoff § 5.4; the kickoff note "is not the waiver"): *Rationale* — the pilot is used from control-room desktops only. *Residual risk* — the application is unverified on tablets and must not be used outside the control rooms. *Owner* — Marcus Ellery. *Revisit* — before any use outside the control rooms, or at the end-of-pilot decision, whichever comes first. Marcus has agreed to sign with the Business Engineer at feature sign-off; **both signatures are required, neither is recorded, and this PRD does not assume the waiver is granted.** Until signed, the NFR stays unevidenced. |

Two further engineering-standard requirements are carried as functional requirements above (D2): identity only from the
gateway headers (`engineering-standard.md:76-83`) and decision-record access limited to the `shift-supervisor` role,
with auditors served by IT extracts (kickoff § 5.5; `engineering-standard.md:37-38`). The scheduler is given that role
for the pilot (kickoff § 5.7); the access rule itself is unchanged, and the consequence for her access is Q26.

---

## Dependencies & Risks

### Dependencies

Owners marked *(proposed)* are suggestions based on roles in the sources; none is confirmed by the person named.

| Dependency | Team/Owner | Status |
| --- | --- | --- |
| Published nightly roster JSON from the scheduling system (read-only; shifts, qualifications): 02:00 site time, 28-date coverage (six days before to 21 days after the export date), `exportedAt`/`coverage` | Marcus Ellery and Hannah Beaulieu stated these (kickoff §§ 3.1–3.4; coverage corrected in revision 2, § 3.2) | **Stated by the client; production file not seen by this PRD.** HSSE does not require checking outside coverage (kickoff § 2.6) and agrees the 26-hour limit (§ 2.7). Whether the production file's `coverage` matches the § 3.2 rule is unchecked |
| Qualification record currency | Training records system, read immediately before each export (kickoff § 3.3) | **Stated.** Same-day lapses/renewals not visible until the next export; accepted by HSSE for the pilot (kickoff § 2.5). Training function unnamed |
| Scheduler entry of approved swaps | Hannah Beaulieu enters; the supervisor responsible under § 4.1 (earliest-starting shift's unit; on a tie, the unit of the shift the requester gave up, § 4.5) ensures she has the swap (kickoff §§ 4.1, 4.5); Hannah corrects the scheduling system when an export contradicts an approved swap (kickoff § 4.4) | **Decided, manual, no integration.** Scheduler access to the list: she is given the `shift-supervisor` gateway role (kickoff § 5.7) — **IT must make that grant**; not recorded as done. Consequences of the role: Q26. Handoff acknowledgement beyond the list: none decided |
| IT grant of the `shift-supervisor` role to Hannah Beaulieu | Marcus Ellery / gateway owner (not named) *(proposed)* | Decided (kickoff § 5.7); **no record that it has been made** |
| HSSE decisions on training days, the § 4.5 "who decided" field, checking only what the export covers, and the 26-hour limit | Simone Arceneaux, HSSE Manager | **Decided** (kickoff §§ 2.1, 2.2, 2.6, 2.7). Revision 4 and the holdover review are outside the pilot (kickoff §§ 2.1, 2.4) |
| Site access gateway providing `X-Employee-Number` and `X-Roles` | Gateway owner — not named; Marcus Ellery *(proposed)* | Standard-defined (`engineering-standard.md:76-80`); pilot connection unconfirmed. No auditor role exists (kickoff § 5.5) |
| Somewhere to run the pilot: Tier 3 production platform behind the site access gateway | Marcus Ellery / IT Applications provisions; not part of the build (kickoff § 5.2) | **Planned, not yet provisioned; no date given.** No staging. Local environment only, non-production (kickoff § 5.2; `AGENTS.md`; `engineering-standard.md:85-91`) |
| IT extracts of decision records for auditors; register record for three-year retention | Marcus Ellery (kickoff §§ 5.5, 5.6) | Extracts "on request"; register revision at its next revision, **timing not stated** |
| Pilot tally by the two supervisors, same sheet as baseline | Renee Landry (CDU), Carl Nguyen (HCU) *(proposed)*; both attended the kickoff but nothing records their agreement to the tally | Not confirmed. Must record supervisor minutes for **every** request received, zero where no supervisor acted (kickoff §§ 1.5, 1.8); how the tally sheet will capture zero-minute requests is not described |
| Post-worked review of swaps | Simone Arceneaux (HSSE, kickoff § 2.3); Gloria Menard (payroll, kickoff § 4.3) | Named and described by the kickoff; the method is as the tally's |
| Sponsor approval of the pilot, targets and window | Dana Whitlock, Operations Manager | **Decided** (kickoff §§ 1.1, 1.3, 1.4). Window start date not set |
| Business Engineer to accept this PRD, sign off features, approve task sets, co-sign any tablet waiver | Business Engineer assigned by IT Applications; **not named** | Authority delegated (kickoff § 1.2); **no acceptance or signature recorded** |
| Control-room desktops with current/previous Edge | Port Alder IT | Stated by the brief (`operations-manager-brief.md:36-37`) and standard (`engineering-standard.md:67`); installed version unchecked |
| No new vendor licences or modules | — | Constraint (`operations-manager-brief.md:35`) |

### Assumptions — five original outcome assumptions, with v0.2 status (history preserved; v0.3 changes noted in the row)

The five assumptions of v0.1 are kept. Kickoff decisions resolved some **questions** that fed them (HSSE interpretation,
data parameters). Those are decisions, not evidence that the outcome hypotheses hold; each assumption's outcome part
stays unvalidated unless marked otherwise.

| # | Assumption | Owner *(proposed; not existing authority unless the source says so)* | v0.2 status | Method of validation | Risk if wrong |
| --- | --- | --- | --- | --- | --- |
| A1 | The four-week tally reflects typical outcomes. | Dana Whitlock, Operations Manager | **Unvalidated.** The kickoff adds a 30-approved-swap floor (§ 1.3) but does not test typicality | Pull further historical swap/payroll records for other periods and compare with the tally; check volume, seasonality and shift-change patterns | Baselines are unrepresentative; M-1 to M-4 comparisons mislead; a pilot could "pass" or "fail" against noise. The data are two supervisors' self-reports over four weeks. |
| A2 | Supervisors (via the tool) can check a **current, complete** roster and qualification data. | Marcus Ellery, IT Applications Lead | **Question part answered by client statement, outcome unvalidated.** Currency (26 h, § 3.5), coverage (§ 3.2), qualification source (§ 3.3) are defined; completeness is the client's statement, and a field comparison (§ 3.4) is not a completeness test. Whether the tool says "cannot determine" so often that it is unusable is untested (the proportion is unknown; v0.3: the Monday-specific effect of v0.2 no longer applies, kickoff § 3.2 as corrected) | Run the tool against production exports and compare with the scheduler once available | The tool gives false assurance, or says "cannot determine" so often that it is unusable. This is the assumption behind B3. |
| A3 | Training days count toward the hours limit. | Simone Arceneaux, HSSE Manager (the standard's owner, `fatigue-management-policy.md:11`) | **Resolved by HSSE for the pilot (kickoff § 2.1): not an outcome assumption any more.** Training counts only if rostered; revision 4 is outside the pilot. Not a validation of any benefit | None further for the pilot; revision 4 is HSSE's | If HSSE's reading changes, swaps may be passed that the new reading refuses; the F1 notice and the recorded policy revision mitigate. |
| A4 | A swap process can address the risk seen in the near miss. | Simone Arceneaux, HSSE Manager (investigation lead, `docs/discovery/near-miss-PA-NM-2026-0193.md:11`) | **Question part answered, outcome unvalidated.** HSSE confirms holdovers are a separate review outside the pilot (kickoff § 2.4) and breaches from holdovers were not counted in the tally (§ 2.3). That separates the risks; it does not show a swap process addresses the near-miss risk | Review the near-miss causes separately from the approval step | Stakeholders read a green result as protection against holdover shortfalls; the pilot does not address holdovers and **does not claim** to. |
| A5 | Late scheduler entry is mainly a supervisor-process problem. | Dana Whitlock, Operations Manager | **Unvalidated.** The kickoff fixes who enters (§ 4.1) and how M-4 is judged (§ 4.3, by payroll); it does not trace the 7 unentered swaps to cause | Trace the 7 unentered swaps to cause: supervisor email timing, scheduler workload, export timing, other | Even with a perfect tool, entry still lags because ShiftSwap cannot write to the roster; M-4 is not moved by ShiftSwap alone. |

### Risks & Mitigations

Likelihood and impact are my qualitative judgements (PROPOSAL), not measured.

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| False assurance: tool says compliant on stale, partial, or unreconciled data (including undecided conflicting requests, an export that contradicts an approved swap, or rest outside the export's coverage — which HSSE does not require checked, kickoff § 2.6, but which the tool must never present as safe) | Medium | High | B3 "cannot determine"; B6 stop-applying and block; `exportedAt` shown and recorded; 26-hour limit and the export-date-to-+15-days horizon enforced; overlay applied once; A2 |
| Users read "compliant" as protection against holdover shortfalls | Medium | High | Non-goal stated on views (F2); holdover review referred to HSSE (`docs/discovery/near-miss-PA-NM-2026-0193.md:39`; kickoff § 2.4); A4 |
| HSSE's reading of training days changes at revision 4, so the tool passes or fails swaps differently | Low | Medium | Pilot rule is rostered-only (kickoff § 2.1); F1 notice; policy revision recorded in every decision |
| Many requests return "cannot determine" because shifts fall outside the export-date-to-+15-days horizon, the export is over 26 hours old, or a contradictory export blocks requests involving the affected employees and shifts (kickoff § 4.4), so the pilot yields few approved swaps and an inconclusive result (fewer than 30 approved, kickoff § 1.3) | Medium | Medium | Proportion unknown until the pilot records it; inconclusive is reported, not passed; B6 blocks only requests involving the swap's two employees or two shifts |
| A contradictory export blocks requests until Hannah corrects the scheduling system and a later export agrees; the correction depends on one person and the nightly cycle | Medium | Medium | Attention mark on the list she works from (B6, proposed placement); no escalation path or time limit is stated in the kickoff and none is invented |
| The scheduler's `shift-supervisor` role (kickoff § 5.7) also exposes decision records and supervisor views to her; the gateway has no narrower role | Medium | Medium | The supervisor-only rule and IT extracts for auditors are unchanged (kickoff § 5.5); the grant is to be made by IT; consequences are Q26 — not accepted by any named person in the kickoff |
| Same-day qualification lapse not visible until next export (accepted by HSSE, kickoff § 2.5) | Medium | High | Accepted for the pilot; export time on every result; M-2 target is zero, so any resulting breach is a failure |
| Entry lag persists because the roster cannot be written | High | Medium | E1/E2 make it visible; M-4 judged separately by payroll (kickoff § 4.3); A5 tested |
| Baseline too small/self-reported; strict-improvement rule is noisy | High | Medium | Read results as indicative; 30-swap floor (kickoff § 1.3); A1 |
| Requests continue outside the tool (texts), so the pilot is not measured fairly | Medium | Medium | Supervisors keep the tally for every request received, as in the baseline (`supervisor-interviews.md:14`) *(proposed)* |
| No pilot hosting yet; verification stays local only | High | High | Tier 3 platform planned, not provisioned (kickoff § 5.2); Marcus Ellery provisions; no date; Q8 |
| Performance and availability NFRs unevidenced (no staging, production not provisioned) | High | Medium | NFR-PERF-001 stays Blocked with residual risk owned by Marcus Ellery (peak rate 2 req/s supplied, kickoff § 5.3); no waiver presumed |
| Tablet waiver not signed by feature sign-off | Medium | Medium | NFR-COMPAT-002 stays unevidenced; use outside control rooms prohibited by the proposed terms (kickoff § 5.4); needs Business Engineer and Marcus Ellery signatures (Q6) |
| Personal data leaks into logs | Low | High | D3; NFR-PRIV-001 integration test |
| Auditors cannot read records directly (no gateway role) | Medium | Medium | IT extracts on request (kickoff § 5.5); extract process unspecified |
| Stakeholders still missing: Business Engineer identity, training function | Medium | Medium | Named as dependencies; Marcus Ellery to identify *(proposed)* |

---

## Milestones & Sequencing

No dates were set for build milestones; they are **sequenced, not scheduled** (DECISION, kickoff § 1.7). The pilot window
is four weeks from a Monday, with the start date set only once the application is running for pilot users (kickoff
§ 1.3). This PRD sets no calendar date and no build duration. Relative order only.

| Milestone | Scope | Timeframe |
| --- | --- | --- |
| M0 — Prepare implementation | Settle the remaining open points (Q25, Q26; Q6, Q8, Q14, Q19 as stated); plan the A2 data check and hosting | Not scheduled |
| M1 — Rules check | Groups B and F against the sample roster; verified locally | After M0; not scheduled |
| M2 — Request, consent, routing, records | Groups A, C, D (including timestamps, H1) | After M1; not scheduled |
| M3 — Scheduler wait tracking | Group E; list-based handoff (kickoff § 4.1) | After M2; not scheduled |
| M4 — Pilot window | CDU/HCU on control-room desktops on the provisioned Tier 3 platform; complete the A2 data check, select the start date, and keep the tally for M-1 to M-4 | Four weeks from a Monday; start date set once the application runs (kickoff § 1.3) |
| M5 — Evaluation | Sponsor reviews results herself (kickoff § 1.2) against the targets; decides continue/stop/extend; end-of-pilot revisit of the tablet waiver terms if one was signed | After M4; not scheduled |

---

## Go-to-Market Considerations

- **Launch type:** Pilot (phased; two units). Not GA.
- **Target segment for initial rollout:** CDU and HCU operators and the two units' shift supervisors, on
  control-room desktops (`operations-manager-brief.md:36-37`). Field tablets are not in scope.
- **Internal enablement:** supervisors and operators briefed on how to use the tool, that the tool does not address
  holdovers, that only rostered shifts are included in computed hours, that swaps outside the determinable horizon show
  "cannot determine", and that supervisors keep the tally during the pilot. HSSE, payroll (Gloria Menard) and the
  scheduler (Hannah Beaulieu) told what they will receive. Format and owners of the briefing not defined.
- **External comms:** none.

---

## Open Questions

Owners marked *(proposed)* are suggestions. "Due" is relative; none is set by a source. Question numbers Q1–Q20 are
unchanged from v0.1; the original wording is kept and the status and source are added. `kickoff § n.n` =
`docs/discovery/pilot-kickoff-decisions.md` (revision 2 as read for v0.3). "Closed" means the kickoff answers the question
as asked; it does not mean the outcome is validated. Q21–Q24 were new in v0.2 and are closed at v0.3; Q25–Q26 are new
in v0.3. The v0.2 status is kept in each changed row.

**Status summary (v0.3, Q1–Q26):** **Closed (17):** Q1, Q3, Q4, Q5, Q7, Q9, Q10, Q11, Q12, Q13, Q15, Q17, Q20, Q21,
Q22, Q23, Q24. **Partly answered (6):** Q2, Q6, Q8, Q14, Q18, Q19. **Still open (3):** Q16, Q25, Q26. (v0.2 for
reference: Q1–Q20 had 11 closed, 8 partly answered, 1 open; Q21–Q24 were open. Q9 and Q10 moved from partly answered to
closed at v0.3.)

| # | Question (v0.1 wording) | Status (v0.3; v0.2 where changed) | Source and what remains | Owner |
| --- | --- | --- | --- | --- |
| Q1 | Do training days count toward the seven-day hours limit (and the off-duty period)? (`supervisor-interviews.md:47-48`, `:56-57`, `:67-69`) | **Closed** | Kickoff § 2.1: rostered shifts only under revision 3; training counts only where rostered; both supervisors told; whether training should count is for revision 4, outside the pilot. | Simone Arceneaux |
| Q2 | How long is the pilot window, when does it start, and what minimum volume of approved swaps makes the comparison worth reading? | **Partly answered** | Kickoff § 1.3: four weeks, starts on a Monday; fewer than 30 approved swaps → measures dividing by approved swaps are inconclusive. **Open:** the start date, set only once the application is running; no calendar date exists. | Dana Whitlock |
| Q3 | Does the sponsor approve the pilot and the targets? Should M-2 be zero? | **Closed** | Kickoff § 1.1 (pilot approved), § 1.4 (strictly better than baseline; M-2 zero, one is a failure). Sponsor approval is not acceptance of this PRD (Q19). | Dana Whitlock |
| Q4 | How was "later found" decided in the baseline, and how will the pilot do it? Who at payroll supports the M-4 check? | **Closed** | Kickoff § 2.3: HSSE compared the roster as swapped (scheduled off-duty periods and qualifications), not hours worked; holdover breaches not counted; the pilot review uses the same method. Kickoff § 4.3: payroll's review by Gloria Menard. | Simone Arceneaux; Gloria Menard |
| Q5 | What is the peak request rate for the NFR-PERF-001 load test? | **Closed** | Kickoff § 5.3: 2 requests per second, stated in § Non-Functional Requirements. **NFR evidence stays blocked:** no staging (kickoff § 5.2). | Marcus Ellery |
| Q6 | NFR-COMPAT-002: prove it now, or request a waiver (BE and register owner sign)? | **Partly answered** | Kickoff § 5.4: Marcus agrees it should be waived and will sign with the Business Engineer at feature sign-off on the stated terms (rationale, residual risk, owner Marcus Ellery, revisit trigger). The kickoff says its note is not the waiver. **Open:** the signatures; no waiver exists or is presumed. | Business Engineer (not named) and Marcus Ellery |
| Q7 | Is ShiftSwap a Tier 3 application for NFR-REL-001? | **Closed** | Kickoff § 5.1: Tier 3 under VE-IT-STD-007 § 6. The availability measure still needs a provisioned production platform. | Marcus Ellery |
| Q8 | Where will the pilot run with real users? | **Partly answered** | Kickoff § 5.2: the Tier 3 production platform behind the site access gateway, provisioned by IT (not part of the build); local environment until then. **Open:** it is planned but not yet provisioned; no date. | Marcus Ellery |
| Q9 | What does the production export contain and when: horizon, schedule, completeness, how an as-of time is established? How are approved-but-not-yet-exported swaps reconciled? What staleness is acceptable? | **Closed (v0.3)** — was Partly answered at v0.2 | Kickoff §§ 3.1 (02:00 nightly, `exportedAt`), 3.2 as corrected in revision 2 (28 site-time dates, six days before to 21 days after the export date; `coverage`; complete for the range), 3.4 (sample structure compared with a production file), 3.5 and 2.7 (26 hours; HSSE agrees), 3.6 (horizon: export date through 15 days after), 3.7 (overlay; undecided conflicting requests), 4.4 (contradictory export). The v0.2 open items are answered by §§ 4.4 and 2.6 (rest beyond coverage: HSSE does not require it checked) and § 2.7. **Not validated:** completeness of production exports; the production file has not been seen. | Marcus Ellery; Simone Arceneaux |
| Q10 | How is an approved swap handed to whoever enters it, who is that, and how is actual entry confirmed? How does M-4 treat shifts worked before confirmation? | **Closed (v0.3)** — was Partly answered at v0.2 | Kickoff § 4.1 (Hannah enters; the supervisor of the unit whose swapped shift starts first ensures she has it; both work from ShiftSwap's list; no integration), § 4.2 (confirmed by a later export showing both shifts; next day at the earliest), § 4.3 (M-4 judged by payroll's review), § 4.4 (export that disagrees), § 4.5 (tie: supervisor of the unit of the shift the requester gave up), § 5.7 (Hannah's list access via the `shift-supervisor` role). No delivery or acknowledgement mechanism beyond the list is decided; none is invented. | Marcus Ellery; Hannah Beaulieu |
| Q11 | Where do qualification records originate, how current are they, how does a lapse reach the tool? | **Closed** | Kickoff § 3.3 (training records system, immediately before the export), § 2.5 (same-day lapses/renewals visible at the next export; accepted for the pilot). | Marcus Ellery |
| Q12 | For swaps approved without review, what satisfies § 4.5 "who decided"? | **Closed** | Kickoff § 2.2: the system acting under VE-HSSE-STD-014 § 4.3 at the stated revision, with the time both employees agreed; HSSE states this satisfies § 4.5. | Simone Arceneaux |
| Q13 | How are auditors identified from the gateway's `operator` / `shift-supervisor` roles? | **Closed** | Kickoff § 5.5: the gateway has no auditor role; decision records are visible to `shift-supervisor` only; auditors receive extracts from IT on request. Extract format and turnaround not stated. | Marcus Ellery |
| Q14 | Three-year retention is not in any standing record. Should the register owner add or amend a record? How is retention enforced? | **Partly answered** | Kickoff § 5.6: Marcus will add a standing record at the register's next revision; until then retention is met by never deleting a decision record; no purge is built. **Open:** when that revision happens (not stated). | Marcus Ellery; Simone Arceneaux |
| Q15 | What notification channels beyond in-app status are wanted, and what does "an answer before they leave shift" mean in time? | **Closed** | Kickoff § 1.6: in-application status only; a no-review swap is answered when the second operator agrees; no time target for reviewed swaps; request, agreement and decision times are recorded so one can be set later. | Dana Whitlock |
| Q16 | How many requests arrive around shift change? | **Still open** | Kickoff § 1.7: unknown until the pilot records it. Timestamps recorded (US10, H1). | Renee Landry, Carl Nguyen *(proposed)* |
| Q17 | For M-3, how are requests a supervisor never handles recorded — zero minutes or excluded? | **Closed** (updated v0.3) | Kickoff § 1.5: a swap approved without supervisor review is zero minutes and is included in the median; the reviewed-only median is also reported. Kickoff § 1.8: every request received counts; the figure is the supervisor time actually spent, and zero where no supervisor acted (no-review approval, blocked, cannot determine, withdrawn before review). v0.2 had left the other outcomes to Q24; § 1.8 answers it. | Dana Whitlock |
| Q18 | How are holdovers to be controlled? | **Partly answered** | Kickoff § 2.4: a separate HSSE review, outside the pilot. **Open:** how holdovers are controlled; not part of this pilot or PRD. | Simone Arceneaux |
| Q19 | Who is the Business Engineer / approver of this PRD? | **Partly answered** | Kickoff § 1.2: the Business Engineer assigned by IT Applications accepts the PRD, signs off features and approves task sets. **Open:** the person's identity (none is named in any file); no acceptance recorded. | Dana Whitlock; Marcus Ellery |
| Q20 | What durations should be assigned to preparation, implementation and evaluation milestones? | **Closed** | Kickoff § 1.7: no dates set for build milestones; sequenced, not scheduled. | Dana Whitlock |
| Q21 | **New (v0.2).** Is the bounded export coverage acceptable for HSSE: does HSSE need the full resulting schedule beyond declared coverage checked (rest periods overlapping time outside coverage are not shown), and is the lead-time effect of the six-day rule (Monday export → shifts six days ahead; see Solution Overview) acceptable? | **Closed (v0.3)** — was Open at v0.2 | HSSE part: kickoff § 2.6 — for the swap process the published roster is the export, a swap changes only the off-duty periods next to a swapped shift and the seven-day windows containing one, § 3.6 keeps all of those inside coverage, and HSSE does not require anything outside the coverage to be checked. That is HSSE's decision, not evidence that anything outside coverage is safe; the PRD makes no such claim. Lead-time part: its premise (Monday-start coverage) was wrong; kickoff § 3.2 as corrected and § 3.6 give determinable starts from the export's site-local date through 15 days after it on any weekday (Solution Overview, B3). **Still unknown:** the share of requests that fall outside that horizon; the kickoff does not say whether the sponsor finds the 15-day forward limit adequate, and no claim is made. Related unresolved reading: Q25. | Simone Arceneaux; Dana Whitlock *(proposed)* |
| Q22 | **New (v0.2).** Under which gateway role does the site scheduler see ShiftSwap's list of approved swaps awaiting entry? (Only `operator` and `shift-supervisor` exist; `engineering-standard.md:76-78`; kickoff § 5.5.) | **Closed (v0.3)** — was Open at v0.2 | Kickoff § 5.7: Hannah Beaulieu is given the `shift-supervisor` role at the gateway for the pilot so she can see the list. The supervisor-only rule for decision records and the IT-extract route for auditors are unchanged (kickoff § 5.5). **Remaining:** the grant is not recorded as made; the consequences of the role for her other access are Q26. | Marcus Ellery |
| Q23 | **New (v0.2).** Overlay details: how a swap shown in an export for only one of its two shifts, or entered differently from the approved swap, is treated; which unit's supervisor is responsible when both swapped shifts start at the same time. | **Closed (v0.3)** — was Open at v0.2 | Kickoff § 4.4: ShiftSwap stops applying the swap and marks it for the scheduler's attention; requests involving those shifts or those employees cannot be determined until Hannah corrects the scheduling system and a later export agrees (B6). Kickoff § 4.5: on a tie, the supervisor of the unit of the shift the requester gave up. **Unstated edge cases** are in the change log (Contradictions, items 9–10). | Marcus Ellery; Hannah Beaulieu |
| Q24 | **New (v0.2).** How are requests not approved, including declined, withdrawn and indeterminate requests, included in the M-3 median? | **Closed (v0.3)** — was Open at v0.2 | Kickoff § 1.8: every request received counts; the figure is supervisor time actually spent, zero where no supervisor acted (blocked, cannot determine, withdrawn before review, no-review approval). A declined request with supervisor action counts its actual minutes. Still unstated: classing of a request withdrawn after review began, for the reviewed-only median. | Dana Whitlock; Business Engineer |
| Q25 | **New (v0.3).** Kickoff § 2.6 says HSSE requires only change-related windows and rest periods inside coverage to be checked, while B1 (v0.2) also checks every other window within coverage and the standard says the resulting schedule must meet § 3. Should an existing breach in a window or rest period the swap does not change stop the swap? | **Open** | Not answered by the kickoff. B1 keeps the v0.2 behaviour (checks all windows within coverage, labels which are change-related) rather than silently dropping a protection. | Simone Arceneaux |
| Q26 | **New (v0.3).** With the `shift-supervisor` role (kickoff § 5.7), the scheduler can also see decision records and supervisor views. Is that intended, and are supervisor review approve/decline actions limited to the supervisor of an affected unit rather than anyone holding the role? | **Open** | Kickoff § 5.7 gives the role "so that she can see the list"; it says nothing further. Sources do not show how the gateway maps a supervisor to a unit. The PRD adds no new role and no new approval. | Marcus Ellery; Simone Arceneaux |

---

## Appendix

### Decision recorded (verbatim from the requester)

> "Decision: proceed to a PRD for a pilot. I am not accepting the recommendation to defer, for this reason: the
> standard requires checking both employees' full resulting schedules, and the supervisors say they do not calculate
> rest hours and cannot see the other unit's roster. The pilot is the validation vehicle."

The requester's conditions (pilot only on CDU/HCU control-room desktops; holdovers a non-goal; five assumptions carried
with owners; hours follow the standard as written; process-only alternative recorded; self-reported outcome criteria
against tally baselines; standing NFRs listed with missing figures as open questions) are applied throughout. HSSE has
since resolved training treatment for this pilot (kickoff § 2.1). The recommendation to defer came from prior analyses that are
not stored in the repository and are not cited here as evidence; they, and any other agent research, are not human
sign-off.

### Sources read (all in this repository)

| Source | Used for |
| --- | --- |
| `docs/discovery/operations-manager-brief.md` | Problem, constraints, judging criteria (`:14-21`, `:27-28`, `:32-38`, `:42-45`, `:49-50`) |
| `docs/discovery/supervisor-interviews.md` | Tally, quotes, open points (`:10-35`, `:37-71`) |
| `docs/discovery/near-miss-PA-NM-2026-0193.md` | Near-miss facts and recommendations (`:16-23`, `:27-39`) |
| `docs/standards/fatigue-management-policy.md` (VE-HSSE-STD-014, rev 3) | Definitions, limits, swap rules, records (`:21-47`, `:53-82`, `:84-88`, `:94`) |
| `docs/standards/engineering-standard.md` (VE-IT-STD-007, rev 5) | NFR sources, identity, environments (`:20-27`, `:31-38`, `:42-48`, `:52-57`, `:61-63`, `:67-72`, `:76-83`, `:87-91`) |
| `docs/design/quality/nfr-register.md` | Seven standing records (`:11-117`) |
| `AGENTS.md` | Layout, KPI rule, environments, gotchas |
| `docs/discovery/pilot-kickoff-decisions.md` (meeting held 2026-11-16, recorded by Port Alder IT Applications; **revision 2**, issued 2026-11-16, read in full for v0.3) | Client decisions by section: § 1 sponsor (1.1 pilot approved; 1.2 Business Engineer delegation; 1.3 window and 30-swap rule; 1.4 targets; 1.5 supervisor time; 1.6 in-app only and timestamps; 1.7 no dates, request counts unknown; **1.8 every request received counts toward supervisor time, zero where no supervisor acted**); § 2 HSSE (2.1 training; 2.2 who decided; 2.3 detection method; 2.4 holdovers; 2.5 qualification timing; **2.6 check only what the export covers; 2.7 26-hour limit agreed**); § 3 export (3.1 schedule; **3.2 coverage, corrected in revision 2**; 3.3 qualifications; 3.4 sample; 3.5 26 hours; **3.6 horizon, reworded**; 3.7 overlay; 3.8 local clock); § 4 scheduler entry (4.1 who enters; 4.2 confirmation; 4.3 measure; **4.4 export that disagrees; 4.5 tie on start time**); § 5 IT (5.1 tier; 5.2 environment; 5.3 peak rate; 5.4 tablet waiver terms; 5.5 auditors; 5.6 retention; **5.7 scheduler's access**). Cited as "kickoff § n.n". The kickoff is a record of decisions, not an approval of this PRD, not a signed waiver, and not proof that any outcome holds. |
| `data/roster.sample.json` | Fictional sample: `site.timeZone`, `exportedAt` (`:7`), `coverage` (`:8-11`), qualification fields; the production export has not been seen |

### Change log

| Version | Change |
| --- | --- |
| 0.1 | Initial draft for Product Engineer review. No approvals recorded. |
| 0.2 | **Reviewed draft, not approved.** Incorporates kickoff decisions and the sample's `exportedAt`/`coverage` fields without changing pilot scope. Maps Q1–Q20 and adds Q21–Q24; records sponsor targets, the pilot window, roster and scheduler rules, HSSE interpretation, and the performance peak of 2 requests per second. Retains the five assumptions with updated status. Staging evidence is blocked and the tablet waiver remains unsigned. |
| 0.3 | **Reviewed draft, not approved; pilot scope unchanged.** Applies `docs/discovery/pilot-kickoff-decisions.md` revision 2. **Coverage and horizon corrected** (§§ 3.2, 3.6): 28 site-local dates from six days before the export date through 21 days after; determinable shifts start from the export's site-local date through 15 days after it, inclusive, on any weekday; weekday-independent examples and fixtures added; the sample (7–22 March 2027) remains valid. Replaced every "Monday-based" statement (TL;DR, export table, worked check, consequences, B1, B3, risks). **HSSE** (§§ 2.6, 2.7): only what the export covers need be checked; 26-hour limit agreed; B1 restated with the required minimum and the v0.2 checks retained (Q25). **Contradictory exports** (§ 4.4) added as B6 and to use case 4, US7, B3 and the overlay text; **tie rule** (§ 4.5) added to E1/E3 and UX. **Scheduler role** (§ 5.7) added to D2, E1, US6/US7, dependencies, risks (Q26). **Supervisor time** (§ 1.8) applied to M-3, the baseline note and the tally dependency. Q21–Q24 closed with sections cited; Q9, Q10 and Q17 updated (Q9, Q10 now closed); Q25 and Q26 added. The five assumptions, v0.1/v0.2 history and prior source citations are kept. Unchanged: no acceptance by the Business Engineer, no signed tablet waiver, no staging, unverified NFR evidence, and the Q2, Q6, Q8, Q14, Q16, Q18, Q19 positions. Kickoff revision 2 is a record of decisions, not evidence that any outcome holds. |
| 0.3 acceptance | On 2026-11-15, the requester identified themselves as the Business Engineer assigned by IT Applications (kickoff § 1.2) and accepted version 0.3 with Q16, Q25 and Q26 open. Their name was not provided; this acceptance does not sign a waiver or close the open questions. |

**Contradictions and tensions (found in v0.2, status updated at v0.3; history kept):**

1. The kickoff record is dated 2026-11-16 (revision 2 is also issued 2026-11-16); this revision is dated 2026-11-15
   (system date). The discrepancy is not explained in the supplied materials and is **not resolved** by this PRD.
2. v0.1 said the tool checks "full resulting schedules"; the decided horizon (kickoff § 3.6) and a 28-date export mean
   that cannot be guaranteed. Narrowed in TL;DR, Solution Overview and B1. *v0.3:* HSSE states that only what the
   export covers need be checked (kickoff § 2.6); the narrowing stays, and nothing beyond coverage is claimed safe.
3. Kickoff § 3.6 defines the minimum coverage for windows containing a swapped shift; it does not remove the policy's
   requirement to assess the resulting schedule. B1 retained checks of all seven-day windows within coverage. *v0.3:*
   kickoff § 2.6 says change-related windows and rest periods suffice for the swap process, but the standard still says
   the resulting schedule must meet § 3 and the kickoff does not say what to do about a breach the swap does not
   cause. **Not reconciled** — B1 keeps both the § 2.6 minimum and the v0.2 checks, and Q25 asks HSSE.
4. The M-3 baseline (14 minutes, per request received) is compared with a pilot median that includes zero-minute
   requests (kickoff §§ 1.5, 1.8). *v0.3:* the populations now match (every request received), but the tally's
   shortest request was 4 minutes, so the pilot median still is not like-for-like; the reviewed-only median is the
   comparator for handling effort. Reported, not changed.
5. The tablet waiver is agreed in principle but unsigned (kickoff § 5.4); NFR-COMPAT-002 remains an active, unevidenced
   record until both signatures exist.
6. *(Withdrawn at v0.3.)* v0.2 said the six-day rule could make shifts in the days after a Monday export
   undeterminable. That rested on revision 1's wrong coverage wording (kickoff § 3.2, corrected); under the corrected
   rule the earliest determinable shift is the export's site-local date on any weekday. Kept for history.

**New at v0.3 (unresolved or unstated in the kickoff):**

7. The `shift-supervisor` role given to the scheduler (kickoff § 5.7) also opens decision records, which are "visible to
   the `shift-supervisor` role only" (kickoff § 5.5). The two decisions are consistent but the wider access is not
   discussed, and sources do not show whether supervisor review actions are tied to a unit (Q26).
8. Kickoff § 2.6 versus B1's all-windows check: see item 3 and Q25.
9. Kickoff § 4.4 says "a different change" without defining it. This PRD treats a change to either of the swap's two
   shifts other than as approved as contradictory (B6). Whether a roster change to *other* shifts of the same employees
   counts is not stated; the PRD does not treat it as a contradiction but does not claim the kickoff says so.
10. Kickoff § 4.4 lifts the block when "a later export agrees". This PRD reads "agrees" as showing both shifts against
    the swapped operators (kickoff § 4.2). If the scheduler instead reverts the entry, the later export looks like an
    unchanged export; the kickoff does not say whether that clears the block. Also unstated: a swap whose shifts fall
    outside a later export's coverage before any export confirms it.
11. Kickoff § 3.6 is written in terms of the export's coverage; the sample's `coverage` fits the § 3.2 rule, but the
    kickoff does not say what to do if a production file's `coverage` fields disagree with it. B3 conservatively returns
    "cannot determine" when the fields and the rule disagree; the operational remediation is not specified.
