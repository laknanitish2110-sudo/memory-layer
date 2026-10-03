import { describe, it, expect, beforeEach } from "vitest";
import { SupabaseTokenFamilyStore } from "../../src/token-store.js";
import { mockSupabaseClient, type MockClient } from "../helpers.js";

describe("SupabaseTokenFamilyStore — contract conformance", () => {
  let client: MockClient;
  let store: SupabaseTokenFamilyStore;

  const baseFamily = {
    family_id: "fam_1",
    binding_id: "binding_1",
    current_generation: 0,
    created_at: "2024-01-01T00:00:00Z",
    revoked_at: null,
  };

  beforeEach(() => {
    client = mockSupabaseClient();
    store = new SupabaseTokenFamilyStore(client as never);
  });

  it("getFamily returns null for unknown family", async () => {
    const result = await store.getFamily("nonexistent");
    expect(result).toBeNull();
  });

  it("getFamily maps row to TokenFamily type", async () => {
    client._seed("token_families", [baseFamily]);
    const result = await store.getFamily("fam_1");
    expect(result).not.toBeNull();
    expect(result!.family_id).toBe("fam_1");
    expect(result!.binding_id).toBe("binding_1");
    expect(result!.current_generation).toBe(0);
    expect(result!.revoked_at).toBeNull();
  });

  it("compareAndSwapGeneration calls token_family_cas RPC", async () => {
    client.rpc.mockResolvedValueOnce({ data: 1, error: null });
    const result = await store.compareAndSwapGeneration("fam_1", 0, 1);
    expect(result).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("token_family_cas", {
      p_family_id: "fam_1",
      p_expected_generation: 0,
    });
  });

  it("compareAndSwapGeneration returns false on CAS failure", async () => {
    client.rpc.mockResolvedValueOnce({ data: -1, error: null });
    const result = await store.compareAndSwapGeneration("fam_1", 0, 1);
    expect(result).toBe(false);
  });

  it("revokeFamily updates revoked_at", async () => {
    client._seed("token_families", [baseFamily]);
    await store.revokeFamily("fam_1", "2024-06-01T00:00:00Z");
    expect(client.from).toHaveBeenCalledWith("token_families");
  });

  it("getFamily returns revoked family with revoked_at set", async () => {
    client._seed("token_families", [
      { ...baseFamily, revoked_at: "2024-06-01T00:00:00Z" },
    ]);
    const result = await store.getFamily("fam_1");
    expect(result).not.toBeNull();
    expect(result!.revoked_at).toBe("2024-06-01T00:00:00Z");
  });
});
