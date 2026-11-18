import { assessDeterminability, evaluateSwap } from "@shiftswap/rules";
import type { FastifyInstance, FastifyReply } from "fastify";
import { callerOf, requireOperator, rosterOf } from "../identity";
import { exportStamp, refusalShifts, type RosterSource } from "../roster";
import { swapCheckAnswer, type CannotDetermineBody } from "../swap-result";

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

export interface GiveShiftNotYours {
  kind: "forbidden";
  code: "give-shift-not-yours";
}

function isOutsidePilot(unit: unknown): unit is string {
  // A unit that is not a string is not refused here: it falls through to the later checks.
  return typeof unit === "string" && !PILOT_UNITS.some((pilotUnit) => pilotUnit === unit);
}

/**
 * Seam for swap evaluation. Picks that pass the refusal checks and the determinability gate are
 * evaluated by `evaluate`, and the evaluation's outcome is mapped to a 200 body. The rules decide
 * the outcome; nothing is computed here. Nothing from the evaluation is logged.
 */
function evaluateAndReply(
  reply: FastifyReply,
  evaluate: typeof evaluateSwap,
  raw: unknown,
  pick: { giveShiftId: string; takeShiftId: string },
): FastifyReply {
  const answer = swapCheckAnswer(raw, evaluate(raw, pick));
  return reply.code(answer.status).send(answer.body);
}

/**
 * Registers POST /api/swap-checks. The roster is the one the identity hook read for this request.
 * `now` is the clock, in epoch milliseconds, read once per request. `evaluate` is the swap
 * evaluator; the app passes `evaluateSwap`, and tests may pass another.
 */
export function registerSwapChecksRoute(
  app: FastifyInstance,
  source: RosterSource,
  now: () => number,
  evaluate: typeof evaluateSwap = evaluateSwap,
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

      return evaluateAndReply(reply, evaluate, raw, { giveShiftId, takeShiftId });
    },
  );
}
