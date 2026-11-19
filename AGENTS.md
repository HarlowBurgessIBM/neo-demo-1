# AGENTS.md

ShiftSwap lets refinery operators request a shift swap and checks the request against the site
fatigue standard and qualification records before a supervisor sees it. It is a pilot for the
Crude Distillation Unit (CDU) and Hydrocracker Unit (HCU) at Port Alder Refinery.

**Status: Feature 1 is built.** An operator can check a proposed swap by hand and see the result
for both employees (issue #3). Nothing is stored and there is no approval path. Features 2 to 5
in `docs/design/requirements/shift-swap-pilot/segmentation.md` are not built. The company, the
refinery, the people, and every document under `docs/standards/` and `docs/discovery/` are
fictional.

This file is the source of truth for layout, commands, style, and guardrails.

## Layout

```text
packages/rules/     Fatigue-policy rules engine. Pure TypeScript: no I/O, no clock, no framework.
apps/api/           HTTP API. Fastify, SQLite through Node's built-in node:sqlite.
apps/web/           Browser UI. React + Vite.
data/               roster.sample.json — sample of the nightly roster export (read-only input).
docs/standards/     Client standards. The sources for rules and NFRs. Do not edit.
docs/discovery/     Client brief, interview notes, near-miss summary. Do not edit.
docs/design/quality/nfr-register.md     Standing NFR register.
docs/design/requirements/               PRDs: docs/design/requirements/<name>/prd.md
docs/design/verification/               Verification plans: <issue-number>-<slug>-verification-plan.md
```

Dependencies point one way: `apps/web` → `apps/api` (over HTTP) → `packages/rules`. The rules
package imports nothing from the apps.

## Commands

Run from the repo root. Node 22.13 or later.

| Purpose | Command |
| --- | --- |
| Install | `npm ci` |
| Build (typecheck all workspaces, bundle the web app) | `npm run build` |
| Lint | `npm run lint` |
| Test, all layers | `npm test` |
| Test, one layer | `npm test -- --project rules` (or `api`, `web`) |
| Run the API (port 3000) | `npm run dev:api` |
| Run the web app (port 5173, proxies `/api` to the API) | `npm run dev:web` |

**Finish gate:** `npm run build`, `npm run lint`, and `npm test` all exit 0 before a unit is done.

## Style

- TypeScript strict mode. No `any`, no `// @ts-ignore`, no non-null `!` on values that can be null.
- Tests sit beside the code as `*.test.ts` / `*.test.tsx`. Vitest. Rules-engine logic gets
  property tests with fast-check as well as example tests.
- Every view test asserts `wcagViolations(container)` from `apps/web/src/axe.ts` returns `[]`.
- API tests call the app in process with `app.inject()`. They do not open a port.
- Server code logs only through the Fastify logger. `console` is a lint error in `apps/api`.
- Time arithmetic lives in `packages/rules` only. The apps do not compute durations.

## Guardrails

- Never commit or push to `main`. Work on a branch and end at a **draft** pull request. Never
  merge and never mark a pull request ready for review.
- Never edit `docs/standards/`, `docs/discovery/`, or `data/`. They are inputs from the client.
- Only the register owner changes `docs/design/quality/nfr-register.md`. Propose a record; do not
  write one.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/), one commit per completed unit.
Scopes: `rules`, `api`, `web`, `docs`, `repo`. Example: `feat(rules): evaluate off-duty period`.

## Work tracking and integration

- Work is tracked in GitHub Issues. A **Feature** is an issue labelled `feature`. A **Task** is an
  issue in the canonical task body, labelled `be-approved` once its task set is approved.
- **Integration mode A.** Each feature has an integration branch, `feature/<feature-issue>-<slug>`,
  cut from `main`. Task pull requests target that branch, not `main`. The feature branch is what
  the Business Engineer verifies, and it squash-merges to `main` only after verification passes.
  The squash commit body lists the feature issue and every child task issue.

## Non-functional requirements

- The standing NFR register is `docs/design/quality/nfr-register.md`. Its owner is named at the
  top of that file.
- Sources for NFRs are the documents under `docs/standards/`, cited by section.

## KPIs

