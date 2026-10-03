import type { TokenFamily, TokenRefreshResult, AccessToken, RefreshToken } from "./types.js";

export interface TokenFamilyStore {
  getFamily(familyId: string): Promise<TokenFamily | null>;
  compareAndSwapGeneration(
    familyId: string,
    expectedGeneration: number,
    newGeneration: number
  ): Promise<boolean>;
  revokeFamily(familyId: string, revokedAt: string): Promise<void>;
}

export interface TokenIssuer {
  issueAccessToken(familyId: string, bindingId: string): AccessToken;
  issueRefreshToken(familyId: string, generation: number): RefreshToken;
}

export async function refreshTokenFamily(
  store: TokenFamilyStore,
  issuer: TokenIssuer,
  familyId: string,
  presentedGeneration: number,
  now: string
): Promise<TokenRefreshResult> {
  const family = await store.getFamily(familyId);
  if (!family) {
    return {
      status: "reuse_detected",
      family_id: familyId,
      presented_generation: presentedGeneration,
      current_generation: -1,
    };
  }

  if (family.revoked_at !== null) {
    return {
      status: "reuse_detected",
      family_id: familyId,
      presented_generation: presentedGeneration,
      current_generation: family.current_generation,
    };
  }

  if (presentedGeneration !== family.current_generation) {
    await store.revokeFamily(familyId, now);
    return {
      status: "reuse_detected",
      family_id: familyId,
      presented_generation: presentedGeneration,
      current_generation: family.current_generation,
    };
  }

  const newGeneration = presentedGeneration + 1;
  const swapped = await store.compareAndSwapGeneration(
    familyId,
    presentedGeneration,
    newGeneration
  );

  if (!swapped) {
    await store.revokeFamily(familyId, now);
    return {
      status: "reuse_detected",
      family_id: familyId,
      presented_generation: presentedGeneration,
      current_generation: presentedGeneration,
    };
  }

  return {
    status: "rotated",
    access_token: issuer.issueAccessToken(familyId, family.binding_id),
    refresh_token: issuer.issueRefreshToken(familyId, newGeneration),
    new_generation: newGeneration,
  };
}
