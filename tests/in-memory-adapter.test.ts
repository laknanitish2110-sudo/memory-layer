import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryAdapter } from "../src/adapters/in-memory.js";
import type { MemoryRecord } from "../src/types.js";

function makeRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: "id-1",
    userId: "user-1",
    key: "test-key",
    value: "test-value",
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("InMemoryAdapter", () => {
  let adapter: InMemoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryAdapter();
  });

  it("get returns null when empty", async () => {
    expect(await adapter.get("u1", "k1")).toBeNull();
  });

  it("set then get round-trips", async () => {
    const rec = makeRecord();
    await adapter.set(rec);
    const got = await adapter.get("user-1", "test-key");
    expect(got).toEqual(rec);
  });

  it("set overwrites same userId+key", async () => {
    await adapter.set(makeRecord({ value: "old" }));
    await adapter.set(makeRecord({ value: "new" }));
    const got = await adapter.get("user-1", "test-key");
    expect(got!.value).toBe("new");
  });

  it("different users are isolated", async () => {
    await adapter.set(makeRecord({ userId: "u1", key: "k", value: "a" }));
    await adapter.set(makeRecord({ userId: "u2", key: "k", value: "b" }));

    expect((await adapter.get("u1", "k"))!.value).toBe("a");
    expect((await adapter.get("u2", "k"))!.value).toBe("b");
  });

  it("delete returns true for existing key", async () => {
    await adapter.set(makeRecord());
    expect(await adapter.delete("user-1", "test-key")).toBe(true);
    expect(await adapter.get("user-1", "test-key")).toBeNull();
  });

  it("delete returns false for missing key", async () => {
    expect(await adapter.delete("u", "nope")).toBe(false);
  });

  it("list returns all records for a user", async () => {
    await adapter.set(makeRecord({ key: "a" }));
    await adapter.set(makeRecord({ key: "b" }));
    await adapter.set(makeRecord({ userId: "other", key: "c" }));

    const list = await adapter.list("user-1");
    expect(list).toHaveLength(2);
  });

  it("list filters by appId", async () => {
    await adapter.set(makeRecord({ key: "a", appId: "app-1" }));
    await adapter.set(makeRecord({ key: "b", appId: "app-2" }));

    const list = await adapter.list("user-1", { appId: "app-1" });
    expect(list).toHaveLength(1);
    expect(list[0].key).toBe("a");
  });

  it("list filters by metadata", async () => {
    await adapter.set(makeRecord({ key: "a", metadata: { env: "prod" } }));
    await adapter.set(makeRecord({ key: "b", metadata: { env: "dev" } }));

    const list = await adapter.list("user-1", { metadata: { env: "prod" } });
    expect(list).toHaveLength(1);
    expect(list[0].key).toBe("a");
  });

  it("list respects limit and offset", async () => {
    for (let i = 0; i < 10; i++) {
      await adapter.set(makeRecord({ id: `id-${i}`, key: `k${i}` }));
    }
    const page = await adapter.list("user-1", { limit: 3, offset: 2 });
    expect(page).toHaveLength(3);
  });

  it("clear removes all records for the user", async () => {
    await adapter.set(makeRecord({ key: "a" }));
    await adapter.set(makeRecord({ key: "b" }));
    await adapter.set(makeRecord({ userId: "other", key: "c" }));

    await adapter.clear("user-1");

    expect(await adapter.list("user-1")).toHaveLength(0);
    expect(await adapter.list("other")).toHaveLength(1);
  });
});
