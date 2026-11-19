import { useEffect, useRef } from "react";
import type { ApprovedWithoutReviewResponse } from "./contract";
import { EmployeeSchedule } from "./EmployeeSchedule";

interface ApprovedWithoutReviewViewProps {
  result: ApprovedWithoutReviewResponse;
  onChooseAgain: () => void;
}

/**
 * A swap that meets § 3 and triggers nothing in § 4.2 (200, outcome "approved-without-review"). This
 * is a classification, not an approval: the view offers no way to approve, send or store the swap.
 * The figures are displayed as the API sent them.
 */
export function ApprovedWithoutReviewView({ result, onChooseAgain }: ApprovedWithoutReviewViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The view replaces the form the user just submitted, so move focus to it (WCAG 2.4.3).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="approved-without-review-heading">
      <h2 id="approved-without-review-heading" ref={headingRef} tabIndex={-1}>
        Approved without review
      </h2>
      <p>{result.guidance}</p>
      <h3>Determining rule</h3>
      <p>§ 4.3: the swap meets § 3 and triggers neither condition in § 4.2.</p>
      {result.employees.map((employee, index) => (
        <EmployeeSchedule key={index} employee={employee} note="No failures and no triggers." />
      ))}
      <button type="button" onClick={onChooseAgain}>
        Choose again
      </button>
    </section>
  );
}
