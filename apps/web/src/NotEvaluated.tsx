import { useEffect, useRef } from "react";

interface NotEvaluatedProps {
  onChooseAgain: () => void;
}

/** The API passed the pilot-scope checks and found no failure, but cannot approve yet (501). No outcome is shown. */
export function NotEvaluated({ onChooseAgain }: NotEvaluatedProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The view replaces the form the user just submitted, so move focus to it (WCAG 2.4.3).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="not-evaluated-heading">
      <h2 id="not-evaluated-heading" ref={headingRef} tabIndex={-1}>
        Not evaluated
      </h2>
      <p>The pick passed the pilot-scope checks. Evaluation is not available yet.</p>
      <button type="button" onClick={onChooseAgain}>
        Choose again
      </button>
    </section>
  );
}
