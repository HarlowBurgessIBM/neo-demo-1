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

Start the API (port 3000), then the web app (port 5173), and pick an operator in the "Act as"
switcher. The sample roster is dated March 2027, so set the application clock as `AGENTS.md`
describes:

```bash
SHIFTSWAP_NOW=2027-03-07T14:00:00Z npm run dev:api
```

```bash
npm run dev:web
```

- `SHIFTSWAP_ROSTER_PATH` overrides the roster export the API reads. The default is
  `data/roster.sample.json`. The API only reads the file and never writes to it.
- The switcher is development-only (engineering standard § 8.3). When `NODE_ENV` is not
  `production`, the API serves `GET /api/dev/users`, and the web app sends `X-Employee-Number` and
  `X-Roles` for the chosen user. In production the route is not registered and the web app shows no
  switcher and sends no identity headers, because the site access gateway sets them.
