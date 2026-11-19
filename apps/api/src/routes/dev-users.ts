import type { FastifyInstance } from "fastify";
import { ROSTER_UNAVAILABLE } from "../identity";
import { devUsers, type DevUser, type RosterSource } from "../roster";

export type { DevUser };

export interface DevUsersResponse {
  users: DevUser[];
}

/**
 * Registers GET /api/dev/users, the development-only user switcher (engineering standard § 8.3).
 * The caller must not register it when NODE_ENV is production. No identity check, and nothing is
 * logged but a fixed line: the body names people on purpose, the logs must not (NFR-PRIV-001).
 * The roster is read per request; an unreadable one is a 503.
 */
export function registerDevUsersRoute(app: FastifyInstance, source: RosterSource): void {
  app.get("/api/dev/users", (request, reply) => {
    const read = source();
    if (!read.ok) {
      request.log.warn("roster unavailable");
      return reply.code(503).send(ROSTER_UNAVAILABLE);
    }
    const body: DevUsersResponse = { users: devUsers(read.raw) };
    return reply.send(body);
  });
}
