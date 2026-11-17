// Hand-written copies of the HTTP API's JSON shapes. The web app depends on the API only over
// HTTP, so nothing here is imported from the server code. Keep these in step with the API by hand.

/** A shift as the API returns it. Roster times are site-local wall-clock strings. */
export interface Shift {
  shiftId: string;
  unit: string;
  role: string;
  start: string;
  end: string;
}

/**
 * A shift offered to take. Unlike a give entry, it carries the name of the person who holds it.
 * `ownerName` is null when the holder is not in the roster.
 */
export interface TakeShift extends Shift {
  ownerName: string | null;
}

export interface ShiftsResponse {
  exportedAt: string;
  exportedAtUtcMinute: string;
  exportedAtSiteLocal: string;
  siteTimeZone: string;
  give: Shift[];
  take: TakeShift[];
}

/** The body of a swap check request. */
export interface SwapPick {
  giveShiftId: string;
  takeShiftId: string;
}

export type RefusalReason =
  | { code: "unknown-shift"; shiftId: string }
  | { code: "take-shift-is-own"; shiftId: string }
  | { code: "outside-pilot-units"; shiftId: string; unit: string };

/** 422. The request was understood but cannot be evaluated. */
export interface RefusedResponse {
  kind: "refused";
  reasons: RefusalReason[];
}

/** 501. Evaluation is not wired in yet. */
export interface NotEvaluatedResponse {
  kind: "not-evaluated";
}

/** 403. The caller is known but not allowed. */
export interface ForbiddenResponse {
  kind: "forbidden";
  code: "give-shift-not-yours" | "role-not-permitted" | "not-a-roster-operator";
}

/** 401. No usable identity on the request. */
export interface UnauthenticatedResponse {
  kind: "unauthenticated";
}

/** A roster person the development-only user switcher can act as. */
export interface DevUser {
  employeeNumber: string;
  name: string;
  roles: string[];
}

export interface DevUsersResponse {
  users: DevUser[];
}

/** Who the development switcher is acting as. Sent as headers outside production only. */
export interface Identity {
  employeeNumber: string;
  roles: string[];
}
