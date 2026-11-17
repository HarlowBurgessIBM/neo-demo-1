import type { RefusalReason, RefusedResponse } from "./contract";

interface RefusalViewProps {
  refusal: RefusedResponse;
  onChooseAgain: () => void;
}

function describeReason(reason: RefusalReason): string {
  switch (reason.code) {
    case "outside-pilot-units":
      return `${reason.shiftId} is in ${reason.unit}, outside the pilot units (CDU and HCU only).`;
    case "unknown-shift":
      return `${reason.shiftId} is not on the roster.`;
    case "take-shift-is-own":
      return `${reason.shiftId} is your own shift.`;
  }
}

/** A swap the API refused before evaluation (422). It shows reasons only, never an outcome. */
export function RefusalView({ refusal, onChooseAgain }: RefusalViewProps) {
  return (
    <section aria-labelledby="refusal-heading">
      <h2 id="refusal-heading">Swap refused</h2>
      <ul>
        {refusal.reasons.map((reason) => (
          <li key={`${reason.code}:${reason.shiftId}`}>{describeReason(reason)}</li>
        ))}
      </ul>
      <button type="button" onClick={onChooseAgain}>
        Choose again
      </button>
    </section>
  );
}
