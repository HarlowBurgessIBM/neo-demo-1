import { useEffect, useRef } from "react";
import type { OffDutyReviewTrigger, ReviewRequiredResponse, ReviewTrigger, SevenDayReviewTrigger } from "./contract";
import { EmployeeSchedule, changedText, formatDuration } from "./EmployeeSchedule";

interface ReviewRequiredViewProps {
  result: ReviewRequiredResponse;
  onChooseAgain: () => void;
}

function describeOffDutyTrigger(trigger: OffDutyReviewTrigger): string {
  const shifts = `between ${trigger.fromShiftId} and ${trigger.toShiftId}`;
  const overlap = trigger.overlap === true ? `, where ${trigger.toShiftId} starts before ${trigger.fromShiftId} ends` : "";
  return `off duty ${formatDuration(trigger)} from ${trigger.from} to ${trigger.to} ${shifts}${overlap}, under the ${trigger.thresholdHours} h review threshold`;
}

function describeSevenDayTrigger(trigger: SevenDayReviewTrigger): string {
  return `${formatDuration(trigger)} in the seven days ${trigger.from} to ${trigger.to}, over the ${trigger.thresholdHours} h review threshold`;
}

/** A trigger this build does not know. The type system says it cannot happen; the wire can. */
function describeUnrecognisedTrigger(trigger: never): string {
  const shape: unknown = trigger;
  const rule = typeof shape === "object" && shape !== null && "rule" in shape ? String(shape.rule) : "unknown";
  return `a review trigger this page cannot describe (rule ${rule})`;
}

function describeTrigger(trigger: ReviewTrigger): { reference: string; detail: string } {
  switch (trigger.rule) {
    case "4.2(a)":
      return { reference: "§ 4.2(a)", detail: describeOffDutyTrigger(trigger) };
    case "4.2(b)":
      return { reference: "§ 4.2(b)", detail: describeSevenDayTrigger(trigger) };
    default:
      return { reference: "§ 4.2(?)", detail: describeUnrecognisedTrigger(trigger) };
  }
}

/**
 * A swap that meets § 3 but triggers § 4.2 (200, outcome "review-required"). It lists every trigger
 * for both employees. It offers no way to send the swap for review or approve it, and it does not
 * name the reviewing units. The figures are displayed as the API sent them.
 */
export function ReviewRequiredView({ result, onChooseAgain }: ReviewRequiredViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The view replaces the form the user just submitted, so move focus to it (WCAG 2.4.3).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="review-required-heading">
      <h2 id="review-required-heading" ref={headingRef} tabIndex={-1}>
        Review required
      </h2>
      <p>{result.guidance}</p>
      <h3>Determining rule</h3>
      <p>§ 4.2: the swap meets § 3 but triggers at least one condition in § 4.2.</p>
      {result.employees.map((employee, index) => (
        <EmployeeSchedule key={index} employee={employee} note={employee.findings.length === 0 ? "No failures." : undefined}>
          <h4>Review triggers</h4>
          {employee.triggers.length === 0 ? (
            <p>No triggers.</p>
          ) : (
            <ul>
              {employee.triggers.map((trigger, triggerIndex) => {
                const { reference, detail } = describeTrigger(trigger);
                return (
                  <li key={triggerIndex}>
                    {reference} — {detail}; {changedText(trigger)}.
                  </li>
                );
              })}
            </ul>
          )}
        </EmployeeSchedule>
      ))}
      <button type="button" onClick={onChooseAgain}>
        Choose again
      </button>
    </section>
  );
}
