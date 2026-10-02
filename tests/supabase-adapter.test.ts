import { describe, it, expect, beforeEach, vi } from "vitest";
import { SupabaseAdapter } from "../src/adapters/supabase.js";
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

function createMockClient() {
  const chainable = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  return {
    from: vi.fn().mockReturnValue(chainable),
    _chain: chainable,
  };
}

describe("SupabaseAdapter", () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let adapter: SupabaseAdapter;

  beforeEach(() => {
    mockClient = createMockClient();
    adapter = new SupabaseAdapter(mockClient as any);
  });

  describe("get", () => {
    it("returns null when row not found", async () => {
      mockClient._chain.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await adapter.get("user-1", "missing");
      expect(result).toBeNull();
      expect(mockClient.from).toHaveBeenCalledWith("memories");
    });

    it("returns mapped record when found", async () => {
      mockClient._chain.maybeSingle.mockResolvedValue({
        data: {
          id: "abc",
          user_id: "user-1",
          key: "theme",
          value: "dark",
          metadata: { source: "ui" },
          app_id: "my-app",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-06-01T00:00:00Z",
        },
        error: null,
      });

      const result = await adapter.get("user-1", "theme");
      expect(result).toEqual({
        id: "abc",
        userId: "user-1",
        key: "theme",
        value: "dark",
        metadata: { source: "ui" },
        appId: "my-app",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-06-01T00:00:00Z",
      });
    });

    it("throws on supabase error", async () => {
      mockClient._chain.maybeSingle.mockResolvedValue({
        data: null,
        error: { message: "connection failed" },
      });

      await expect(adapter.get("u", "k")).rejects.toThrow("supabase get:");
    });
  });

  describe("set", () => {
    it("upserts with correct column mapping", async () => {
      mockClient._chain.upsert = vi.fn().mockResolvedValue({ error: null });

      const record = makeRecord({ appId: "app-x" });
      await adapter.set(record);

      expect(mockClient._chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-1",
          key: "test-key",
          app_id: "app-x",
        }),
        { onConflict: "user_id,key" },
      );
    });

    it("throws on upsert error", async () => {
      mockClient._chain.upsert = vi
        .fn()
        .mockResolvedValue({ error: { message: "conflict" } });

      await expect(adapter.set(makeRecord())).rejects.toThrow("supabase set:");
    });
  });

  describe("delete", () => {
    it("returns true when rows deleted", async () => {
      // delete().eq().eq() chain needs to resolve with count
      mockClient._chain.eq = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
      });

      const result = await adapter.delete("user-1", "test-key");
      expect(result).toBe(true);
    });

    it("returns false when no rows matched", async () => {
      mockClient._chain.eq = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ count: 0, error: null }),
      });

      const result = await adapter.delete("user-1", "nope");
      expect(result).toBe(false);
    });
  });

  describe("list", () => {
    it("returns mapped records", async () => {
      mockClient._chain.order = vi.fn().mockResolvedValue({
        data: [
          {
            id: "r1",
            user_id: "user-1",
            key: "a",
            value: 1,
            metadata: {},
            app_id: null,
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          },
        ],
        error: null,
      });

      const list = await adapter.list("user-1");
      expect(list).toHaveLength(1);
      expect(list[0].userId).toBe("user-1");
      expect(list[0].appId).toBeUndefined();
    });

    it("throws on error", async () => {
      mockClient._chain.order = vi.fn().mockResolvedValue({
        data: null,
        error: { message: "timeout" },
      });

      await expect(adapter.list("u")).rejects.toThrow("supabase list:");
    });
  });

  describe("clear", () => {
    it("deletes all user records", async () => {
      mockClient._chain.eq = vi.fn().mockResolvedValue({ error: null });

      await adapter.clear("user-1");
      expect(mockClient.from).toHaveBeenCalledWith("memories");
    });

    it("throws on error", async () => {
      mockClient._chain.eq = vi
        .fn()
        .mockResolvedValue({ error: { message: "denied" } });

      await expect(adapter.clear("u")).rejects.toThrow("supabase clear:");
    });
  });
});
