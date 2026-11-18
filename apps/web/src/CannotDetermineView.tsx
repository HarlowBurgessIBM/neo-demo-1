import { useEffect, useRef } from "react";
import type { CannotDetermineParty, CannotDetermineReason, CannotDetermineResponse } from "./contract";

interface CannotDetermineViewProps {
  result: CannotDetermineResponse;
  onChooseAgain: () => void;
}

const GENERIC_REASON = "The roster data has a problem this page cannot describe.";

/** A reason code this build does not know. The type system says it cannot happen; the wire can. */
function describeUnrecognisedReason(reason: never): string {
  const shape: unknown = reason;
  if (typeof shape !== "object" || shape === null) {
    return GENERIC_REASON;
  }
  const code = "code" in shape && typeof shape.code === "string" ? shape.code : null;
  const shiftId = "shiftId" in shape && typeof shape.shiftId === "string" ? shape.shiftId : null;
  if (code !== null && shiftId !== null) {
    return `Unrecognised reason "${code}" for ${shiftId}.`;
  }
  if (code !== null) {
    return `Unrecognised reason "${code}".`;
  }
  if (shiftId !== null) {
    return `${shiftId} could not be checked with the roster data available.`;
  }
  return GENERIC_REASON;
}

function whose(party: CannotDetermineParty): string {
  return party === "give-shift-owner" ? "your" : "the other employee's";
}

function describeExportProblem(
  field: string,
  problem: Exclude<
    Extract<CannotDetermineReason, { code: "invalid-export-field" }>,
    { party: CannotDetermineParty }
  >["problem"],
): string {
  switch (problem) {
    case "missing":
      return `The roster export has no ${field}.`;
    case "malformed":
      return `The ${field} in the roster export cannot be read.`;
    case "unknown-time-zone":
      return `The time zone in the roster export (${field}) is not one this system knows.`;
    case "from-after-to":
      return `The coverage period in the roster export (${field}) starts after it ends.`;
    default: {
      const unrecognised: never = problem;
      return `The ${field} in the roster export has an unrecognised problem "${String(unrecognised)}".`;
    }
  }
}

const QUALIFICATION_PART: Record<
  "operators.qualifications.unit" | "operators.qualifications.role" | "operators.qualifications.validThrough",
  string
> = {
  "operators.qualifications.unit": "unit",
  "operators.qualifications.role": "role",
  "operators.qualifications.validThrough": "valid-through date",
};

/** A qualification record or shift field the roster export is missing or has malformed. */
function describeEmployeeFieldProblem(
  reason: Extract<CannotDetermineReason, { code: "invalid-export-field"; party: CannotDetermineParty }>,
): string {
  const owner = whose(reason.party);
  if ("shiftId" in reason) {
    switch (reason.field) {
      case "shifts.unit":
        return `In the roster export, ${owner} shift ${reason.shiftId} has a ${reason.problem} unit.`;
      case "shifts.role":
        return `In the roster export, ${owner} shift ${reason.shiftId} has a ${reason.problem} role.`;
      case "shifts.end":
        return `In the roster export, ${owner} shift ${reason.shiftId} ends at or before it starts.`;
      default: {
        const unrecognised: never = reason;
        return describeUnrecognisedReason(unrecognised);
      }
    }
  }
  // `index` counts from 0 on the wire; people count records from 1.
  const record = `${owner} qualification record ${reason.index + 1}`;
  if (reason.field === "operators.qualifications") {
    return `In the roster export, ${record} is ${reason.problem}.`;
  }
  return `In the roster export, ${record} has a ${reason.problem} ${QUALIFICATION_PART[reason.field]}.`;
}

function describeReason(reason: CannotDetermineReason): string {
  switch (reason.code) {
    case "invalid-now":
      return "The current time used for the check is not valid.";
    case "invalid-export-field":
      return "party" in reason ? describeEmployeeFieldProblem(reason) : describeExportProblem(reason.field, reason.problem);
    case "coverage-mismatch":
      return `The roster export's ${reason.field} is ${reason.actual}, but ${reason.expected} was expected.`;
    case "now-before-export":
      return `The roster export time (${reason.exportedAt}) is later than the current time (${reason.now}).`;
    case "export-stale": {
      const age =
        reason.ageMinutes > 0 ? `${reason.ageHours} h ${reason.ageMinutes} min` : `${reason.ageHours} h`;
      return `The roster export is ${age} old, more than the ${reason.limitHours} h limit.`;
    }
    case "missing-shift":
      return `${reason.shiftId} is not in the roster export.`;
    case "owner-not-operator":
      return `${reason.shiftId} is ${whose(reason.party)} shift, but the roster export has no operator record for its owner.`;
    case "qualifications-missing":
      return reason.problem === "absent"
        ? `${reason.shiftId} is ${whose(reason.party)} shift, but the roster export has no qualifications record for its owner.`
        : `${reason.shiftId} is ${whose(reason.party)} shift, but the roster export lists no qualifications for its owner.`;
    case "shift-time-malformed":
      return `The ${reason.field} time of ${reason.shiftId} in the roster export is not in a form that can be read.`;
    case "shift-outside-horizon":
      return `${reason.shiftId} starts outside the range this export can check (${reason.horizonFrom} to ${reason.horizonTo}).`;
    case "nonexistent-local-time":
      return `The ${reason.field} time of ${reason.shiftId} (${reason.value}) falls in a clock change, at a time that does not occur at the site.`;
    case "ambiguous-local-time":
      return `The ${reason.field} time of ${reason.shiftId} (${reason.value}) falls in a clock change, at a time that occurs twice at the site.`;
    default:
      return describeUnrecognisedReason(reason);
  }
}

/**
 * A swap check the API could not decide (200, outcome "cannot-determine"). It shows reasons only,
 * never a result. The values in each reason are displayed as the API sent them.
 */
export function CannotDetermineView({ result, onChooseAgain }: CannotDetermineViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The view replaces the form the user just submitted, so move focus to it (WCAG 2.4.3).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="cannot-determine-heading">
      <h2 id="cannot-determine-heading" ref={headingRef} tabIndex={-1}>
        Cannot determine
      </h2>
      <p>This swap could not be checked with the roster data available, so there is no result.</p>
      <ul>
        {result.reasons.length === 0 ? (
          <li>{GENERIC_REASON}</li>
        ) : (
          result.reasons.map((reason, index) => <li key={index}>{describeReason(reason)}</li>)
        )}
      </ul>
      <button type="button" onClick={onChooseAgain}>
        Choose again
      </button>
    </section>
  );
}
