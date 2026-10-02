import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { MemoryStore } from "../src/store.js";
import { UserProfile } from "../src/profile.js";
import { InMemoryAdapter } from "../src/adapters/in-memory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapter = new InMemoryAdapter();
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getProfile(userId: string, appId?: string): UserProfile {
  const store = new MemoryStore({ adapter, appId });
  return new UserProfile(store, userId);
}

app.post("/api/profile/:userId/interact", async (req, res) => {
  const profile = getProfile(req.params.userId as string, req.body.appId);
  const mem = await profile.trackInteraction(req.body);
  res.status(201).json(mem.toJSON());
});

app.post("/api/profile/:userId/trait", async (req, res) => {
  const { name, trait, appId } = req.body;
  const profile = getProfile(req.params.userId as string, appId);
  const mem = await profile.setTrait(name, trait, appId);
  res.status(201).json(mem.toJSON());
});

app.get("/api/profile/:userId/context", async (req, res) => {
  const appId = req.query.appId as string | undefined;
  const profile = getProfile(req.params.userId as string, appId);
  const ctx = await profile.contextForAI({ appId });
  res.json({ context: ctx });
});

app.get("/api/profile/:userId/summary", async (req, res) => {
  const profile = getProfile(req.params.userId as string);
  const summary = await profile.getEmotionalSummary();
  res.json(summary);
});

app.post("/api/profile/:userId/reset", async (req, res) => {
  const store = new MemoryStore({ adapter });
  await store.clear(req.params.userId as string);
  res.json({ cleared: true });
});

app.get("/api/memories/:userId", async (req, res) => {
  const store = new MemoryStore({ adapter });
  const memories = await store.list(req.params.userId as string);
  res.json(memories.map((m) => m.toJSON()));
});

app.listen(3210, () => {
  console.log("");
  console.log("  Memory Layer Demo");
  console.log("  ────────────────────────────────────");
  console.log("  Landing page:    http://localhost:3210");
  console.log("  Tutor app:       http://localhost:3210/tutor.html");
  console.log("  Code assistant:  http://localhost:3210/assistant.html");
  console.log("  ────────────────────────────────────");
  console.log("");
});
