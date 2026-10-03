import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "../src/store.js";
import { Memory } from "../src/memory.js";
import { InMemoryAdapter } from "../src/adapters/in-memory.js";

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore({ adapter: new InMemoryAdapter() });
  });

  describe("set / get", () => {
    it("stores and retrieves a value", async () => {
      const mem = await store.set("user-1", "name", "Alice");
      expect(mem).toBeInstanceOf(Memory);
      expect(mem.value).toBe("Alice");
      expect(mem.userId).toBe("user-1");
      expect(mem.key).toBe("name");

      const got = await store.get("user-1", "name");
      expect(got).not.toBeNull();
      expect(got!.value).toBe("Alice");
    });

    it("stores complex values", async () => {
      const prefs = { theme: "dark", fontSize: 14, langs: ["en", "es"] };
      await store.set("user-1", "preferences", prefs);

      const got = await store.get("user-1", "preferences");
      expect(got!.value).toEqual(prefs);
    });

    it("updates existing key preserving id and createdAt", async () => {
      const first = await store.set("user-1", "color", "blue");
      const second = await store.set("user-1", "color", "red");

      expect(second.id).toBe(first.id);
      expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
      expect(second.value).toBe("red");
    });

    it("returns null for missing key", async () => {
      const got = await store.get("user-1", "nope");
      expect(got).toBeNull();
    });

    it("attaches store-level appId", async () => {
      const appStore = new MemoryStore({
        adapter: new InMemoryAdapter(),
        appId: "my-app",
      });
      const mem = await appStore.set("user-1", "k", "v");
      expect(mem.appId).toBe("my-app");
    });

    it("per-call appId overrides store-level", async () => {
      const appStore = new MemoryStore({
        adapter: new InMemoryAdapter(),
        appId: "default-app",
      });
      const mem = await appStore.set("user-1", "k", "v", {
        appId: "other-app",
      });
      expect(mem.appId).toBe("other-app");
    });

    it("stores metadata", async () => {
      await store.set("user-1", "note", "hello", {
        metadata: { tag: "greeting" },
      });
      const got = await store.get("user-1", "note");
      expect(got!.metadata).toEqual({ tag: "greeting" });
    });
  });

  describe("delete", () => {
    it("removes a key", async () => {
      await store.set("user-1", "temp", "data");
      const deleted = await store.delete("user-1", "temp");
      expect(deleted).toBe(true);
      expect(await store.get("user-1", "temp")).toBeNull();
    });

    it("returns false for missing key", async () => {
      const deleted = await store.delete("user-1", "ghost");
      expect(deleted).toBe(false);
    });
  });

  describe("list", () => {
    it("lists all memories for a user", async () => {
      await store.set("user-1", "a", 1);
      await store.set("user-1", "b", 2);
      await store.set("user-2", "c", 3);

      const list = await store.list("user-1");
      expect(list).toHaveLength(2);
      expect(list.every((m) => m instanceof Memory)).toBe(true);
      expect(list.every((m) => m.userId === "user-1")).toBe(true);
    });

    it("filters by appId", async () => {
      await store.set("user-1", "x", 1, { appId: "app-a" });
      await store.set("user-1", "y", 2, { appId: "app-b" });

      const list = await store.list("user-1", { appId: "app-a" });
      expect(list).toHaveLength(1);
      expect(list[0].key).toBe("x");
    });

    it("filters by metadata", async () => {
      await store.set("user-1", "p", "v1", { metadata: { priority: "high" } });
      await store.set("user-1", "q", "v2", { metadata: { priority: "low" } });

      const list = await store.list("user-1", {
        metadata: { priority: "high" },
      });
      expect(list).toHaveLength(1);
      expect(list[0].key).toBe("p");
    });

    it("respects limit and offset", async () => {
      for (let i = 0; i < 5; i++) {
        await store.set("user-1", `item-${i}`, i);
      }
      const page = await store.list("user-1", { limit: 2, offset: 1 });
      expect(page).toHaveLength(2);
    });
  });

  describe("clear", () => {
    it("removes all memories for a user", async () => {
      await store.set("user-1", "a", 1);
      await store.set("user-1", "b", 2);
      await store.set("user-2", "c", 3);

      await store.clear("user-1");

      expect(await store.list("user-1")).toHaveLength(0);
      expect(await store.list("user-2")).toHaveLength(1);
    });
  });

  describe("cross-app memory", () => {
    it("memories set by one app are readable by another", async () => {
      const appA = new MemoryStore({
        adapter: new InMemoryAdapter(),
        appId: "app-a",
      });
      // Both stores share the same adapter to simulate cross-app
      const sharedAdapter = new InMemoryAdapter();
      const storeA = new MemoryStore({ adapter: sharedAdapter, appId: "app-a" });
      const storeB = new MemoryStore({ adapter: sharedAdapter, appId: "app-b" });

      await storeA.set("user-1", "theme", "dark");
      const fromB = await storeB.get("user-1", "theme");

      expect(fromB).not.toBeNull();
      expect(fromB!.value).toBe("dark");
      expect(fromB!.appId).toBe("app-a");
    });
  });
});
