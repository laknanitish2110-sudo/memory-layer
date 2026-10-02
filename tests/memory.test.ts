import { describe, it, expect, beforeEach } from "vitest";
import { MemoryLayer } from "../src/memory/index.js";
import { InMemoryStorage } from "../src/storage/index.js";
import { LocalEmbeddingProvider } from "../src/utils/embeddings.js";

describe("MemoryLayer", () => {
  let ml: MemoryLayer;

  beforeEach(() => {
    ml = new MemoryLayer({
      storage: new InMemoryStorage(),
      embedding: new LocalEmbeddingProvider(64),
    });
  });

  describe("ShortTermMemory", () => {
    it("stores and retrieves session memory", async () => {
      const mem = await ml.shortTerm.remember("s1", "greeting", "Hello!");
      expect(mem.content).toBe("Hello!");
      expect(mem.namespace).toBe("session:s1");

      const recalled = await ml.shortTerm.recall("s1", "greeting");
      expect(recalled?.content).toBe("Hello!");
    });

    it("returns null for missing keys", async () => {
      const result = await ml.shortTerm.recall("s1", "nope");
      expect(result).toBeNull();
    });

    it("lists all session memories", async () => {
      await ml.shortTerm.remember("s1", "a", "value-a");
      await ml.shortTerm.remember("s1", "b", "value-b");
      await ml.shortTerm.remember("s2", "c", "value-c");

      const list = await ml.shortTerm.listSession("s1");
      expect(list).toHaveLength(2);
    });

    it("clears session memories", async () => {
      await ml.shortTerm.remember("s1", "a", "value-a");
      await ml.shortTerm.clearSession("s1");
      const list = await ml.shortTerm.listSession("s1");
      expect(list).toHaveLength(0);
    });

    it("forgets individual keys", async () => {
      await ml.shortTerm.remember("s1", "a", "value");
      const deleted = await ml.shortTerm.forget("s1", "a");
      expect(deleted).toBe(true);
      const result = await ml.shortTerm.recall("s1", "a");
      expect(result).toBeNull();
    });
  });

  describe("LongTermMemory", () => {
    it("stores and retrieves persistent memory", async () => {
      const mem = await ml.longTerm.store("user-pref", "dark mode");
      expect(mem.content).toBe("dark mode");

      const recalled = await ml.longTerm.retrieve("user-pref");
      expect(recalled?.content).toBe("dark mode");
    });

    it("updates existing memory", async () => {
      await ml.longTerm.store("pref", "light mode");
      const updated = await ml.longTerm.store("pref", "dark mode");
      expect(updated.content).toBe("dark mode");

      const result = await ml.longTerm.retrieve("pref");
      expect(result?.content).toBe("dark mode");
    });

    it("supports namespaces", async () => {
      await ml.longTerm.store("theme", "dark", {}, "user-123");
      await ml.longTerm.store("theme", "light", {}, "user-456");

      const u1 = await ml.longTerm.retrieve("theme", "user-123");
      const u2 = await ml.longTerm.retrieve("theme", "user-456");
      expect(u1?.content).toBe("dark");
      expect(u2?.content).toBe("light");
    });

    it("searches by metadata", async () => {
      await ml.longTerm.store("a", "val-a", { priority: "high" });
      await ml.longTerm.store("b", "val-b", { priority: "low" });

      const results = await ml.longTerm.search({
        metadata: { priority: "high" },
      });
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe("a");
    });
  });

  describe("SemanticMemory", () => {
    it("adds and searches by similarity", async () => {
      await ml.semantic.add("the weather is sunny today");
      await ml.semantic.add("my favorite food is pizza");
      await ml.semantic.add("it is a bright and warm day");

      const results = await ml.semantic.search({
        text: "sunny weather",
        topK: 2,
      });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
    });

    it("respects topK parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await ml.semantic.add(`document number ${i}`);
      }

      const results = await ml.semantic.search({ text: "document", topK: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("removes semantic memories", async () => {
      await ml.semantic.add("test content", {}, undefined, "test-key");
      const deleted = await ml.semantic.remove("test-key");
      expect(deleted).toBe(true);
    });
  });
});
