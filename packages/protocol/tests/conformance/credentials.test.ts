import { describe, it, expect } from "vitest";
import {
  refreshTokenFamily,
  type TokenFamilyStore,
  type TokenIssuer,
} from "../../src/credentials/token-family.js";
import type { TokenFamily, AccessToken, RefreshToken } from "../../src/credentials/types.js";

function makeStore(family: TokenFamily | null): TokenFamilyStore {
  let state = family ? { ...family } : null;
  return {
    async getFamily(familyId: string) {
      return state && state.family_id === familyId ? { ...state } : null;
    },
    async compareAndSwapGeneration(
      familyId: string,
      expected: number,
      next: number
    ) {
      if (state && state.family_id === familyId && state.current_generation === expected) {
        state.current_generation = next;
        return true;
      }
      return false;
    },
    async revokeFamily(familyId: string, revokedAt: string) {
      if (state && state.family_id === familyId) {
        state.revoked_at = revokedAt;
      }
    },
  };
}

const issuer: TokenIssuer = {
  issueAccessToken(familyId: string, bindingId: string): AccessToken {
    return {
      token_hash: `at_${Date.now()}`,
      family_id: familyId,
      binding_id: bindingId,
      issued_at: "2024-01-01T00:00:00Z",
      expires_at: "2024-01-01T01:00:00Z",
    };
  },
  issueRefreshToken(familyId: string, generation: number): RefreshToken {
    return {
      token_hash: `rt_${generation}`,
      family_id: familyId,
      generation,
      issued_at: "2024-01-01T00:00:00Z",
      expires_at: "2024-01-08T00:00:00Z",
    };
  },
};

describe("Token Family (CAS rotation)", () => {
  it("rotates successfully on correct generation", async () => {
    const family: TokenFamily = {
      family_id: "fam_1",
      binding_id: "binding_1",
      current_generation: 17,
      created_at: "2024-01-01T00:00:00Z",
      revoked_at: null,
    };
    const store = makeStore(family);
    const result = await refreshTokenFamily(store, issuer, "fam_1", 17, "2024-06-01T00:00:00Z");

    expect(result.status).toBe("rotated");
    if (result.status === "rotated") {
      expect(result.new_generation).toBe(18);
      expect(result.refresh_token.generation).toBe(18);
    }
  });

  it("detects token reuse — revokes entire family", async () => {
    const family: TokenFamily = {
      family_id: "fam_1",
      binding_id: "binding_1",
      current_generation: 18,
      created_at: "2024-01-01T00:00:00Z",
      revoked_at: null,
    };
    const store = makeStore(family);

    const result = await refreshTokenFamily(store, issuer, "fam_1", 17, "2024-06-01T00:00:00Z");

    expect(result.status).toBe("reuse_detected");
    if (result.status === "reuse_detected") {
      expect(result.presented_generation).toBe(17);
      expect(result.current_generation).toBe(18);
    }

    const fam = await store.getFamily("fam_1");
    expect(fam!.revoked_at).toBe("2024-06-01T00:00:00Z");
  });

  it("rejects when family already revoked", async () => {
    const family: TokenFamily = {
      family_id: "fam_1",
      binding_id: "binding_1",
      current_generation: 10,
      created_at: "2024-01-01T00:00:00Z",
      revoked_at: "2024-05-01T00:00:00Z",
    };
    const store = makeStore(family);

    const result = await refreshTokenFamily(store, issuer, "fam_1", 10, "2024-06-01T00:00:00Z");
    expect(result.status).toBe("reuse_detected");
  });

  it("rejects when family not found", async () => {
    const store = makeStore(null);
    const result = await refreshTokenFamily(store, issuer, "fam_nonexistent", 1, "2024-06-01T00:00:00Z");
    expect(result.status).toBe("reuse_detected");
    if (result.status === "reuse_detected") {
      expect(result.current_generation).toBe(-1);
    }
  });

  it("CAS race — concurrent refresh fails and revokes", async () => {
    const family: TokenFamily = {
      family_id: "fam_1",
      binding_id: "binding_1",
      current_generation: 5,
      created_at: "2024-01-01T00:00:00Z",
      revoked_at: null,
    };

    let casCallCount = 0;
    const racyStore: TokenFamilyStore = {
      async getFamily() {
        return { ...family };
      },
      async compareAndSwapGeneration() {
        casCallCount++;
        return false;
      },
      async revokeFamily(_id, revokedAt) {
        family.revoked_at = revokedAt;
      },
    };

    const result = await refreshTokenFamily(racyStore, issuer, "fam_1", 5, "2024-06-01T00:00:00Z");
    expect(result.status).toBe("reuse_detected");
    expect(family.revoked_at).toBe("2024-06-01T00:00:00Z");
  });
});
