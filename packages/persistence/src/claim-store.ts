import type { PersistenceClient } from "./client.js";
import type {
  ClaimStore,
  ClaimQuery,
} from "@memory-layer/protocol/src/memory/repository.js";
import type {
  Claim,
  ClaimVersion,
  Sensitivity,
  SharingPolicy,
} from "@memory-layer/protocol/src/memory/types.js";

function rowToClaim(row: Record<string, unknown>): Claim {
  return {
    id: row.id as string,
    passport_id: row.passport_id as string,
    subject: row.subject as string,
    predicate: row.predicate as string,
    value: row.value as string,
    qualifiers: (row.qualifiers as Record<string, string>) ?? {},
    category: row.category as Claim["category"],
    tags: (row.tags as string[]) ?? [],
    state: row.state as Claim["state"],
    declared_state: (row.declared_state as Claim["declared_state"]) ?? null,
    observed_state: (row.observed_state as Claim["observed_state"]) ?? null,
    volatility: row.volatility as Claim["volatility"],
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    last_confirmed_at: (row.last_confirmed_at as string) ?? null,
    expires_at: (row.expires_at as string) ?? null,
    sensitivity: row.sensitivity as Sensitivity,
    sharing_policy: (row.sharing_policy as SharingPolicy) ?? {
      type: "grant_controlled",
    },
    evidence_ids: [],
    purged_references: [],
    contradicted_by: [],
    current_version_id: row.current_version_id as string,
    deleted: row.deleted as boolean,
    deleted_at: (row.deleted_at as string) ?? null,
  };
}

function rowToVersion(row: Record<string, unknown>): ClaimVersion {
  return {
    id: row.id as string,
    claim_id: row.claim_id as string,
    version_number: row.version_number as number,
    previous_version_id: (row.previous_version_id as string) ?? null,
    value: row.value as string,
    qualifiers: (row.qualifiers as Record<string, string>) ?? {},
    state: row.state as ClaimVersion["state"],
    changed_by: row.changed_by as string,
    changed_at: row.changed_at as string,
    change_reason: row.change_reason as string,
    evidence_ids: (row.evidence_ids as string[]) ?? [],
  };
}

export class SupabaseClaimStore implements ClaimStore {
  constructor(private client: PersistenceClient) {}

