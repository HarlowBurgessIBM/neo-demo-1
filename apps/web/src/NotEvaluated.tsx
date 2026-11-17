interface NotEvaluatedProps {
  onChooseAgain: () => void;
}

/** The API passed the pilot-scope checks but cannot evaluate yet (501). No outcome is shown. */
export function NotEvaluated({ onChooseAgain }: NotEvaluatedProps) {
  return (
    <section aria-labelledby="not-evaluated-heading">
      <h2 id="not-evaluated-heading">Not evaluated</h2>
      <p>The pick passed the pilot-scope checks. Evaluation is not available yet.</p>
      <button type="button" onClick={onChooseAgain}>
        Choose again
      </button>
    </section>
  );
}
