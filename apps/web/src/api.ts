import type {
  ApprovedWithoutReviewResponse,
  CannotBeApprovedResponse,
  CannotDetermineResponse,
  DevUsersResponse,
  ForbiddenResponse,
  Identity,
  RefusedResponse,
  ReviewRequiredResponse,
  RosterUnavailableResponse,
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

export interface RosterUnavailable {
  kind: "roster-unavailable";
}

export type GetResult<T> = { kind: "ok"; data: T } | Unauthenticated | Forbidden | RosterUnavailable | ApiError;

export type SwapCheckResult =
  | { kind: "refused"; body: RefusedResponse }
  | { kind: "cannot-determine"; body: CannotDetermineResponse }
  | { kind: "cannot-be-approved"; body: CannotBeApprovedResponse }
  | { kind: "approved-without-review"; body: ApprovedWithoutReviewResponse }
  | { kind: "review-required"; body: ReviewRequiredResponse }
  | RosterUnavailable
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

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isCannotDetermineBody(body: unknown): body is CannotDetermineResponse {
  if (!isRecord(body) || body["outcome"] !== "cannot-determine") {
    return false;
  }
  const reasons = body["reasons"];
  // Each reason must be an object with a string code, so the view can always read `code`.
  return (
    Array.isArray(reasons) &&
    reasons.every((reason) => isRecord(reason) && typeof reason["code"] === "string") &&
    isStringOrNull(body["exportedAt"]) &&
    isStringOrNull(body["exportedAtUtcMinute"]) &&
    isStringOrNull(body["exportedAtSiteLocal"]) &&
    isStringOrNull(body["siteTimeZone"])
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** A whole number of hours, zero or more. This checks the shape of the figure; it does no arithmetic. */
function isWholeHours(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** A whole number of minutes from 0 to 59. This checks the shape of the figure; it does no arithmetic. */
function isWholeMinutes(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 59;
}

/**
 * The view shows `hours` and `minutes` as sent, so a period whose hours are not a whole non-negative
 * number, or whose minutes are not a whole number from 0 to 59, is rejected.
 */
function isOffDutyPeriod(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value["fromShiftId"]) &&
    isString(value["toShiftId"]) &&
    isString(value["from"]) &&
    isString(value["to"]) &&
    isWholeHours(value["hours"]) &&
    isWholeMinutes(value["minutes"])
  );
}

/** The view shows a window's `hours` and `minutes` as sent, so they get the same shape checks as an off-duty period. */
function isSevenDayWindow(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value["from"]) &&
    isString(value["to"]) &&
    isWholeHours(value["hours"]) &&
    isWholeMinutes(value["minutes"]) &&
    typeof value["changedBySwap"] === "boolean"
  );
}

function isOptionalOffDutyPeriod(value: unknown): boolean {
  return value === null || isOffDutyPeriod(value);
}

/**
 * Checks the fields the view reads from a finding, per rule. A finding with a rule this build does
 * not know is accepted when it has a string rule and code and a boolean `changedBySwap`, so the
 * view's fallback stays reachable.
 */
function isFinding(value: unknown): boolean {
  if (!isRecord(value) || !isString(value["rule"]) || !isString(value["code"])) {
    return false;
  }
  switch (value["rule"]) {
    case "3.1":
      return (
        value["code"] === "off-duty-under-minimum" &&
        typeof value["changedBySwap"] === "boolean" &&
        value["minimumHours"] === 11 &&
        (value["overlap"] === undefined || value["overlap"] === true) &&
        isOffDutyPeriod(value)
      );
    case "3.2":
      return (
        value["code"] === "seven-day-hours-over-maximum" &&
        typeof value["changedBySwap"] === "boolean" &&
        value["maximumHours"] === 72 &&
        isString(value["from"]) &&
        isString(value["to"]) &&
        isWholeHours(value["hours"]) &&
        isWholeMinutes(value["minutes"])
      );
    case "3.3":
      return (
        (value["code"] === "qualification-expired" || value["code"] === "no-qualification-for-unit-and-role") &&
        typeof value["changedBySwap"] === "boolean" &&
        isString(value["shiftId"]) &&
        isString(value["unit"]) &&
        isString(value["role"]) &&
        isString(value["shiftStartDate"]) &&
        isStringOrNull(value["validThrough"])
      );
    default:
      return typeof value["changedBySwap"] === "boolean";
  }
}

/**
 * Checks the fields the view reads from a § 4.2 trigger. The trigger contract is a closed set of two
 * rules, so a trigger with any other rule, or a known rule with the wrong code, threshold or figures,
 * is rejected.
 */
function isReviewTrigger(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  switch (value["rule"]) {
    case "4.2(a)":
      return (
        value["code"] === "off-duty-under-review-threshold" &&
        typeof value["changedBySwap"] === "boolean" &&
        value["thresholdHours"] === 12 &&
        (value["overlap"] === undefined || value["overlap"] === true) &&
        isOffDutyPeriod(value)
      );
    case "4.2(b)":
      return (
        value["code"] === "seven-day-hours-over-review-threshold" &&
        typeof value["changedBySwap"] === "boolean" &&
        value["thresholdHours"] === 60 &&
        isString(value["from"]) &&
        isString(value["to"]) &&
        isWholeHours(value["hours"]) &&
        isWholeMinutes(value["minutes"])
      );
    default:
      return false;
  }
}

