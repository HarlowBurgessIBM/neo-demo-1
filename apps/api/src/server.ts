import { buildApp } from "./app";
import { resolveClock } from "./clock";
import { loadConfig } from "./config";

let app: ReturnType<typeof buildApp>;
try {
  const clock = resolveClock(process.env);
  const config = loadConfig(process.env);
  app = buildApp({
    fastify: { logger: true },
    rosterPath: config.rosterPath,
    nodeEnv: config.nodeEnv,
    now: clock,
  });
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
const port = Number(process.env.PORT ?? 3000);

try {
  await app.listen({ port, host: "127.0.0.1" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
