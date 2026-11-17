import Fastify, { type FastifyInstance, type FastifyServerOptions, type RouteOptions } from "fastify";
import { defaultRosterPath } from "./config";
import { fileRosterSource, fixedRosterSource, type RosterSource } from "./roster";
import { registerDevUsersRoute } from "./routes/dev-users";
import { registerShiftsRoute } from "./routes/shifts";
import { registerSwapChecksRoute } from "./routes/swap-checks";

export interface BuildAppOptions {
  fastify?: FastifyServerOptions;
  /** A raw JSON roster value, served on every request. Takes precedence over `rosterPath`. */
  roster?: unknown;
  /** Path to the roster file, read on every request. Defaults to the repo's sample roster. */
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

  // Nothing is read here: the roster is read per request, so a missing file does not stop the app.
  const source: RosterSource =
    options.roster !== undefined
      ? fixedRosterSource(options.roster)
      : fileRosterSource(options.rosterPath ?? defaultRosterPath);

  // No identity check and no roster read: health must stay reachable without the access gateway
  // and with the roster unavailable (NFR-REL-001).
  app.get("/api/healthz", () => ({ status: "ok" }));

  registerShiftsRoute(app, source);

  registerSwapChecksRoute(app, source);

  // Development-only user switcher (engineering standard § 8.3). Absent in production, so 404.
  if (options.nodeEnv !== "production") {
    registerDevUsersRoute(app, source);
  }

  return app;
}
