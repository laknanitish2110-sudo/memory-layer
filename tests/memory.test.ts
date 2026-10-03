import { describe, it, expect } from "vitest";
import { Memory } from "../src/memory.js";
import type { MemoryRecord } from "../src/types.js";

describe("Memory", () => {
  const record: MemoryRecord = {
    id: "abc-123",
    userId: "user-1",
    key: "theme",
    value: "dark",
    metadata: { source: "settings" },
    appId: "app-a",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-06-15T12:00:00.000Z",
  };

  it("constructs from a MemoryRecord", () => {
    const mem = new Memory(record);
    expect(mem.id).toBe("abc-123");
    expect(mem.userId).toBe("user-1");
    expect(mem.key).toBe("theme");
    expect(mem.value).toBe("dark");
    expect(mem.metadata).toEqual({ source: "settings" });
    expect(mem.appId).toBe("app-a");
    expect(mem.createdAt).toBeInstanceOf(Date);
    expect(mem.updatedAt).toBeInstanceOf(Date);
  });

  it("round-trips through toJSON", () => {
    const mem = new Memory(record);
    const json = mem.toJSON();
    expect(json).toEqual(record);
  });

  it("handles missing appId", () => {
    const { appId: _, ...noApp } = record;
    const mem = new Memory(noApp);
    expect(mem.appId).toBeUndefined();
    expect(mem.toJSON().appId).toBeUndefined();
  });
});
