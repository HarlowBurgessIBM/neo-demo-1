import type {
  DevUsersResponse,
  ForbiddenResponse,
  Identity,
  NotEvaluatedResponse,
  RefusedResponse,
  ShiftsResponse,
  SwapPick,
} from "./contract";

export interface ApiError {
  kind: "error";
  /** HTTP status, or undefined when no response arrived. */
  status: number | undefined;
  message: string;
}

export interface Unauthenticated {
  kind: "unauthenticated";
}

export interface Forbidden {
  kind: "forbidden";
  body: ForbiddenResponse;
}

export type GetResult<T> = { kind: "ok"; data: T } | Unauthenticated | Forbidden | ApiError;

export type SwapCheckResult =
  | { kind: "refused"; body: RefusedResponse }
  | { kind: "not-evaluated"; body: NotEvaluatedResponse }
  | Unauthenticated
  | Forbidden
  | ApiError;

type Outcome = { status: number; body: unknown } | ApiError;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isForbiddenBody(body: unknown): body is ForbiddenResponse {
  return (
    isRecord(body) &&
    body["kind"] === "forbidden" &&
    (body["code"] === "give-shift-not-yours" ||
      body["code"] === "role-not-permitted" ||
      body["code"] === "not-a-roster-operator")
  );
}

function isRefusedBody(body: unknown): body is RefusedResponse {
  if (!isRecord(body) || body["kind"] !== "refused") {
    return false;
  }
  const reasons = body["reasons"];
  // Each reason must be an object with a string code, so the view can always read `code`.
  return Array.isArray(reasons) && reasons.every((reason) => isRecord(reason) && typeof reason["code"] === "string");
}

function isNotEvaluatedBody(body: unknown): body is NotEvaluatedResponse {
  return isRecord(body) && body["kind"] === "not-evaluated";
}

/**
 * Identity headers for development. The site access gateway sets them in real deployments
 * (engineering standard section 8), so in production they are never attached, even when an identity
 * is passed. `import.meta.env.PROD` is read on each call so tests can stub it.
 */
function identityHeaders(identity: Identity | undefined): Record<string, string> {
  if (import.meta.env.PROD || identity === undefined) {
    return {};
  }
  return { "X-Employee-Number": identity.employeeNumber, "X-Roles": identity.roles.join(",") };
}

async function send(path: string, init: RequestInit): Promise<Outcome> {
  try {
    const response = await fetch(path, init);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    return { status: response.status, body };
  } catch {
    return { kind: "error", status: undefined, message: "The server could not be reached." };
  }
}

function httpError(status: number): ApiError {
  return { kind: "error", status, message: `The server answered with an unexpected status (${status}).` };
}

/** Maps the statuses every endpoint shares. Returns undefined when the status is endpoint-specific. */
function commonFailure(outcome: { status: number; body: unknown }): Unauthenticated | Forbidden | undefined {
  if (outcome.status === 401) {
    return { kind: "unauthenticated" };
  }
  if (outcome.status === 403 && isForbiddenBody(outcome.body)) {
    return { kind: "forbidden", body: outcome.body };
  }
  return undefined;
}

async function getJson<T>(
  path: string,
  identity: Identity | undefined,
  hasExpectedShape: (body: Record<string, unknown>) => boolean,
): Promise<GetResult<T>> {
  const outcome = await send(path, { method: "GET", headers: identityHeaders(identity) });
  if ("kind" in outcome) {
    return outcome;
  }
  if (outcome.status === 200) {
    if (isRecord(outcome.body) && hasExpectedShape(outcome.body)) {
      // Only the top-level collections are checked; the items are the API's documented JSON.
      return { kind: "ok", data: outcome.body as T };
    }
    return { kind: "error", status: 200, message: "The server answered with an unexpected response." };
  }
  return commonFailure(outcome) ?? httpError(outcome.status);
}

export function getDevUsers(): Promise<GetResult<DevUsersResponse>> {
  return getJson<DevUsersResponse>("/api/dev/users", undefined, (body) => Array.isArray(body["users"]));
}

export function getShifts(identity?: Identity): Promise<GetResult<ShiftsResponse>> {
  return getJson<ShiftsResponse>(
    "/api/shifts",
    identity,
    (body) => {
      const take = body["take"];
      // Each take entry must carry a string owner name, so the picker can always show it.
      return (
        Array.isArray(body["give"]) &&
        Array.isArray(take) &&
        take.every((entry) => isRecord(entry) && typeof entry["ownerName"] === "string")
      );
    },
  );
}

export async function postSwapCheck(identity: Identity | undefined, pick: SwapPick): Promise<SwapCheckResult> {
  const outcome = await send("/api/swap-checks", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...identityHeaders(identity) },
    body: JSON.stringify(pick),
  });
  if ("kind" in outcome) {
    return outcome;
  }
  if (outcome.status === 422 && isRefusedBody(outcome.body)) {
    return { kind: "refused", body: outcome.body };
  }
  if (outcome.status === 501 && isNotEvaluatedBody(outcome.body)) {
    return { kind: "not-evaluated", body: outcome.body };
  }
  return commonFailure(outcome) ?? httpError(outcome.status);
}