  async getClaim(passportId: string, claimId: string): Promise<Claim | null> {
    const { data, error } = await this.client
      .from("claims")
      .select("*")
      .eq("id", claimId)
      .eq("passport_id", passportId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return rowToClaim(data);
  }

  async getClaims(passportId: string, query: ClaimQuery): Promise<Claim[]> {
    let q = this.client
      .from("claims")
      .select("*")
      .eq("passport_id", passportId);

    if (!query.include_deleted) {
      q = q.eq("deleted", false);
    }

    if (query.categories && query.categories.length > 0) {
      q = q.in("category", query.categories);
    }

    if (query.states && query.states.length > 0) {
      q = q.in("state", query.states);
    }

    if (query.subject) {
      q = q.eq("subject", query.subject);
    }

    if (query.predicate) {
      q = q.eq("predicate", query.predicate);
    }

    if (query.sensitivity_ceiling) {
      const ceilingOrder: Record<Sensitivity, number> = {
        public: 0,
        personal: 1,
        sensitive: 2,
        restricted: 3,
      };
      const levels = (
        ["public", "personal", "sensitive", "restricted"] as Sensitivity[]
      ).filter((s) => ceilingOrder[s] <= ceilingOrder[query.sensitivity_ceiling!]);
      q = q.in("sensitivity", levels);
    }

    if (query.limit) {
      q = q.limit(query.limit);
    }

    if (query.offset) {
      q = q.range(query.offset, query.offset + (query.limit ?? 100) - 1);
    }

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(rowToClaim);
  }

  async createClaim(passportId: string, claim: Claim): Promise<void> {
    const { error } = await this.client.from("claims").insert({
      id: claim.id,
      passport_id: passportId,
      subject: claim.subject,
      predicate: claim.predicate,
      value: claim.value,
      qualifiers: claim.qualifiers,
      category: claim.category,
      tags: claim.tags,
      state: claim.state,
      declared_state: claim.declared_state,
      observed_state: claim.observed_state,
      volatility: claim.volatility,
      created_at: claim.created_at,
      updated_at: claim.updated_at,
      last_confirmed_at: claim.last_confirmed_at,
      expires_at: claim.expires_at,
      sensitivity: claim.sensitivity,
      sharing_policy: claim.sharing_policy,
      current_version_id: claim.current_version_id,
      deleted: claim.deleted,
      deleted_at: claim.deleted_at,
    });
    if (error) throw error;
  }

  async updateClaim(passportId: string, claim: Claim): Promise<void> {
    const { error } = await this.client
      .from("claims")
      .update({
        value: claim.value,
        qualifiers: claim.qualifiers,
        state: claim.state,
        declared_state: claim.declared_state,
        observed_state: claim.observed_state,
        volatility: claim.volatility,
        updated_at: claim.updated_at,
        last_confirmed_at: claim.last_confirmed_at,
        expires_at: claim.expires_at,
        sensitivity: claim.sensitivity,
        sharing_policy: claim.sharing_policy,
        current_version_id: claim.current_version_id,
        deleted: claim.deleted,
        deleted_at: claim.deleted_at,
      })
      .eq("id", claim.id)
      .eq("passport_id", passportId);
    if (error) throw error;
  }

  async getClaimVersions(
    passportId: string,
    claimId: string
  ): Promise<ClaimVersion[]> {
    const claim = await this.getClaim(passportId, claimId);
    if (!claim) return [];

    const { data, error } = await this.client
      .from("claim_versions")
      .select("*")
      .eq("claim_id", claimId)
      .order("version_number", { ascending: true });

    if (error) throw error;
    return (data ?? []).map(rowToVersion);
  }

  async createClaimVersion(
    _passportId: string,
    version: ClaimVersion
  ): Promise<void> {
    const { error } = await this.client.from("claim_versions").insert({
      id: version.id,
      claim_id: version.claim_id,
      version_number: version.version_number,
      previous_version_id: version.previous_version_id,
      value: version.value,
      qualifiers: version.qualifiers,
      state: version.state,
      changed_by: version.changed_by,
      changed_at: version.changed_at,
      change_reason: version.change_reason,
      evidence_ids: version.evidence_ids,
    });
    if (error) throw error;
  }

  async findMatchingClaim(
    passportId: string,
    subject: string,
    predicate: string,
    _qualifiers: Record<string, string>
  ): Promise<Claim | null> {
    const { data, error } = await this.client
      .from("claims")
      .select("*")
      .eq("passport_id", passportId)
      .eq("subject", subject)
      .eq("predicate", predicate)
      .eq("deleted", false)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return rowToClaim(data);
  }

  async countActiveClaimsByCategory(
    passportId: string,
    category: Claim["category"]
  ): Promise<number> {
    const { count, error } = await this.client
      .from("claims")
      .select("*", { count: "exact", head: true })
      .eq("passport_id", passportId)
      .eq("category", category)
      .eq("deleted", false);

    if (error) throw error;
    return count ?? 0;
  }

  async countNewClaimsToday(
    passportId: string,
    category: Claim["category"]
  ): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count, error } = await this.client
      .from("claims")
      .select("*", { count: "exact", head: true })
      .eq("passport_id", passportId)
      .eq("category", category)
      .gte("created_at", today.toISOString());

    if (error) throw error;
    return count ?? 0;
  }

  async getLastObservationTime(
    passportId: string,
    subject: string,
    predicate: string,
    value: string
  ): Promise<string | null> {
    const { data, error } = await this.client
      .from("observations")
      .select("submitted_at, bindings!inner(passport_id)")
      .eq("subject", subject)
      .eq("predicate", predicate)
      .eq("value", value)
      .eq("bindings.passport_id", passportId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return data.submitted_at as string;
  }
}
