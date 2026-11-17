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

/** The four export stamp fields are all strings or all null, when the export time cannot be rendered. */
export interface ShiftsResponse {
  exportedAt: string | null;
  exportedAtUtcMinute: string | null;
  exportedAtSiteLocal: string | null;
  siteTimeZone: string | null;
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

/** Which side of the swap a reason is about. */
export type CannotDetermineParty = "give-shift-owner" | "take-shift-owner";

/** A roster export field a reason can name. */
export type CannotDetermineExportField =
  | "exportedAt"
  | "site.timeZone"
  | "coverage"
  | "coverage.from"
  | "coverage.to"
  | "shifts"
  | "operators";

/** Why a swap could not be checked. Every value is shown as the API sent it. */
export type CannotDetermineReason =
  | { code: "invalid-now" }
  | {
      code: "invalid-export-field";
      field: CannotDetermineExportField;
      problem: "missing" | "malformed" | "unknown-time-zone" | "from-after-to";
    }
  | { code: "coverage-mismatch"; field: "coverage.from" | "coverage.to"; actual: string; expected: string }
  | { code: "now-before-export"; exportedAt: string; now: string }
  // `ageMinutes` is the 0-59 remainder after whole hours, not the total age in minutes.
  | { code: "export-stale"; ageHours: number; ageMinutes: number; limitHours: 26 }
  | { code: "missing-shift"; shiftId: string }
  | { code: "owner-not-operator"; shiftId: string; party: CannotDetermineParty }
  | { code: "qualifications-missing"; shiftId: string; party: CannotDetermineParty; problem: "absent" | "empty" }
  | { code: "shift-time-malformed"; shiftId: string; field: "start" | "end" }
  | { code: "shift-outside-horizon"; shiftId: string; start: string; horizonFrom: string; horizonTo: string }
  | { code: "nonexistent-local-time"; shiftId: string; field: "start" | "end"; value: string }
  | { code: "ambiguous-local-time"; shiftId: string; field: "start" | "end"; value: string };

/** 200. The roster data cannot support a result. It has no `kind`: `outcome` marks a swap check answer. */
export interface CannotDetermineResponse {
  outcome: "cannot-determine";
  exportedAt: string | null;
  exportedAtUtcMinute: string | null;
  exportedAtSiteLocal: string | null;
  siteTimeZone: string | null;
  reasons: CannotDetermineReason[];
}

/** 503. The roster could not be read. The body carries no other detail. */
export interface RosterUnavailableResponse {
  code: "roster-unavailable";
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
