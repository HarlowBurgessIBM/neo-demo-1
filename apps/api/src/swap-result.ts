import {
  EXCEPTION_PROCEDURE,
  type CannotDetermineReason,
  type EmployeeEvaluation,
  type SwapEvaluation,
} from "@shiftswap/rules";
import { exportStamp, type ExportStamp } from "./roster";

/** Fixed guidance for a swap that fails § 3: it cannot be approved, and the way out is separate. */
export const GUIDANCE = `This swap does not meet VE-HSSE-STD-014 § 3 and cannot be approved (§ 4.4). Exceptions to § 3 are granted only through the fatigue exception procedure, ${EXCEPTION_PROCEDURE}, which is separate from the swap process.`;

/**
 * The swap fails §§ 3.1–3.3 for at least one employee. It is an outcome, not a refusal.
 * `employees` is the rules output as produced: names and findings, never an employee number.
 */
export interface CannotBeApprovedBody extends ExportStamp {
  outcome: "cannot-be-approved";
  guidance: string;
  employees: [EmployeeEvaluation, EmployeeEvaluation];
}

/** The 200 body, with keys in wire order: outcome, export stamp, guidance, employees. */
export function cannotBeApprovedBody(
  raw: unknown,
  employees: [EmployeeEvaluation, EmployeeEvaluation],
): CannotBeApprovedBody {
  return {
    outcome: "cannot-be-approved",
    ...exportStamp(raw),
    guidance: GUIDANCE,
    employees,
  };
}

/** Fixed guidance for a swap that meets § 3 and triggers neither § 4.2 condition. A check, not an approval. */
export const APPROVED_WITHOUT_REVIEW_GUIDANCE =
  "This swap meets VE-HSSE-STD-014 § 3 and triggers neither condition in § 4.2, so under § 4.3 it may be approved without supervisor review. This is a check only: nothing has been approved, stored or sent.";

/** Fixed guidance for a swap that meets § 3 but triggers § 4.2. A check, not a submission. */
export const REVIEW_REQUIRED_GUIDANCE =
  "This swap meets VE-HSSE-STD-014 § 3, but it triggers § 4.2, so it needs review and approval by the shift supervisor of each unit affected. This is a check only: nothing has been sent for review, stored or approved.";

/**
 * The swap meets § 3 and triggers neither § 4.2 condition. A classification, not an approval.
 * `employees` is the rules output as produced: never an employee number.
 */
export interface ApprovedWithoutReviewBody extends ExportStamp {
  outcome: "approved-without-review";
  guidance: string;
  employees: [EmployeeEvaluation, EmployeeEvaluation];
}

/**
 * The swap meets § 3 and triggers § 4.2 for at least one employee. A classification, not a
 * submission. `employees` is the rules output as produced: never an employee number.
 */
export interface ReviewRequiredBody extends ExportStamp {
  outcome: "review-required";
  guidance: string;
  employees: [EmployeeEvaluation, EmployeeEvaluation];
}

/** The 200 body, with keys in wire order: outcome, export stamp, guidance, employees. */
export function approvedWithoutReviewBody(
  raw: unknown,
  employees: [EmployeeEvaluation, EmployeeEvaluation],
): ApprovedWithoutReviewBody {
  return {
    outcome: "approved-without-review",
    ...exportStamp(raw),
    guidance: APPROVED_WITHOUT_REVIEW_GUIDANCE,
    employees,
  };
}

/** The 200 body, with keys in wire order: outcome, export stamp, guidance, employees. */
export function reviewRequiredBody(
  raw: unknown,
  employees: [EmployeeEvaluation, EmployeeEvaluation],
): ReviewRequiredBody {
  return {
    outcome: "review-required",
    ...exportStamp(raw),
    guidance: REVIEW_REQUIRED_GUIDANCE,
    employees,
  };
}

/**
 * The roster cannot support an answer to this swap. It is an outcome, not a refusal: the request
 * was valid. Carries the export stamp and the reasons only, no findings and no employee data.
 * `not-evaluable` is the API's own reason for an evaluation that gave no result after the gate
 * passed; the rules gate never emits it.
 */
export interface CannotDetermineBody extends ExportStamp {
  outcome: "cannot-determine";
  reasons: (CannotDetermineReason | { code: "not-evaluable" })[];
}

/** The status and body of an answer to an evaluated swap. Every evaluation answer is a 200. */
export interface SwapCheckAnswer {
  status: 200;
  body: CannotBeApprovedBody | ApprovedWithoutReviewBody | ReviewRequiredBody | CannotDetermineBody;
}

/** Maps an evaluation to the status and body of the answer. Pure: the rules decide, this only maps. */
export function swapCheckAnswer(raw: unknown, evaluation: SwapEvaluation): SwapCheckAnswer {
  if (evaluation.kind === "not-evaluable") {
    // The determinability gate has passed, so this is not expected; the mapping stays total.
    // It is tested only through the injected `evaluate`, since the real rules never reach it.
    return {
      status: 200,
      body: { outcome: "cannot-determine", ...exportStamp(raw), reasons: [{ code: "not-evaluable" }] },
    };
  }
  switch (evaluation.outcome) {
    case "cannot-be-approved":
      return { status: 200, body: cannotBeApprovedBody(raw, evaluation.employees) };
    case "review-required":
      return { status: 200, body: reviewRequiredBody(raw, evaluation.employees) };
    case "approved-without-review":
      return { status: 200, body: approvedWithoutReviewBody(raw, evaluation.employees) };
  }
}
