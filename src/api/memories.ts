import { Router, type Request, type Response } from "express";
import type { MemoryLayer } from "../memory/index.js";

function param(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}

export function memoriesRouter(ml: MemoryLayer): Router {
  const router = Router();

  // --- Short-term (session) memory ---

  router.post("/short-term/:sessionId", async (req: Request, res: Response) => {
    const sessionId = param(req, "sessionId");
    const { key, content, metadata, ttl } = req.body;
    if (!key || !content) {
      res.status(400).json({ error: "key and content are required" });
      return;
    }
    const memory = await ml.shortTerm.remember(
      sessionId,
      key,
      content,
      metadata,
      ttl,
    );
    res.status(201).json(memory);
  });

  router.get("/short-term/:sessionId/:key", async (req: Request, res: Response) => {
    const sessionId = param(req, "sessionId");
    const key = param(req, "key");
    const memory = await ml.shortTerm.recall(sessionId, key);
    if (!memory) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(memory);
  });

  router.get("/short-term/:sessionId", async (req: Request, res: Response) => {
    const sessionId = param(req, "sessionId");
    const memories = await ml.shortTerm.listSession(sessionId);
    res.json(memories);
  });

  router.delete("/short-term/:sessionId/:key", async (req: Request, res: Response) => {
    const sessionId = param(req, "sessionId");
    const key = param(req, "key");
    const deleted = await ml.shortTerm.forget(sessionId, key);
    res.json({ deleted });
  });

  router.delete("/short-term/:sessionId", async (req: Request, res: Response) => {
    const sessionId = param(req, "sessionId");
    await ml.shortTerm.clearSession(sessionId);
    res.json({ cleared: true });
  });

  // --- Long-term memory ---

  router.post("/long-term", async (req: Request, res: Response) => {
    const { key, content, metadata, namespace } = req.body;
    if (!key || !content) {
      res.status(400).json({ error: "key and content are required" });
      return;
    }
    const memory = await ml.longTerm.store(key, content, metadata, namespace);
    res.status(201).json(memory);
  });

  router.get("/long-term/:key", async (req: Request, res: Response) => {
    const namespace = req.query.namespace as string | undefined;
    const key = param(req, "key");
    const memory = await ml.longTerm.retrieve(key, namespace);
    if (!memory) {
      res.status(404).json({ error: "not found" });
      return;
    }
    res.json(memory);
  });

  router.delete("/long-term/:key", async (req: Request, res: Response) => {
    const namespace = req.query.namespace as string | undefined;
    const key = param(req, "key");
    const deleted = await ml.longTerm.remove(key, namespace);
    res.json({ deleted });
  });

  router.post("/long-term/search", async (req: Request, res: Response) => {
    const results = await ml.longTerm.search(req.body);
    res.json(results);
  });

  // --- Semantic memory ---

  router.post("/semantic", async (req: Request, res: Response) => {
    const { content, metadata, namespace, key } = req.body;
    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }
    const memory = await ml.semantic.add(content, metadata, namespace, key);
    res.status(201).json(memory);
  });

  router.post("/semantic/search", async (req: Request, res: Response) => {
    const results = await ml.semantic.search(req.body);
    res.json(results);
  });

  router.delete("/semantic/:key", async (req: Request, res: Response) => {
    const namespace = req.query.namespace as string | undefined;
    const key = param(req, "key");
    const deleted = await ml.semantic.remove(key, namespace);
    res.json({ deleted });
  });

  return router;
}
