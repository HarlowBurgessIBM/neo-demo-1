import { buildApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig(process.env);
const app = buildApp({
  fastify: { logger: true },
  rosterPath: config.rosterPath,
  nodeEnv: config.nodeEnv,
});
const port = Number(process.env.PORT ?? 3000);

try {
  await app.listen({ port, host: "127.0.0.1" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
