import type { FastifyReply, FastifyRequest } from "fastify";
import type { Roster } from "./roster";

// Identity comes from headers set by the site access gateway (engineering-standard § 8.1).
// Header values are never logged or echoed (NFR-PRIV-001).

export interface Caller {
  employeeNumber: string;
  roles: readonly string[];
}

const callers = new WeakMap<FastifyRequest, Caller>();

/** The identity attached by `requireOperator`. Undefined on routes that do not use the hook. */
export function callerOf(request: FastifyRequest): Caller | undefined {
  return callers.get(request);
}

/** The single value of a header, or undefined if absent, empty after trim, or repeated. */
function singleHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (typeof value !== "string") {
    return undefined;
  }
  // Node joins repeated custom headers into one string, so count them in the raw header list.
  let occurrences = 0;
  for (let index = 0; index < request.raw.rawHeaders.length; index += 2) {
    if (request.raw.rawHeaders[index]?.toLowerCase() === name) {
      occurrences += 1;
    }
  }
  if (occurrences > 1) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseRoles(header: string): string[] {
  return header
    .split(",")
    .map((role) => role.trim())
    .filter((role) => role !== "");
}

/** Route-level `onRequest` hook: only a roster operator holding the `operator` role gets through. */
export function requireOperator(roster: Roster) {
  const operatorNumbers = new Set(roster.operators.map((operator) => operator.employeeNumber));

  return async function requireOperatorHook(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | undefined> {
    const employeeNumber = singleHeader(request, "x-employee-number");
    const rolesHeader = singleHeader(request, "x-roles");
    if (employeeNumber === undefined || rolesHeader === undefined) {
      return reply.code(401).send({ kind: "unauthenticated" });
    }
    const roles = parseRoles(rolesHeader);
    if (!roles.includes("operator")) {
      return reply.code(403).send({ kind: "forbidden", code: "role-not-permitted" });
    }
    if (!operatorNumbers.has(employeeNumber)) {
      return reply.code(403).send({ kind: "forbidden", code: "not-a-roster-operator" });
    }
    callers.set(request, { employeeNumber, roles });
    return undefined;
  };
}