The sponsor will not accept usage or adoption counts as evidence of value
(`docs/discovery/operations-manager-brief.md`, items 10–11). A KPI for this project names an
outcome metric, the baseline it is compared against, what will measure it, the window, and the
result that would show it failed.

## Environments

- **Local** is the only non-production environment: the API and web app running on one machine
  against `data/roster.sample.json`. Feature verification steps are run here.
- The sample roster is dated March 2027, so local runs set the application clock with the
  `SHIFTSWAP_NOW` environment variable, an ISO 8601 UTC instant ending in `Z`. The API reads it
  once at startup, and the swap check uses it. Use `2027-03-07T14:00:00Z` with the sample. A
  value that is not in that form (for example `2027-03-07 14:00` or `2027-03-07T14:00:00+00:00`)
  stops the API at startup with a non-zero exit and a message naming `SHIFTSWAP_NOW`. When the
  variable is unset the system clock is used. Tests pass the time explicitly.
- With the sample roster the clock is required. While the system date is before the March 2027
  export, an unset clock makes the swap check return "cannot determine" with `now-before-export`,
  for an authenticated caller with a valid pick. Step 7 of Feature #3's verification (the
  stale-export check) uses `2027-03-08T12:00:00Z`, which gives "cannot determine" with
  `export-stale`.
- `SHIFTSWAP_ROSTER_PATH` overrides the roster export the API reads. The default is the repo-root
  `data/roster.sample.json`. Use an absolute path: the value is passed to the file system
  unchanged, and `npm run dev:api` runs in the `apps/api` workspace, so a relative path resolves
  from `apps/api`, not the repo root. The API reads the file on every request, not once at
  startup, and never writes to it. A missing, unreadable or non-JSON file gives HTTP 503
  `{"code":"roster-unavailable"}`, with no file path in the body, on the routes that need the
  roster (`GET /api/shifts`, `POST /api/swap-checks`, `GET /api/dev/users`). On the
  identity-bearing routes (`GET /api/shifts`, `POST /api/swap-checks`) so does a parseable file
  whose `operators` is absent or not an array; `GET /api/dev/users` then lists only the
  supervisors, because it reads `operators` and `supervisors` separately.
  The identity header checks (401, 403) run before the roster is read, so a request without a
  valid identity gets those, not a 503. A missing or bad file does not fail startup. A parseable
  file with missing or invalid fields (export time, coverage, time zone, records) is not a 503:
  the swap check gives a "cannot determine" result, and `GET /api/shifts` returns a null export
  stamp. `GET /api/healthz` does not read the roster and needs no identity.
- **Development-only user switcher** (`docs/standards/engineering-standard.md` § 8.3). When
  `NODE_ENV` is not `production`, the API serves `GET /api/dev/users`, and the web app (outside a
  production build) shows an "Act as" switcher that sends `X-Employee-Number` and `X-Roles` for the
  chosen roster user. In production the route is not registered, the web app shows no switcher and
  attaches no identity headers, and the site access gateway sets them instead.
- To verify locally, run `SHIFTSWAP_NOW=2027-03-07T14:00:00Z npm run dev:api` (bash syntax; in
  PowerShell, `$env:SHIFTSWAP_NOW="2027-03-07T14:00:00Z"; npm run dev:api`), then
  `npm run dev:web`, then pick a user in the switcher. With the sample roster the clock is
  required: without it the swap check returns "cannot determine".
- There is **no staging environment** (`docs/standards/engineering-standard.md` § 9). Anything
  that needs one cannot be run.
- Nothing is deployed to production.

## Gotchas

- Roster times (`start`, `end`) are site-local wall-clock values with no UTC offset. The site
  time zone is in the roster file under `site.timeZone`.
- The roster file also carries `exportedAt`, a UTC instant, and `coverage`, the first and last
  site-local dates the export is complete for.
- The roster file is a nightly export from the scheduling system, which stays the system of
  record. ShiftSwap never writes to it.
- Identity comes from two request headers set by the site access gateway
  (`docs/standards/engineering-standard.md` § 8). There is no login to build.
- `node:sqlite` prints an `ExperimentalWarning` on Node 22. It is expected.
- The jsdom test environment prints `Not implemented: HTMLCanvasElement's getContext()` when
  axe-core runs. It is expected, and it means colour-contrast rules are not evaluated in tests.
