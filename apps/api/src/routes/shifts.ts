import type { FastifyInstance } from "fastify";
import { renderExportedAt } from "@shiftswap/rules";
import { callerOf, requireOperator } from "../identity";
import type { Roster, RosterShift } from "../roster";

/** A shift as shown to the caller. Deliberately carries no employee number. */
export interface Shift {
  shiftId: string;
  unit: string;
  role: string;
  start: string;
  end: string;
}

/** Another operator's shift on offer: carries the owner's name, and still no employee number. */
export interface TakeShift extends Shift {
  ownerName: string;
}

export interface ShiftsResponse {
  exportedAt: string;
  exportedAtUtcMinute: string;
  exportedAtSiteLocal: string;
  siteTimeZone: string;
  give: Shift[];
  take: TakeShift[];
}

function toShift(shift: RosterShift): Shift {
  return {
    shiftId: shift.shiftId,
    unit: shift.unit,
    role: shift.role,
    start: shift.start,
    end: shift.end,
  };
}

// `start` is a fixed-format site-local string, so a string compare orders it; no time arithmetic.
function byStartThenId(a: RosterShift, b: RosterShift): number {
  if (a.start !== b.start) {
    return a.start < b.start ? -1 : 1;
  }
  if (a.shiftId === b.shiftId) {
    return 0;
  }
  return a.shiftId < b.shiftId ? -1 : 1;
}

/**
 * Registers GET /api/shifts. Throws if the roster `exportedAt` or site time zone cannot be
 * rendered, or if a shift's employee number is not an operator's. Messages name no values.
 */
export function registerShiftsRoute(app: FastifyInstance, roster: Roster): void {
  const rendering = renderExportedAt(roster.exportedAt, roster.site.timeZone);
  if (!rendering.ok) {
    throw new Error(`roster export time cannot be rendered: ${rendering.problem}`);
  }
  const operatorNames = new Map(roster.operators.map((operator) => [operator.employeeNumber, operator.name]));
  roster.shifts.forEach((shift, index) => {
    if (!operatorNames.has(shift.employeeNumber)) {
      throw new Error(`roster: shifts[${index}].employeeNumber is not the employee number of an operator`);
    }
  });
  const sorted = [...roster.shifts].sort(byStartThenId);

  function toTakeShift(shift: RosterShift): TakeShift {
    const ownerName = operatorNames.get(shift.employeeNumber);
    if (ownerName === undefined) {
      // Unreachable: every shift owner was checked above.
      throw new Error("roster: a shift owner is not an operator");
    }
    return { ...toShift(shift), ownerName };
  }

  app.get(
    "/api/shifts",
    { onRequest: requireOperator(roster) },
    (request): ShiftsResponse => {
      const caller = callerOf(request);
      const employeeNumber = caller?.employeeNumber;
      return {
        exportedAt: roster.exportedAt,
        exportedAtUtcMinute: rendering.utcMinute,
        exportedAtSiteLocal: rendering.siteLocal,
        siteTimeZone: roster.site.timeZone,
        give: sorted.filter((shift) => shift.employeeNumber === employeeNumber).map(toShift),
        take: sorted.filter((shift) => shift.employeeNumber !== employeeNumber).map(toTakeShift),
      };
    },
  );
}
