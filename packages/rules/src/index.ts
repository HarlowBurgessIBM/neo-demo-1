// The fatigue-policy rules engine: the determinability gate, site-time arithmetic, and the
// swap evaluation against § 3.1 (off-duty period) and § 3.3 (qualification).
// Source of the rules: docs/standards/fatigue-management-policy.md

/** Identifies the policy revision a decision was evaluated against. */
export const POLICY_REVISION = "VE-HSSE-STD-014 rev 3";

export { assessDeterminability } from "./determinability";
export type {
  CannotDetermineReason,
  Determinability,
  ExportField,
  Party,
  QualificationField,
  ShiftField,
} from "./determinability";
export { renderExportedAt } from "./exported-at";
export type { ExportedAtProblem, ExportedAtRendering } from "./exported-at";
export {
  addDays,
  elapsedMinutes,
  isLocalDate,
  isLocalWallTime,
  isValidTimeZone,
  parseUtcInstant,
  resolveLocalTime,
  siteLocalDate,
} from "./site-time";
export type { LocalTimeResolution } from "./site-time";
export { checkQualifications, EXCEPTION_PROCEDURE, evaluateSwap } from "./swap-evaluation";
export type {
  EmployeeEvaluation,
  Finding,
  OffDutyFinding,
  OffDutyPeriod,
  QualificationFinding,
  SwapEvaluation,
} from "./swap-evaluation";