function isEmployeeResult(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const findings = value["findings"];
  const triggers = value["triggers"];
  const windows = value["windows"];
  // The view reads these fields directly, so each must have the type it is read as.
  return (
    isString(value["party"]) &&
    isStringOrNull(value["name"]) &&
    isString(value["gaveShiftId"]) &&
    isString(value["tookShiftId"]) &&
    Array.isArray(windows) &&
    windows.every(isSevenDayWindow) &&
    Array.isArray(findings) &&
    findings.every(isFinding) &&
    Array.isArray(triggers) &&
    triggers.every(isReviewTrigger) &&
    isOptionalOffDutyPeriod(value["offDutyBefore"]) &&
    isOptionalOffDutyPeriod(value["offDutyAfter"])
  );
}

/** The shape the three outcomes that evaluate the swap share: a guidance text, the export stamp and two employees. */
function hasEvaluationShape(body: Record<string, unknown>): boolean {
  const employees = body["employees"];
  return (
    typeof body["guidance"] === "string" &&
    Array.isArray(employees) &&
    employees.length === 2 &&
    employees.every(isEmployeeResult) &&
    isStringOrNull(body["exportedAt"]) &&
    isStringOrNull(body["exportedAtUtcMinute"]) &&
    isStringOrNull(body["exportedAtSiteLocal"]) &&
    isStringOrNull(body["siteTimeZone"])
  );
}

/** The `findings` and `triggers` arrays of each employee. Call only after `hasEvaluationShape` has passed. */
function employeeLists(body: Record<string, unknown>, key: "findings" | "triggers"): unknown[][] {
  const employees = body["employees"];
  if (!Array.isArray(employees)) {
    return [];
  }
  return employees.flatMap((employee: unknown) => {
    const list = isRecord(employee) ? employee[key] : undefined;
    return Array.isArray(list) ? [list] : [];
  });
}

function isCannotBeApprovedBody(body: unknown): body is CannotBeApprovedResponse {
  return isRecord(body) && body["outcome"] === "cannot-be-approved" && hasEvaluationShape(body);
}

/** Meeting § 3 with no § 4.2 trigger: an `approved-without-review` body with a finding or a trigger contradicts itself. */
function isApprovedWithoutReviewBody(body: unknown): body is ApprovedWithoutReviewResponse {
  return (
    isRecord(body) &&
    body["outcome"] === "approved-without-review" &&
    hasEvaluationShape(body) &&
    employeeLists(body, "findings").every((list) => list.length === 0) &&
    employeeLists(body, "triggers").every((list) => list.length === 0)
  );
}

/** Meeting § 3 with at least one § 4.2 trigger: a `review-required` body with a finding or no trigger contradicts itself. */
function isReviewRequiredBody(body: unknown): body is ReviewRequiredResponse {
  return (
    isRecord(body) &&
    body["outcome"] === "review-required" &&
    hasEvaluationShape(body) &&
    employeeLists(body, "findings").every((list) => list.length === 0) &&
    employeeLists(body, "triggers").some((list) => list.length > 0)
  );
}

function isRosterUnavailableBody(body: unknown): body is RosterUnavailableResponse {
  return isRecord(body) && body["code"] === "roster-unavailable";
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
      // The caller's shape check decides what is validated. The cast trusts the rest of each
      // item to match the API's documented JSON.
      return { kind: "ok", data: outcome.body as T };
    }
    return { kind: "error", status: 200, message: "The server answered with an unexpected response." };
  }
  if (outcome.status === 503 && isRosterUnavailableBody(outcome.body)) {
    return { kind: "roster-unavailable" };
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
      // Each take entry must carry an owner name that is a string, or null when the holder is not
      // in the roster. A missing or differently typed ownerName rejects the response.
      return (
        Array.isArray(body["give"]) &&
        Array.isArray(take) &&
        take.every(
          (entry) =>
            isRecord(entry) &&
            "ownerName" in entry &&
            (typeof entry["ownerName"] === "string" || entry["ownerName"] === null),
        )
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
  if (outcome.status === 200 && isCannotDetermineBody(outcome.body)) {
    return { kind: "cannot-determine", body: outcome.body };
  }
  if (outcome.status === 200 && isCannotBeApprovedBody(outcome.body)) {
    return { kind: "cannot-be-approved", body: outcome.body };
  }
  if (outcome.status === 200 && isApprovedWithoutReviewBody(outcome.body)) {
    return { kind: "approved-without-review", body: outcome.body };
  }
  if (outcome.status === 200 && isReviewRequiredBody(outcome.body)) {
    return { kind: "review-required", body: outcome.body };
  }
  if (outcome.status === 503 && isRosterUnavailableBody(outcome.body)) {
    return { kind: "roster-unavailable" };
  }
  if (outcome.status === 422 && isRefusedBody(outcome.body)) {
    return { kind: "refused", body: outcome.body };
  }
  return commonFailure(outcome) ?? httpError(outcome.status);
}
