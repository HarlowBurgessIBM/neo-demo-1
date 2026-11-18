import { useEffect, useRef } from "react";
import type {
  CannotBeApprovedResponse,
  EmployeeResult,
  Finding,
  OffDutyFinding,
  QualificationFinding,
  SevenDayHoursFinding,
} from "./contract";
import { EmployeeSchedule, changedText, employeeLabel, formatDuration } from "./EmployeeSchedule";

interface CannotBeApprovedViewProps {
  result: CannotBeApprovedResponse;
  onChooseAgain: () => void;
}

function describeOffDutyFinding(finding: OffDutyFinding): string {
  const shifts = `between ${finding.fromShiftId} and ${finding.toShiftId}`;
  const overlap = finding.overlap === true ? `, where ${finding.toShiftId} starts before ${finding.fromShiftId} ends` : "";
  return `off duty ${formatDuration(finding)} ${shifts}${overlap}, under the ${finding.minimumHours} h minimum`;
}

function describeSevenDayHoursFinding(finding: SevenDayHoursFinding): string {
  return `${formatDuration(finding)} in the seven days ${finding.from} to ${finding.to}, over the ${finding.maximumHours} h maximum`;
}

function describeQualificationFinding(finding: QualificationFinding): string {
  const shift = `${finding.unit} ${finding.role}, shift ${finding.shiftId} starting ${finding.shiftStartDate}`;
  return finding.validThrough === null
    ? `${shift}, no qualification for ${finding.unit} ${finding.role}`
    : `${shift}, valid through ${finding.validThrough}`;
}

/** A finding this build does not know. The type system says it cannot happen; the wire can. */
function describeUnrecognisedFinding(finding: never): string {
  const shape: unknown = finding;
  const rule = typeof shape === "object" && shape !== null && "rule" in shape ? String(shape.rule) : "unknown";
  return `a failure this page cannot describe (rule ${rule})`;
}

function describeFinding(finding: Finding): { reference: string; detail: string } {
  switch (finding.rule) {
    case "3.1":
      return { reference: "§ 3.1", detail: describeOffDutyFinding(finding) };
    case "3.2":
      return { reference: "§ 3.2", detail: describeSevenDayHoursFinding(finding) };
    case "3.3":
      return { reference: "§ 3.3", detail: describeQualificationFinding(finding) };
    default:
      return { reference: "§ ?", detail: describeUnrecognisedFinding(finding) };
  }
}

function failuresOf(result: CannotBeApprovedResponse): { employee: EmployeeResult; finding: Finding }[] {
  return result.employees.flatMap((employee) => employee.findings.map((finding) => ({ employee, finding })));
}

/**
 * A swap that fails the fatigue standard (200, outcome "cannot-be-approved"). It lists every failure
 * for both employees and points to the exception procedure. It offers no way to approve or send the swap.
 * The figures are displayed as the API sent them.
 */
export function CannotBeApprovedView({ result, onChooseAgain }: CannotBeApprovedViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The view replaces the form the user just submitted, so move focus to it (WCAG 2.4.3).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const failures = failuresOf(result);

  return (
    <section aria-labelledby="cannot-be-approved-heading">
      <h2 id="cannot-be-approved-heading" ref={headingRef} tabIndex={-1}>
        Cannot be approved
      </h2>
      <p>{result.guidance}</p>
      <h3>Failures</h3>
      {failures.length === 0 ? (
        <p>The response listed no failures. Treat this swap as not approved.</p>
      ) : (
        <ul>
          {failures.map(({ employee, finding }, index) => {
            const { reference, detail } = describeFinding(finding);
            return (
              <li key={index}>
                {employeeLabel(employee)}: {reference} — {detail}; {changedText(finding)}.
              </li>
            );
          })}
        </ul>
      )}
      {result.employees.map((employee, index) => (
        <EmployeeSchedule
          key={index}
          employee={employee}
          note={employee.findings.length === 0 ? "No failures." : undefined}
        />
      ))}
      <button type="button" onClick={onChooseAgain}>
        Choose again
      </button>
    </section>
  );
}
