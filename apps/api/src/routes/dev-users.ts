import type { FastifyInstance } from "fastify";
import type { Roster } from "../roster";

/** A roster person the development-only user switcher can act as. */
export interface DevUser {
  employeeNumber: string;
  name: string;
  roles: string[];
}

export interface DevUsersResponse {
  users: DevUser[];
}

/**
 * Registers GET /api/dev/users, the development-only user switcher (engineering standard § 8.3).
 * The caller must not register it when NODE_ENV is production. No identity check, and nothing is
 * logged: the body names people on purpose, the logs must not (NFR-PRIV-001).
 */
export function registerDevUsersRoute(app: FastifyInstance, roster: Roster): void {
  const users: DevUser[] = [
    ...roster.operators.map((operator) => ({
      employeeNumber: operator.employeeNumber,
      name: operator.name,
      roles: ["operator"],
    })),
    ...roster.supervisors.map((supervisor) => ({
      employeeNumber: supervisor.employeeNumber,
      name: supervisor.name,
      roles: ["shift-supervisor"],
    })),
  ];

  app.get("/api/dev/users", (): DevUsersResponse => ({ users }));
}
