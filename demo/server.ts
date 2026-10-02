import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { MemoryStore } from "../src/store.js";
import { InMemoryAdapter } from "../src/adapters/in-memory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapter = new InMemoryAdapter();
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/memories/:userId", async (req, res) => {
  const store = new MemoryStore({ adapter });
  const memories = await store.list(req.params.userId as string);
  res.json(memories.map((m) => m.toJSON()));
});

app.post("/api/memories", async (req, res) => {
  const { userId, key, value, appId } = req.body;
  const store = new MemoryStore({ adapter, appId });
  const mem = await store.set(userId, key, value);
  res.status(201).json(mem.toJSON());
});

app.delete("/api/memories/:userId/:key", async (req, res) => {
  const store = new MemoryStore({ adapter });
  const deleted = await store.delete(
    req.params.userId as string,
    req.params.key as string,
  );
  res.json({ deleted });
});

app.listen(3210, () => {
  console.log("Demo running at http://localhost:3210");
  console.log("  App A (write): http://localhost:3210/app-a.html");
  console.log("  App B (read):  http://localhost:3210/app-b.html");
});
