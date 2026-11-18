import { parseUtcInstant } from "@shiftswap/rules";

/**
 * Resolves the API's clock (epoch milliseconds) from an environment.
 *
 * Unset `SHIFTSWAP_NOW` yields `systemNow`. A set value must be an ISO 8601 UTC instant, exactly
 * as `parseUtcInstant` accepts it (no trimming), and yields a clock fixed at that instant.
 * Anything else throws, so a malformed value stops the API at startup.
 */
export function resolveClock(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  systemNow: () => number = Date.now,
): () => number {
  const raw = env.SHIFTSWAP_NOW;
  if (raw === undefined) {
    return systemNow;
  }
  const fixedEpoch = parseUtcInstant(raw);
  if (fixedEpoch === undefined) {
    throw new Error(
      `SHIFTSWAP_NOW must be an ISO 8601 UTC instant such as 2027-03-07T14:00:00Z, got ${JSON.stringify(raw)}`,
    );
  }
  return () => fixedEpoch;
}
