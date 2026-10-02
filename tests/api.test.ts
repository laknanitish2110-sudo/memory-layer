import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createServer } from "../src/server.js";

describe("API", () => {
  let app: ReturnType<typeof createServer>["app"];

  beforeEach(() => {
    ({ app } = createServer());
  });

  it("GET /api/health returns ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  describe("Short-term memory API", () => {
    it("creates and retrieves session memory", async () => {
      const createRes = await request(app)
        .post("/api/memories/short-term/session-1")
        .send({ key: "mood", content: "happy" });
      expect(createRes.status).toBe(201);
      expect(createRes.body.content).toBe("happy");

      const getRes = await request(app).get(
        "/api/memories/short-term/session-1/mood",
      );
      expect(getRes.status).toBe(200);
      expect(getRes.body.content).toBe("happy");
    });

    it("returns 404 for missing memory", async () => {
      const res = await request(app).get(
        "/api/memories/short-term/session-1/missing",
      );
      expect(res.status).toBe(404);
    });

    it("validates required fields", async () => {
      const res = await request(app)
        .post("/api/memories/short-term/s1")
        .send({ key: "only-key" });
      expect(res.status).toBe(400);
    });
  });

  describe("Long-term memory API", () => {
    it("creates and retrieves long-term memory", async () => {
      const createRes = await request(app)
        .post("/api/memories/long-term")
        .send({ key: "user-name", content: "Alice" });
      expect(createRes.status).toBe(201);

      const getRes = await request(app).get("/api/memories/long-term/user-name");
      expect(getRes.status).toBe(200);
      expect(getRes.body.content).toBe("Alice");
    });

    it("searches long-term memory", async () => {
      await request(app)
        .post("/api/memories/long-term")
        .send({ key: "a", content: "val", metadata: { tag: "x" } });

      const res = await request(app)
        .post("/api/memories/long-term/search")
        .send({ metadata: { tag: "x" } });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe("Semantic memory API", () => {
    it("adds and searches semantic memory", async () => {
      await request(app)
        .post("/api/memories/semantic")
        .send({ content: "TypeScript is a typed superset of JavaScript" });

      const res = await request(app)
        .post("/api/memories/semantic/search")
        .send({ text: "JavaScript types", topK: 5 });
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it("validates content field", async () => {
      const res = await request(app)
        .post("/api/memories/semantic")
        .send({ metadata: { foo: "bar" } });
      expect(res.status).toBe(400);
    });
  });
});
