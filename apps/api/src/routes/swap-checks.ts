import type { FastifyInstance, FastifyReply } from "fastify";
import { callerOf, requireOperator } from "../identity";
import type { Roster, RosterShift } from "../roster";

/** The units in scope for the pilot. Any other unit is refused before evaluation. */
export const PILOT_UNITS = ["CDU", "HCU"] as const;

export interface SwapCheckBody {
  giveShiftId: string;
  takeShiftId: string;
}

// Reasons carry shift ids and units only. Never an employee number or name (NFR-PRIV-001).
export type RefusalReason =
  | { code: "unknown-shift"; shiftId: string }
  | { code: "take-shift-is-own"; shiftId: string }
  | { code: "outside-pilot-units"; shiftId: string; unit: string };

/** The request was understood but cannot be evaluated. Carries no outcome and no findings. */
export interface SwapCheckRefusal {
  kind: "refused";
  reasons: RefusalReason[];
}

/** Evaluation is not wired in yet. Carries no outcome and no findings. */
export interface NotEvaluated {
  kind: "not-evaluated";
}

export interface GiveShiftNotYours {
  kind: "forbidden";
  code: "give-shift-not-yours";
}

function isPilotUnit(unit: string): boolean {
  return PILOT_UNITS.some((pilotUnit) => pilotUnit === unit);
}

/**
 * Seam for swap evaluation. Later tasks plug the rules engine in here. Until then every swap
 * that passes the checks above is answered 501 `not-evaluated`, never a result or an `outcome`.
 * Later tasks add the give and take shifts to this signature when evaluation needs them.
 */
function evaluateSwap(reply: FastifyReply): FastifyReply {
  const body: NotEvaluated = { kind: "not-evaluated" };
  return reply.code(501).send(body);
}

/** Registers POST /api/swap-checks. */
export function registerSwapChecksRoute(app: FastifyInstance, roster: Roster): void {
  const shiftsById = new Map<string, RosterShift>(roster.shifts.map((shift) => [shift.shiftId, shift]));

  app.post<{ Body: SwapCheckBody }>(
    "/api/swap-checks",
    {
      // Identity runs before body validation.
      onRequest: requireOperator(roster),
      schema: {
        body: {
          type: "object",
          required: ["giveShiftId", "takeShiftId"],
          additionalProperties: false,
          properties: {
            giveShiftId: { type: "string", minLength: 1 },
            takeShiftId: { type: "string", minLength: 1 },
          },
        },
      },
    },
    (request, reply) => {
      const caller = callerOf(request);
      if (caller === undefined) {
        return reply.code(401).send({ kind: "unauthenticated" });
      }

      const { giveShiftId, takeShiftId } = request.body;

      // Unknown and not-yours get the same answer so shift ownership cannot be probed.
      const give = shiftsById.get(giveShiftId);
      if (give === undefined || give.employeeNumber !== caller.employeeNumber) {
        const body: GiveShiftNotYours = { kind: "forbidden", code: "give-shift-not-yours" };
        return reply.code(403).send(body);
      }

      const refuse = (reasons: RefusalReason[]): FastifyReply => {
        const body: SwapCheckRefusal = { kind: "refused", reasons };
        return reply.code(422).send(body);
      };

      const take = shiftsById.get(takeShiftId);
      if (take === undefined) {
        return refuse([{ code: "unknown-shift", shiftId: takeShiftId }]);
      }
      if (take.employeeNumber === caller.employeeNumber) {
        return refuse([{ code: "take-shift-is-own", shiftId: takeShiftId }]);
      }

      const outsidePilot: RefusalReason[] = [give, take]
        .filter((shift) => !isPilotUnit(shift.unit))
        .map((shift) => ({ code: "outside-pilot-units", shiftId: shift.shiftId, unit: shift.unit }));
      if (outsidePilot.length > 0) {
        return refuse(outsidePilot);
      }

      return evaluateSwap(reply);
    },
  );
}
