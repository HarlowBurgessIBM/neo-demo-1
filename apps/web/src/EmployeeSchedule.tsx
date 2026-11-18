import type { ReactNode } from "react";
import type { EmployeeResult, OffDutyPeriod } from "./contract";

/** The API's own figures, as sent. The web app never works a duration out from the start and end times. */
export function formatDuration(period: { hours: number; minutes: number }): string {
  return period.minutes > 0 ? `${period.hours} h ${period.minutes} m` : `${period.hours} h`;
}

/** The employee's name, or a description of who they are in the swap when the roster has none. */
export function employeeLabel(employee: Pick<EmployeeResult, "name" | "party">): string {
  if (employee.name !== null) {
    return employee.name;
  }
  return employee.party === "give-shift-owner" ? "You" : "The other employee";
}

/** Whether the swap changed the period, window, finding or trigger being described. */
export function changedText(item: { changedBySwap: boolean }): string {
  return item.changedBySwap ? "changed by this swap" : "not changed by this swap";
}

function describeOffDutyPeriod(period: OffDutyPeriod | null, direction: "before" | "after", shiftId: string): string {
  return period === null
    ? `No shift ${direction} ${shiftId} in the export.`
    : `Off duty ${direction} ${shiftId}: ${formatDuration(period)}.`;
}

interface EmployeeScheduleProps {
  employee: EmployeeResult;
  /** An extra line at the end of the employee's list, for example "No failures." */
  note?: string | undefined;
  /** Shown after the window table, inside the employee's block. */
  children?: ReactNode;
}

/**
 * One employee's part of a swap check result: the shifts they gave and took, the off-duty periods
 * either side, and every seven-day window. The figures are shown as the API sent them.
 */
export function EmployeeSchedule({ employee, note, children }: EmployeeScheduleProps) {
  return (
    <div>
      <h3>{employeeLabel(employee)}</h3>
      <ul>
        <li>
          Gave {employee.gaveShiftId}, took {employee.tookShiftId}.
        </li>
        <li>{describeOffDutyPeriod(employee.offDutyBefore, "before", employee.tookShiftId)}</li>
        <li>{describeOffDutyPeriod(employee.offDutyAfter, "after", employee.tookShiftId)}</li>
        {note === undefined ? null : <li>{note}</li>}
      </ul>
      {employee.windows.length === 0 ? null : (
        <table>
          <caption>{employeeLabel(employee)}: hours in each seven-day window (§ 3.2, at most 72 h)</caption>
          <thead>
            <tr>
              <th scope="col">Dates</th>
              <th scope="col">Hours</th>
              <th scope="col">Changed by the swap</th>
            </tr>
          </thead>
          <tbody>
            {employee.windows.map((window) => (
              <tr key={window.from}>
                <td>
                  {window.from} to {window.to}
                </td>
                <td>{formatDuration(window)}</td>
                <td>{window.changedBySwap ? "Changed" : "Not changed"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {children}
    </div>
  );
}
