import { fileURLToPath } from "node:url";
import path from "node:path";

/** Absolute path to the repo-root sample roster, independent of the working directory. */
export const defaultRosterPath: string = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../data/roster.sample.json",
);

export interface Config {
  rosterPath: string;
  nodeEnv: string | undefined;
}

/** Reads configuration from an environment. Pure: touches neither the file system nor `process`. */
export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Config {
  return {
    rosterPath: env.SHIFTSWAP_ROSTER_PATH ?? defaultRosterPath,
    nodeEnv: env.NODE_ENV,
  };
}
