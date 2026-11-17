import Fastify, { type FastifyInstance, type FastifyServerOptions, type RouteOptions } from "fastify";
import { defaultRosterPath } from "./config";
import { loadRoster, type Roster } from "./roster";
import { registerShiftsRoute } from "./routes/shifts";

export interface BuildAppOptions {
  fastify?: FastifyServerOptions;
  /** An already-parsed roster. Takes precedence over `rosterPath`. */
  roster?: Roster;
  /** Path to the roster file. Defaults to the repo's sample roster. */
  rosterPath?: string;
  /** `NODE_ENV`. Dev-only routes are not registered when it is `production`. */
  nodeEnv?: string | undefined;
  /** Observes every route registered, including health. */
  onRoute?: (route: RouteOptions) => void;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ ...options.fastify, exposeHeadRoutes: false });

  // Added before any route so that every route is observed.
  if (options.onRoute !== undefined) {
    app.addHook("onRoute", options.onRoute);
  }

  const roster = options.roster ?? loadRoster(options.rosterPath ?? defaultRosterPath);

  // No identity check: health must stay reachable without the access gateway (NFR-REL-001).
  app.get("/api/healthz", () => ({ status: "ok" }));

  registerShiftsRoute(app, roster);

  // Later units register POST /api/swap-checks here, and GET /api/dev/users only when
  // `options.nodeEnv !== "production"`.

  return app;
}
