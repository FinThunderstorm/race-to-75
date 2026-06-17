import Fastify from "fastify";

import { config } from "./config.js";

const app = Fastify({ logger: true });

app.get("/ping", async () => {
  return "pong";
});

app.listen({ port: config.port, host: config.host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
