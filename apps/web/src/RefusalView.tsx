import { useEffect, useRef } from "react";
import type { RefusalReason, RefusedResponse } from "./contract";

interface RefusalViewProps {
  refusal: RefusedResponse;
  onChooseAgain: () => void;
}

const GENERIC_REFUSAL = "This pick was refused.";

/** A reason code this build does not know. The type system says it cannot happen; the wire can. */
function describeUnrecognisedReason(reason: never): string {
  const shape: unknown = reason;
  if (typeof shape === "object" && shape !== null && "shiftId" in shape && typeof shape.shiftId === "string") {
    return `${shape.shiftId} was refused.`;
  }
  return GENERIC_REFUSAL;
}

function describeReason(reason: RefusalReason): string {
  switch (reason.code) {
    case "outside-pilot-units":
      return `${reason.shiftId} is in ${reason.unit}, outside the pilot units (CDU and HCU only).`;
    case "unknown-shift":
      return `${reason.shiftId} is not on the roster.`;
    case "take-shift-is-own":
      return `${reason.shiftId} is your own shift.`;
    default:
      return describeUnrecognisedReason(reason);
  }
}

/** A swap the API refused before evaluation (422). It shows reasons only, never an outcome. */
export function RefusalView({ refusal, onChooseAgain }: RefusalViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The view replaces the form the user just submitted, so move focus to it (WCAG 2.4.3).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="refusal-heading">
      <h2 id="refusal-heading" ref={headingRef} tabIndex={-1}>
        Swap refused
      </h2>
      <ul>
        {refusal.reasons.length === 0 ? (
          <li>{GENERIC_REFUSAL}</li>
        ) : (
          refusal.reasons.map((reason, index) => <li key={index}>{describeReason(reason)}</li>)
        )}
      </ul>
      <button type="button" onClick={onChooseAgain}>
        Choose again
      </button>
    </section>
  );
}
