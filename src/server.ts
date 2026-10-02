import express from "express";
import { MemoryLayer } from "./memory/index.js";
import { apiRouter } from "./api/index.js";
import { loadServerConfig } from "./config.js";
import type { MemoryLayerConfig } from "./types.js";

export function createServer(config: MemoryLayerConfig = {}) {
  const app = express();
  const ml = new MemoryLayer(config);

  app.use(express.json());
  app.use("/api", apiRouter(ml));

  return { app, ml };
}

export function startServer(config: MemoryLayerConfig = {}) {
  const { port, host } = loadServerConfig();
  const { app, ml } = createServer(config);

  const server = app.listen(port, host, () => {
    console.log(`Memory Layer running at http://${host}:${port}`);
  });

  return { server, app, ml };
}
