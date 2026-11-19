import type { FastifyInstance } from "fastify";
import { callerOf, requireOperator, rosterOf } from "../identity";
import {
  exportStamp,
  listedShifts,
  operatorNames,
  type ExportStamp,
  type RosterShift,
  type RosterSource,
} from "../roster";

/** A shift as shown to the caller. Deliberately carries no employee number. */
export interface Shift {
  shiftId: string;
  unit: string;
  role: string;
  start: string;
  end: string;
}

/**
 * Another operator's shift on offer: carries the owner's name, and still no employee number.
 * `ownerName` is null when the holder is not a roster operator.
 */
export interface TakeShift extends Shift {
  ownerName: string | null;
}

/** The four export stamp fields are all strings or all null, when the export time cannot be rendered. */
export interface ShiftsResponse extends ExportStamp {
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

/** Registers GET /api/shifts. The roster is the one the identity hook read for this request. */
export function registerShiftsRoute(app: FastifyInstance, source: RosterSource): void {
  app.get(
    "/api/shifts",
    { onRequest: requireOperator(source) },
    (request): ShiftsResponse => {
      const roster = rosterOf(request);
      const employeeNumber = callerOf(request)?.employeeNumber;
      const sorted = listedShifts(roster).sort(byStartThenId);
      const names = operatorNames(roster);
      const toTakeShift = (shift: RosterShift): TakeShift => ({
        ...toShift(shift),
        ownerName: names.get(shift.employeeNumber) ?? null,
      });
      return {
        ...exportStamp(roster),
        give: sorted.filter((shift) => shift.employeeNumber === employeeNumber).map(toShift),
        take: sorted.filter((shift) => shift.employeeNumber !== employeeNumber).map(toTakeShift),
      };
    },
  );
}