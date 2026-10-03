import type { PersistenceClient } from "./client.js";
import type { TokenFamilyStore } from "@memory-layer/protocol/src/credentials/token-family.js";
import type { TokenFamily } from "@memory-layer/protocol/src/credentials/types.js";

function rowToFamily(row: Record<string, unknown>): TokenFamily {
  return {
    family_id: row.family_id as string,
    binding_id: row.binding_id as string,
    current_generation: row.current_generation as number,
    created_at: row.created_at as string,
    revoked_at: (row.revoked_at as string) ?? null,
  };
}

export class SupabaseTokenFamilyStore implements TokenFamilyStore {
  constructor(private client: PersistenceClient) {}

  async getFamily(familyId: string): Promise<TokenFamily | null> {
    const { data, error } = await this.client
      .from("token_families")
      .select("*")
      .eq("family_id", familyId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return rowToFamily(data);
  }

  async compareAndSwapGeneration(
    familyId: string,
    expectedGeneration: number,
    _newGeneration: number
  ): Promise<boolean> {
    const { data, error } = await this.client.rpc("token_family_cas", {
      p_family_id: familyId,
      p_expected_generation: expectedGeneration,
    });

    if (error) throw error;
    return (data as number) > 0;
  }

  async revokeFamily(familyId: string, revokedAt: string): Promise<void> {
    const { error } = await this.client
      .from("token_families")
      .update({ revoked_at: revokedAt })
      .eq("family_id", familyId);
    if (error) throw error;
  }
}
