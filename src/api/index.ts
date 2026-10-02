import { Router } from "express";
import type { MemoryLayer } from "../memory/index.js";
import { memoriesRouter } from "./memories.js";

export function apiRouter(ml: MemoryLayer): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  router.use("/memories", memoriesRouter(ml));

  return router;
}
