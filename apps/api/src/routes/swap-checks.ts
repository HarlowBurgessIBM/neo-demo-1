import { assessDeterminability, type CannotDetermineReason } from "@shiftswap/rules";
import type { FastifyInstance, FastifyReply } from "fastify";
import { callerOf, requireOperator, rosterOf } from "../identity";
import { exportStamp, refusalShifts, type ExportStamp, type RosterSource } from "../roster";

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

/**
 * The roster cannot support an answer to this swap. It is an outcome, not a refusal: the request
 * was valid. Carries the export stamp and the reasons only, no findings and no employee data.
 */
export interface CannotDetermineBody extends ExportStamp {
  outcome: "cannot-determine";
  reasons: CannotDetermineReason[];
}

export interface GiveShiftNotYours {
  kind: "forbidden";
  code: "give-shift-not-yours";
}

function isOutsidePilot(unit: unknown): unit is string {
  // A unit that is not a string is not refused here: it falls through to the later checks.
  return typeof unit === "string" && !PILOT_UNITS.some((pilotUnit) => pilotUnit === unit);
}

/**
 * Seam for swap evaluation. Picks that pass the refusal checks and the determinability gate still
 * get the interim 501 `not-evaluated`, never a result or an `outcome`. Later tasks (#6 §3.1/§3.3,
 * #7 §3.2, #8 §4.2) replace it and add the give and take shifts to this signature.
 */
function evaluateSwap(reply: FastifyReply): FastifyReply {
  const body: NotEvaluated = { kind: "not-evaluated" };
  return reply.code(501).send(body);
}

/**
 * Registers POST /api/swap-checks. The roster is the one the identity hook read for this request.
 * `now` is the clock, in epoch milliseconds, read once per request.
 */
export function registerSwapChecksRoute(
  app: FastifyInstance,
  source: RosterSource,
  now: () => number,
): void {
  app.post<{ Body: SwapCheckBody }>(
    "/api/swap-checks",
    {
      // Identity runs before body validation.
      onRequest: requireOperator(source),
      schema: {
        body: {
          type: "object",
          // Fastify's default Ajv (`removeAdditional`) strips unknown properties because of this keyword; they are not rejected.
          additionalProperties: false,
          required: ["giveShiftId", "takeShiftId"],
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
      const raw = rosterOf(request);
      const shiftsById = refusalShifts(raw);

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

      // A take shift is found by its id alone: a missing or non-string owner is not "unknown".
      const take = shiftsById.get(takeShiftId);
      if (take === undefined) {
        return refuse([{ code: "unknown-shift", shiftId: takeShiftId }]);
      }
      if (take.employeeNumber === caller.employeeNumber) {
        return refuse([{ code: "take-shift-is-own", shiftId: takeShiftId }]);
      }

      const outsidePilot: RefusalReason[] = [];
      for (const shift of [give, take]) {
        if (isOutsidePilot(shift.unit)) {
          outsidePilot.push({ code: "outside-pilot-units", shiftId: shift.shiftId, unit: shift.unit });
        }
      }
      if (outsidePilot.length > 0) {
        return refuse(outsidePilot);
      }

      // Reasons are never logged: they can quote roster values.
      const determinability = assessDeterminability(raw, { now: now(), giveShiftId, takeShiftId });
      if (!determinability.determinable) {
        const body: CannotDetermineBody = {
          outcome: "cannot-determine",
          ...exportStamp(raw),
          reasons: determinability.reasons,
        };
        return reply.code(200).send(body);
      }

      return evaluateSwap(reply);
    },
  );
}
