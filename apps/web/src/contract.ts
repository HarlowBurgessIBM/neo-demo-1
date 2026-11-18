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
  // `index` is the 0-based position in the owner's qualification list. `party` is never a name or number.
  | {
      code: "invalid-export-field";
      field: "operators.qualifications";
      party: CannotDetermineParty;
      index: number;
      problem: "missing" | "malformed";
    }
  | {
      code: "invalid-export-field";
      field: "operators.qualifications.unit" | "operators.qualifications.role" | "operators.qualifications.validThrough";
      party: CannotDetermineParty;
      index: number;
      problem: "missing" | "malformed";
    }
  | {
      code: "invalid-export-field";
      field: "shifts.unit" | "shifts.role";
      party: CannotDetermineParty;
      shiftId: string;
      problem: "missing" | "malformed";
    }
  | {
      code: "invalid-export-field";
      field: "shifts.end";
      party: CannotDetermineParty;
      shiftId: string;
      problem: "not-after-start";
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

/**
 * A gap between two consecutive shifts, as the API measured it. `hours` and `minutes` are the
 * elapsed off-duty time; the web app shows them as sent and never works them out from `from`/`to`.
 */
export interface OffDutyPeriod {
  fromShiftId: string;
  toShiftId: string;
  from: string;
  to: string;
  hours: number;
  minutes: number;
}

/** A § 3.1 finding: an off-duty period under the minimum. `overlap` is present only when the shifts overlap. */
export interface OffDutyFinding extends OffDutyPeriod {
  rule: "3.1";
  code: "off-duty-under-minimum";
  changedBySwap: boolean;
  minimumHours: 11;
  overlap?: true;
}

/** A § 3.3 finding: the employee is not qualified for the unit and role on the shift's start date. */
export interface QualificationFinding {
  rule: "3.3";
  code: "qualification-expired" | "no-qualification-for-unit-and-role";
  changedBySwap: boolean;
  shiftId: string;
  unit: string;
  role: string;
  shiftStartDate: string;
  validThrough: string | null;
}

/**
 * One run of seven consecutive site-local dates, as the API measured it. `from` and `to` are
 * inclusive dates; `hours` and `minutes` are the scheduled time, shown as sent.
 */
export interface SevenDayWindow {
  from: string;
  to: string;
  hours: number;
  minutes: number;
  changedBySwap: boolean;
}

/** A § 3.2 finding: a seven-day window over the maximum. */
export interface SevenDayHoursFinding {
  rule: "3.2";
  code: "seven-day-hours-over-maximum";
  changedBySwap: boolean;
  maximumHours: 72;
  from: string;
  to: string;
  hours: number;
  minutes: number;
}

export type Finding = OffDutyFinding | SevenDayHoursFinding | QualificationFinding;

/** One employee's part of a cannot-be-approved result. "You" is always the give party. */
export interface EmployeeResult {
  party: CannotDetermineParty;
  /** Null when the roster has no name for the employee. */
  name: string | null;
  gaveShiftId: string;
  tookShiftId: string;
  /** Null when no neighbouring shift is in the export's coverage. */
  offDutyBefore: OffDutyPeriod | null;
  offDutyAfter: OffDutyPeriod | null;
  /** Every seven-day window in coverage; empty when coverage is shorter than seven dates. */
  windows: SevenDayWindow[];
  findings: Finding[];
}

/** 200. The swap fails § 3.1, § 3.2 or § 3.3 and cannot be approved. `outcome` marks a swap check answer. */
export interface CannotBeApprovedResponse {
  outcome: "cannot-be-approved";
  exportedAt: string | null;
  exportedAtUtcMinute: string | null;
  exportedAtSiteLocal: string | null;
  siteTimeZone: string | null;
  guidance: string;
  employees: EmployeeResult[];
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
