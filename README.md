# ShiftSwap

Shift swap requests for refinery operators, checked against the site fatigue standard and
qualification records before a supervisor sees them. Pilot scope: the Crude Distillation Unit and
Hydrocracker Unit at Port Alder Refinery.

> **Fictional demo project.** Veridane Energy, Port Alder Refinery, the people named in this
> repository, and every figure and limit in `docs/standards/` and `docs/discovery/` were invented
> for a demonstration. Nothing here is real guidance on fatigue management.

This repository is a starting skeleton. The toolchain is in place and no feature is built.

- `AGENTS.md` — layout, commands, style, guardrails. Start there.
- `docs/discovery/` — the problem, as the client described it.
- `docs/standards/` — the client's fatigue standard and IT engineering standard.
- `docs/design/quality/nfr-register.md` — the standing non-functional requirements.

## Quick start

```bash
npm ci
```

```bash
npm run build && npm run lint && npm test
```

## Running locally

Start the API (port 3000), then the web app (port 5173), and pick a user in the "Act as"
switcher. The sample roster is dated March 2027, so set the application clock as `AGENTS.md`
describes. The API reads `SHIFTSWAP_NOW` once at startup and the swap check uses it. With the
sample roster it is required: if it is unset, the swap check returns "cannot determine" while the
system date is before the export. A malformed value stops the API at startup:

```bash
SHIFTSWAP_NOW=2027-03-07T14:00:00Z npm run dev:api
```

In PowerShell, use `$env:SHIFTSWAP_NOW="2027-03-07T14:00:00Z"; npm run dev:api`. The `VAR=value`
form above is bash syntax.

```bash
npm run dev:web
```

- `SHIFTSWAP_ROSTER_PATH` overrides the roster export the API reads. The default is
  `data/roster.sample.json`. Use an absolute path: the API passes the value to the file system
  unchanged, and `npm run dev:api` runs in the `apps/api` workspace, so a relative path resolves
  from `apps/api`, not the repo root. The API reads the file on every request and never writes to
  it. If the file is missing, unreadable or not JSON, the routes that need the roster return HTTP
  503 `{"code":"roster-unavailable"}`; the API still starts, and `GET /api/healthz` still answers.
- The switcher is development-only (engineering standard § 8.3). The API route follows `NODE_ENV`:
  when it is not `production`, the API serves `GET /api/dev/users`. The web switcher and identity
  headers follow the Vite build mode: outside a production build (`vite build`), including
  `npm run dev:web`, the web app shows the switcher and sends `X-Employee-Number` and `X-Roles` for
  the chosen user. `NODE_ENV` does not affect the web app. In production the route is not
  registered and the web app shows no switcher and sends no identity headers, because the site
  access gateway sets them.
