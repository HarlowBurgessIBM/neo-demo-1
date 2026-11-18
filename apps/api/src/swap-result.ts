import { EXCEPTION_PROCEDURE, type EmployeeEvaluation } from "@shiftswap/rules";
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
