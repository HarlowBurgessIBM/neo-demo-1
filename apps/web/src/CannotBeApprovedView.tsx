import { useEffect, useRef } from "react";
import type {
  CannotBeApprovedResponse,
  EmployeeResult,
  Finding,
  OffDutyFinding,
  OffDutyPeriod,
  QualificationFinding,
} from "./contract";

interface CannotBeApprovedViewProps {
  result: CannotBeApprovedResponse;
  onChooseAgain: () => void;
}

/** The API's own figures, as sent. The web app never works a duration out from the start and end times. */
function formatDuration(period: { hours: number; minutes: number }): string {
  return period.minutes > 0 ? `${period.hours} h ${period.minutes} m` : `${period.hours} h`;
}

/** The employee's name, or a description of who they are in the swap when the roster has none. */
function employeeLabel(employee: Pick<EmployeeResult, "name" | "party">): string {
  if (employee.name !== null) {
    return employee.name;
  }
  return employee.party === "give-shift-owner" ? "You" : "The other employee";
}

function changedText(finding: { changedBySwap: boolean }): string {
  return finding.changedBySwap ? "changed by this swap" : "not changed by this swap";
}

function describeOffDutyFinding(finding: OffDutyFinding): string {
  const shifts = `between ${finding.fromShiftId} and ${finding.toShiftId}`;
  const overlap = finding.overlap === true ? `, where ${finding.toShiftId} starts before ${finding.fromShiftId} ends` : "";
  return `off duty ${formatDuration(finding)} ${shifts}${overlap}, under the ${finding.minimumHours} h minimum`;
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
    case "3.3":
      return { reference: "§ 3.3", detail: describeQualificationFinding(finding) };
    default:
      return { reference: "§ ?", detail: describeUnrecognisedFinding(finding) };
  }
}

function describeOffDutyPeriod(period: OffDutyPeriod | null, direction: "before" | "after", shiftId: string): string {
  return period === null
    ? `No shift ${direction} ${shiftId} in the export.`
    : `Off duty ${direction} ${shiftId}: ${formatDuration(period)}.`;
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
        <div key={index}>
          <h3>{employeeLabel(employee)}</h3>
          <ul>
            <li>
              Gave {employee.gaveShiftId}, took {employee.tookShiftId}.
            </li>
            <li>{describeOffDutyPeriod(employee.offDutyBefore, "before", employee.tookShiftId)}</li>
            <li>{describeOffDutyPeriod(employee.offDutyAfter, "after", employee.tookShiftId)}</li>
            {employee.findings.length === 0 ? <li>No failures.</li> : null}
          </ul>
        </div>
      ))}
      <button type="button" onClick={onChooseAgain}>
        Choose again
      </button>
    </section>
  );
}
